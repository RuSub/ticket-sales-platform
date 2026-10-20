import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventGenre, EventStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types.js';
import * as bcrypt from 'bcrypt';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { AppModule } from './../src/app.module.js';
import { NotificationService } from './../src/modules/notification/notification.service.js';
import { OutboxPublisher } from './../src/common/outbox/outbox.publisher.js';
import { prisma } from './../src/prisma/prisma.service.js';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integration-secret';
process.env.REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET ?? 'integration-refresh-secret';
process.env.SMTP_MODE = 'json';
process.env.SMTP_FROM = 'tickets@ticket-platform.local';
process.env.KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9093';

const PASSWORD = 'TestPass123!';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const canConnect = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (value: boolean) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    setTimeout(() => finish(false), 1500);
  });

const binaryParser = (res: NodeJS.ReadableStream, callback: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Notifications delivery (integration)', () => {
  let app: INestApplication<App>;
  let notifications: NotificationService;
  let outboxPublisher: OutboxPublisher;
  let kafkaReady = false;

  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const eventIds: string[] = [];
  const orderIds: string[] = [];
  const deliveryKeys: string[] = [];

  let buyerId: string;
  let buyerEmail: string;
  let buyerToken: string;
  let otherBuyerToken: string;
  let eventId: string;
  let seatId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const createUser = async (role: UserRole, label: string) => {
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@test.local`,
        passwordHash,
        role,
        fullName: `IT ${label}`,
      },
    });
    userIds.push(user.id);
    return user;
  };

  const login = async (email: string) => {
    const response = await http()
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(201);
    return response.body.accessToken as string;
  };

  const waitForDelivery = async (dedupeKey: string, status?: string, timeout = 10_000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const delivery = await prisma.notificationDelivery.findUnique({ where: { dedupeKey } });
      if (delivery && (!status || delivery.status === status)) {
        return delivery;
      }
      await sleep(100);
    }
    throw new Error(`delivery ${dedupeKey} did not reach ${status ?? 'any status'}`);
  };

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
    kafkaReady = await canConnect('127.0.0.1', 9093);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    notifications = app.get(NotificationService);
    outboxPublisher = app.get(OutboxPublisher);

    const buyer = await createUser(UserRole.BUYER, 'notif-buyer');
    buyerId = buyer.id;
    buyerEmail = buyer.email;
    await createUser(UserRole.BUYER, 'notif-other');

    buyerToken = await login(buyer.email);
    otherBuyerToken = await login(`notif-other-${suffix}@test.local`);

    const organizer = await createUser(UserRole.ORGANIZER, 'notif-org');
    const event = await prisma.event.create({
      data: {
        organizerId: organizer.id,
        title: `IT Notifications ${suffix}`,
        eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        venueName: 'IT Mail Hall',
        genre: EventGenre.CONCERT,
        status: EventStatus.APPROVED,
        saleStartTime: new Date(Date.now() - 60_000),
      },
    });
    eventId = event.id;
    eventIds.push(event.id);

    const category = await prisma.seatCategory.create({
      data: { eventId, name: 'IT Mail', price: 1000, capacity: 2 },
    });
    const seat = await prisma.seat.create({
      data: { eventId, rowNumber: 1, seatNumber: 1, categoryId: category.id },
    });
    seatId = seat.id;
  }, 120_000);

  afterAll(async () => {
    try {
      await prisma.notificationDelivery.deleteMany({
        where: { OR: [{ dedupeKey: { in: deliveryKeys } }, { recipient: { endsWith: '@test.local' } }] },
      });
      await prisma.auditLog.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { targetId: { in: [...eventIds, ...orderIds] } }] },
      });
      await prisma.order.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.reservation.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.seat.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.seatCategory.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  it('sends the ticket to the real buyer address once and records SENT', async () => {
    const layout = await http()
      .get(`/api/events/${eventId}/available-seats/layout`)
      .expect(200);
    const seats = (layout.body.seats as Array<{ id: string; status: string }>).filter(
      (seat) => seat.status === 'AVAILABLE',
    );
    expect(seats.length).toBeGreaterThan(0);

    const reservation = await http()
      .post('/api/cart')
      .set(auth(buyerToken))
      .send({ eventId, seatIds: [seatId] })
      .expect(201);

    const order = await http()
      .post('/api/orders')
      .set(auth(buyerToken))
      .send({ cartId: reservation.body.id })
      .expect(201);
    orderIds.push(order.body.id);

    await http()
      .post(`/api/payments/${order.body.id}/charge`)
      .set(auth(buyerToken))
      .send({ paymentMethod: 'CARD' })
      .expect(201);

    deliveryKeys.push(`ticket:${order.body.id}`);
    const delivery = await waitForDelivery(`ticket:${order.body.id}`, 'SENT');

    expect(delivery.template).toBe('ticket');
    expect(delivery.recipient).toBe(buyerEmail);
    expect(delivery.orderId).toBe(order.body.id);

    // Idempotent payment must not create a second delivery.
    await http()
      .post(`/api/payments/${order.body.id}/charge`)
      .set(auth(buyerToken))
      .send({ paymentMethod: 'CARD' })
      .expect(201);
    const count = await prisma.notificationDelivery.count({
      where: { dedupeKey: `ticket:${order.body.id}` },
    });
    expect(count).toBe(1);
  });

  it('returns the PDF ticket to the buyer only', async () => {
    const orderId = orderIds[0];

    const pdf = await http()
      .get(`/api/orders/${orderId}/ticket`)
      .set(auth(buyerToken))
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(pdf.headers['content-type']).toContain('application/pdf');
    const body = pdf.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.length).toBeGreaterThan(1000);

    const orderRow = await prisma.order.findUnique({
      where: { id: orderId },
      select: { ticketId: true },
    });
    expect(orderRow?.ticketId).toBeTruthy();
    expect(body.toString('latin1')).toContain(orderRow?.ticketId as string);

    await http()
      .get(`/api/orders/${orderId}/ticket`)
      .set(auth(otherBuyerToken))
      .expect(403);
  });

  it('retries a failed delivery three times and marks it FAILED', async () => {
    const dedupeKey = `retry:${suffix}`;
    deliveryKeys.push(dedupeKey);

    process.env.SMTP_FORCE_FAIL = 'true';
    try {
      const first = await notifications.send({
        dedupeKey,
        template: 'generic',
        to: 'retry@test.local',
        subject: 'Retry test',
        body: '<p>retry</p>',
      });
      expect(first.status).toBe('PENDING');
      expect(first.attempts).toBe(1);
      expect(first.nextAttemptAt).not.toBeNull();

      const second = await notifications.attemptDelivery(first.id, true);
      expect(second?.status).toBe('PENDING');
      expect(second?.attempts).toBe(2);

      const third = await notifications.attemptDelivery(first.id, true);
      expect(third?.status).toBe('FAILED');
      expect(third?.attempts).toBe(3);
    } finally {
      delete process.env.SMTP_FORCE_FAIL;
    }
  });

  it('enforces a unique dedupe key at the database level', async () => {
    const dedupeKey = `dup:${suffix}`;
    deliveryKeys.push(dedupeKey);

    await prisma.notificationDelivery.create({
      data: {
        dedupeKey,
        template: 'generic',
        recipient: 'dup@test.local',
        subject: 'First',
        status: 'SENT',
      },
    });

    await expect(
      prisma.notificationDelivery.create({
        data: {
          dedupeKey,
          template: 'generic',
          recipient: 'dup@test.local',
          subject: 'Second',
        },
      }),
    ).rejects.toThrow();
  });

  it('consumes a notification event from Kafka and records the delivery', async (ctx) => {
    if (!kafkaReady) {
      ctx.skip();
      return;
    }

    const dedupeKey = `kafka:${suffix}`;
    deliveryKeys.push(dedupeKey);

    await prisma.outbox.create({
      data: {
        eventType: 'events.notification.email',
        payload: {
          dedupeKey,
          template: 'generic',
          to: 'kafka@test.local',
          subject: 'Kafka notification',
          body: '<p>from kafka</p>',
        },
      },
    });

    const published = await outboxPublisher.processPending();
    expect(published).toBeGreaterThanOrEqual(1);

    const delivery = await waitForDelivery(dedupeKey, 'SENT', 15_000);
    expect(delivery.recipient).toBe('kafka@test.local');
    expect(delivery.template).toBe('generic');
  });
});
