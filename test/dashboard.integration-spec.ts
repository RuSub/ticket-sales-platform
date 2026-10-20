import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventGenre, EventStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { AppModule } from './../src/app.module.js';
import { prisma } from './../src/prisma/prisma.service.js';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integration-secret';
process.env.REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET ?? 'integration-refresh-secret';

const PASSWORD = 'TestPass123!';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Dashboard real-time updates (integration)', () => {
  let app: INestApplication<App>;
  let baseUrl: string;
  const suffix = randomUUID().slice(0, 8);

  const userIds: string[] = [];
  const eventIds: string[] = [];
  const sockets: Socket[] = [];

  let organizerId: string;
  let agencyId: string;
  let eventId: string;
  let seatId: string;
  let seatId2: string;
  let organizerToken: string;
  let agencyToken: string;
  let buyerToken: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const connect = async (token?: string, namespace = 'dashboards') => {
    const socket = io(`${baseUrl}/${namespace}`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
    });
    sockets.push(socket);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('socket connect timeout')), 5000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    return socket;
  };

  const subscribe = (socket: Socket, event: string, payload?: unknown) =>
    new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), 5000);
      socket.emit(event, payload ?? {}, (ack: unknown) => {
        clearTimeout(timer);
        resolve(ack);
      });
    });

  const waitFor = async (predicate: () => boolean, timeout = 8000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (predicate()) {
        return;
      }
      await sleep(50);
    }
    throw new Error('condition not met in time');
  };

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
    await app.listen(0);

    const url = await app.getUrl();
    const port = new URL(url.replace('[::1]', '127.0.0.1')).port;
    baseUrl = `http://127.0.0.1:${port}`;

    const organizer = await createUser(UserRole.ORGANIZER, 'ws-org');
    organizerId = organizer.id;
    const agency = await createUser(UserRole.AGENCY, 'ws-agency');
    agencyId = agency.id;
    const buyer = await createUser(UserRole.BUYER, 'ws-buyer');

    organizerToken = await login(organizer.email);
    agencyToken = await login(agency.email);
    buyerToken = await login(buyer.email);

    const event = await prisma.event.create({
      data: {
        organizerId,
        title: `IT WS ${suffix}`,
        eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        genre: EventGenre.CONCERT,
        status: EventStatus.APPROVED,
        saleStartTime: new Date(Date.now() - 60_000),
      },
    });
    eventId = event.id;
    eventIds.push(event.id);

    const category = await prisma.seatCategory.create({
      data: { eventId, name: 'IT WS', price: 1000, capacity: 2 },
    });
    const seat = await prisma.seat.create({
      data: { eventId, rowNumber: 1, seatNumber: 1, categoryId: category.id },
    });
    seatId = seat.id;

    const secondSeat = await prisma.seat.create({
      data: { eventId, rowNumber: 1, seatNumber: 2, categoryId: category.id },
    });
    seatId2 = secondSeat.id;

    await prisma.eventAgency.create({
      data: { eventId, agencyId, assignedBy: organizerId },
    });
  }, 120_000);

  afterAll(async () => {
    for (const socket of sockets) {
      socket.close();
    }
    try {
      await prisma.notificationDelivery.deleteMany({
        where: { recipient: { endsWith: '@test.local' } },
      });
      await prisma.auditLog.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { targetId: { in: eventIds } }] },
      });
      await prisma.eventAgency.deleteMany({ where: { eventId: { in: eventIds } } });
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

  it('rejects dashboard subscriptions without a token', async () => {
    const socket = await connect();
    const ack = await subscribe(socket, 'subscribe:organizer', { eventId });
    expect(ack.ok).toBe(false);
    socket.close();
  });

  it('pushes sales_updated to the organizer and stats_updated to the agency', async () => {
    const organizerSocket = await connect(organizerToken);
    const organizerEvents: Array<Record<string, any>> = [];
    organizerSocket.on('sales_updated', (payload) => organizerEvents.push(payload));

    const organizerAck = await subscribe(organizerSocket, 'subscribe:organizer', { eventId });
    expect(organizerAck.ok).toBe(true);
    await waitFor(() => organizerEvents.length >= 1);
    expect(organizerEvents[0].sold).toBe(0);
    expect(organizerEvents[0].available).toBe(2);

    const agencySocket = await connect(agencyToken);
    const agencyEvents: Array<Record<string, any>> = [];
    agencySocket.on('stats_updated', (payload) => agencyEvents.push(payload));

    const agencyAck = await subscribe(agencySocket, 'subscribe:agency');
    expect(agencyAck.ok).toBe(true);
    await waitFor(() => agencyEvents.length >= 1);
    expect(agencyEvents[0].totalTicketsSold).toBe(0);

    const orderResponse = await http()
      .post('/api/agency/orders')
      .set(auth(agencyToken))
      .send({ eventId, seatIds: [seatId] })
      .expect(201);

    await http()
      .post(`/api/payments/${orderResponse.body.id}/charge`)
      .set(auth(agencyToken))
      .send({ paymentMethod: 'CARD' })
      .expect(201);

    await waitFor(() =>
      organizerEvents.some((payload) => payload.sold === 1 && Number(payload.revenue) === 1000),
    );
    await waitFor(() =>
      agencyEvents.some(
        (payload) =>
          payload.totalTicketsSold === 1 &&
          Number(payload.totalRevenue) === 1000 &&
          Number(payload.totalCommission) === 50,
      ),
    );

    const latestSales = organizerEvents[organizerEvents.length - 1];
    expect(latestSales.eventId).toBe(eventId);
    expect(latestSales.available).toBe(1);

    const latestStats = agencyEvents[agencyEvents.length - 1];
    expect(latestStats.agencyId).toBe(agencyId);
    expect(Number(latestStats.totalCommission)).toBe(50);
  });

  it('pushes seat_status_updated to seat subscribers', async () => {
    const socket = await connect(undefined, 'events');
    const updates: Array<Record<string, any>> = [];
    const initialStates: Array<Record<string, any>> = [];
    socket.on('seat_status_updated', (payload) => updates.push(payload));
    socket.on('seat_status_initial', (payload) => initialStates.push(payload));
    socket.emit('subscribe:seats', { eventId });
    await waitFor(() => initialStates.length >= 1);
    expect(initialStates[0].seats.length).toBe(2);

    const reservation = await http()
      .post('/api/cart')
      .set(auth(buyerToken))
      .send({ eventId, seatIds: [seatId2] })
      .expect(201);

    await waitFor(() =>
      updates.some(
        (payload) => payload.seatId === seatId2 && payload.newStatus === 'RESERVED',
      ),
    );

    await http()
      .delete(`/api/cart/${reservation.body.id}`)
      .set(auth(buyerToken))
      .expect(200);

    await waitFor(() =>
      updates.some(
        (payload) => payload.seatId === seatId2 && payload.newStatus === 'AVAILABLE',
      ),
    );
  });
});