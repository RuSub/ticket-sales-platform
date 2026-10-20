import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventGenre, EventStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types.js';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { AppModule } from './../src/app.module.js';
import { prisma } from './../src/prisma/prisma.service.js';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integration-secret';
process.env.REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET ?? 'integration-refresh-secret';

const PASSWORD = 'TestPass123!';

describe('Agency assignment and sales (integration)', () => {
  let app: INestApplication<App>;
  const suffix = randomUUID().slice(0, 8);

  const userIds: string[] = [];
  const eventIds: string[] = [];

  let organizerId: string;
  let agencyId: string;
  let organizerToken: string;
  let otherOrganizerToken: string;
  let agencyToken: string;
  let buyerToken: string;

  let eventA: string;
  let eventB: string;
  let seatA1: string;
  let seatB1: string;

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

  const createEvent = async (title: string) => {
    const event = await prisma.event.create({
      data: {
        organizerId,
        title,
        eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        venueName: 'IT Agency Hall',
        genre: EventGenre.CONCERT,
        status: EventStatus.APPROVED,
        saleStartTime: new Date(Date.now() - 60_000),
      },
    });
    eventIds.push(event.id);

    const category = await prisma.seatCategory.create({
      data: { eventId: event.id, name: 'IT Agency', price: 1000, capacity: 3 },
    });
    const seats: string[] = [];
    for (let seatNumber = 1; seatNumber <= 3; seatNumber += 1) {
      const seat = await prisma.seat.create({
        data: { eventId: event.id, rowNumber: 1, seatNumber, categoryId: category.id },
      });
      seats.push(seat.id);
    }

    return { event, seats };
  };

  const seatStatus = async (eventId: string, seatId: string) => {
    const response = await http()
      .get(`/api/events/${eventId}/available-seats/layout`)
      .expect(200);
    const seat = (response.body.seats as Array<{ id: string; status: string }>).find(
      (item) => item.id === seatId,
    );
    return seat?.status;
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

    const organizer = await createUser(UserRole.ORGANIZER, 'org');
    organizerId = organizer.id;
    await createUser(UserRole.ORGANIZER, 'org2');
    const agency = await createUser(UserRole.AGENCY, 'agency');
    agencyId = agency.id;
    await createUser(UserRole.BUYER, 'buyer');

    organizerToken = await login(organizer.email);
    otherOrganizerToken = await login(`org2-${suffix}@test.local`);
    agencyToken = await login(agency.email);
    buyerToken = await login(`buyer-${suffix}@test.local`);

    const first = await createEvent(`IT Agency A ${suffix}`);
    eventA = first.event.id;
    seatA1 = first.seats[0];

    const second = await createEvent(`IT Agency B ${suffix}`);
    eventB = second.event.id;
    seatB1 = second.seats[0];
  }, 120_000);

  afterAll(async () => {
    try {
      await prisma.notificationDelivery.deleteMany({
        where: { recipient: { endsWith: '@test.local' } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ userId: { in: userIds } }, { targetId: { in: eventIds } }],
        },
      });
      await prisma.return.deleteMany({ where: { eventId: { in: eventIds } } });
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

  it('assigns an agency, rejects duplicates, foreign organizers and buyers', async () => {
    const created = await http()
      .post(`/api/organizer/events/${eventA}/agencies`)
      .set(auth(organizerToken))
      .send({ agencyId })
      .expect(201);
    expect(created.body.agencyId).toBe(agencyId);

    await http()
      .post(`/api/organizer/events/${eventA}/agencies`)
      .set(auth(organizerToken))
      .send({ agencyId })
      .expect(409);

    await http()
      .post(`/api/organizer/events/${eventA}/agencies`)
      .set(auth(otherOrganizerToken))
      .send({ agencyId })
      .expect(403);

    await http()
      .post(`/api/organizer/events/${eventA}/agencies`)
      .set(auth(buyerToken))
      .send({ agencyId })
      .expect(403);

    const list = await http()
      .get(`/api/organizer/events/${eventA}/agencies`)
      .set(auth(organizerToken))
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].agency.id).toBe(agencyId);
  });

  it('shows an agency only its assigned events', async () => {
    const events = await http().get('/api/agency/events').set(auth(agencyToken)).expect(200);
    const ids = (events.body as Array<{ id: string }>).map((event) => event.id);
    expect(ids).toContain(eventA);
    expect(ids).not.toContain(eventB);

    await http().get(`/api/agency/events/${eventB}`).set(auth(agencyToken)).expect(404);
  });

  it('sells seats with agencyId and commission, then reflects them in stats', async () => {
    const orderResponse = await http()
      .post('/api/agency/orders')
      .set(auth(agencyToken))
      .send({ eventId: eventA, seatIds: [seatA1] })
      .expect(201);

    const order = orderResponse.body;
    expect(order.agencyId).toBe(agencyId);
    expect(order.buyerId).toBe(agencyId);
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(Number(order.totalAmount)).toBe(1000);
    expect(Number(order.agencyCommission)).toBe(50);
    expect(await seatStatus(eventA, seatA1)).toBe('RESERVED');

    await http()
      .post(`/api/payments/${order.id}/charge`)
      .set(auth(agencyToken))
      .send({ paymentMethod: 'CARD' })
      .expect(201);
    expect(await seatStatus(eventA, seatA1)).toBe('SOLD');

    const stats = await http().get('/api/agency/stats').set(auth(agencyToken)).expect(200);
    expect(stats.body.assignedEvents).toBe(1);
    expect(stats.body.totalOrders).toBe(1);
    expect(stats.body.totalTicketsSold).toBe(1);
    expect(Number(stats.body.totalRevenue)).toBe(1000);
    expect(Number(stats.body.totalCommission)).toBe(50);
    expect(stats.body.salesByEvent[0].event.id).toBe(eventA);
  });

  it('rejects sales for unassigned events and for seats that are already sold', async () => {
    await http()
      .post('/api/agency/orders')
      .set(auth(agencyToken))
      .send({ eventId: eventB, seatIds: [seatB1] })
      .expect(403);

    const ordersBefore = await prisma.order.count({ where: { eventId: eventA } });
    await http()
      .post('/api/agency/orders')
      .set(auth(agencyToken))
      .send({ eventId: eventA, seatIds: [seatA1] })
      .expect(409);
    const ordersAfter = await prisma.order.count({ where: { eventId: eventA } });
    expect(ordersAfter).toBe(ordersBefore);
  });

  it('unassigns the agency and hides the event', async () => {
    await http()
      .delete(`/api/organizer/events/${eventA}/agencies/${agencyId}`)
      .set(auth(organizerToken))
      .expect(200);

    const events = await http().get('/api/agency/events').set(auth(agencyToken)).expect(200);
    expect(events.body).toHaveLength(0);

    await http()
      .delete(`/api/organizer/events/${eventA}/agencies/${agencyId}`)
      .set(auth(organizerToken))
      .expect(404);
  });
});
