import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventGenre, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types.js';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { AppModule } from './../src/app.module.js';
import { prisma } from './../src/prisma/prisma.service.js';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integration-secret';
process.env.REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET ?? 'integration-refresh-secret';
process.env.SMTP_MODE = 'json';

const PASSWORD = 'TestPass123!';

const binaryParser = (
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

describe('Full buyer journey (integration)', () => {
  let app: INestApplication<App>;
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const eventIds: string[] = [];

  let organizerToken: string;
  let adminToken: string;
  let buyerToken: string;
  let eventId: string;
  let eventTitle: string;

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

  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    const organizer = await createUser(UserRole.ORGANIZER, 'journey-org');
    const admin = await createUser(UserRole.ADMIN, 'journey-admin');
    organizerToken = await login(organizer.email);
    adminToken = await login(admin.email);

    eventTitle = `Journey ${suffix}`;
    const event = await http()
      .post('/api/events')
      .set(auth(organizerToken))
      .send({
        title: eventTitle,
        description: `Unique journey event ${suffix}`,
        eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        venueName: 'Journey Hall',
        genre: EventGenre.CONCERT,
        venueLayout: { rows: 1, seatsPerRow: 4, basePrice: 1500 },
      })
      .expect(201);
    eventId = event.body.id;
    eventIds.push(eventId);

    await http().post(`/api/events/${eventId}/approve`).set(auth(adminToken)).expect(201);

    const registration = await http()
      .post('/api/auth/register')
      .send({
        email: `journey-buyer-${suffix}@test.local`,
        password: PASSWORD,
        fullName: 'Journey Buyer',
      })
      .expect(201);
    userIds.push(registration.body.user.id);
    buyerToken = registration.body.accessToken;
  }, 120_000);

  afterAll(async () => {
    try {
      await prisma.notificationDelivery.deleteMany({
        where: { recipient: { endsWith: '@test.local' } },
      });
      await prisma.auditLog.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { targetId: { in: eventIds } }] },
      });
      await prisma.order.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.reservation.deleteMany({ where: { eventId: { in: eventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  it('goes from search to seat selection, payment and PDF ticket', async () => {
    const search = await http()
      .get('/api/events/search')
      .query({ q: eventTitle })
      .expect(200);
    expect(
      (search.body.events as Array<{ id: string }>).some((event) => event.id === eventId),
    ).toBe(true);

    const layout = await http()
      .get(`/api/events/${eventId}/available-seats/layout`)
      .expect(200);
    const seat = (layout.body.seats as Array<{ id: string; status: string }>).find(
      (item) => item.status === 'AVAILABLE',
    );
    expect(seat).toBeTruthy();

    const reservation = await http()
      .post('/api/cart')
      .set(auth(buyerToken))
      .send({ eventId, seatIds: [seat?.id] })
      .expect(201);

    const order = await http()
      .post('/api/orders')
      .set(auth(buyerToken))
      .send({ cartId: reservation.body.id })
      .expect(201);
    expect(order.body.status).toBe('PENDING_PAYMENT');

    await http()
      .post(`/api/payments/${order.body.id}/charge`)
      .set(auth(buyerToken))
      .send({ paymentMethod: 'CARD' })
      .expect(201);

    const paidOrder = await http()
      .get(`/api/orders/${order.body.id}`)
      .set(auth(buyerToken))
      .expect(200);
    expect(paidOrder.body.status).toBe('PAID');
    expect(paidOrder.body.ticketId).toBeTruthy();

    const pdf = await http()
      .get(`/api/orders/${order.body.id}/ticket`)
      .set(auth(buyerToken))
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    expect(pdf.headers['content-type']).toContain('application/pdf');
    const body = pdf.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.toString('latin1')).toContain(paidOrder.body.ticketId);
  });
});
