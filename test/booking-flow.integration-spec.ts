import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventGenre, EventStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types.js';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { AppModule } from './../src/app.module.js';
import { BookingService } from './../src/modules/booking/booking.service.js';
import { prisma } from './../src/prisma/prisma.service.js';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integration-secret';
process.env.REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET ?? 'integration-refresh-secret';

const PASSWORD = 'TestPass123!';

describe('Booking, payment and return flow (integration)', () => {
  let app: INestApplication<App>;
  let bookingService: BookingService;

  const suffix = randomUUID().slice(0, 8);
  const createdUserIds: string[] = [];
  const createdEventIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdReturnIds: string[] = [];

  let organizerId: string;
  let organizerEmail: string;
  let eventId: string;
  let seatIds: string[] = [];

  let buyerA: { accessToken: string; refreshToken: string };
  let buyerAEmail: string;
  let buyerB: { accessToken: string };
  let buyerC: { accessToken: string };
  let buyerAOrderId: string;

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const register = async (label: string) => {
    const response = await http()
      .post('/api/auth/register')
      .send({ email: `${label}-${suffix}@test.local`, password: PASSWORD, fullName: `IT ${label}` })
      .expect(201);
    createdUserIds.push(response.body.user.id);
    return response.body as { accessToken: string; refreshToken: string };
  };

  const book = async (token: string, targetEventId: string, seatId: string) => {
    const response = await http()
      .post('/api/cart')
      .set(auth(token))
      .send({ eventId: targetEventId, seatIds: [seatId] })
      .expect(201);
    return response.body as { id: string; seatIds: string[]; status: string };
  };

  const createOrder = async (token: string, cartId: string) => {
    const response = await http()
      .post('/api/orders')
      .set(auth(token))
      .send({ cartId })
      .expect(201);
    createdOrderIds.push(response.body.id);
    return response.body as { id: string; status: string; totalAmount: string };
  };

  const pay = async (token: string, orderId: string, method = 'CARD') => {
    const response = await http()
      .post(`/api/payments/${orderId}/charge`)
      .set(auth(token))
      .send({ paymentMethod: method })
      .expect(201);
    return response.body as { success: boolean; status?: string; idempotent?: boolean };
  };

  const seatStatus = async (targetEventId: string, seatId: string) => {
    const response = await http()
      .get(`/api/events/${targetEventId}/available-seats/layout`)
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

    bookingService = app.get(BookingService);

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    organizerEmail = `organizer-${suffix}@test.local`;
    const organizer = await prisma.user.create({
      data: {
        email: organizerEmail,
        passwordHash,
        role: UserRole.ORGANIZER,
        fullName: 'IT Organizer',
      },
    });
    organizerId = organizer.id;
    createdUserIds.push(organizer.id);

    buyerAEmail = `buyer-a-${suffix}@test.local`;

    const event = await prisma.event.create({
      data: {
        organizerId,
        title: `IT Event ${suffix}`,
        eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        venueName: 'IT Hall',
        genre: EventGenre.CONCERT,
        status: EventStatus.APPROVED,
        saleStartTime: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    eventId = event.id;
    createdEventIds.push(event.id);

    const category = await prisma.seatCategory.create({
      data: { eventId, name: 'IT Standard', price: 1000, capacity: 6 },
    });

    for (let row = 1; row <= 2; row += 1) {
      for (let seatNumber = 1; seatNumber <= 3; seatNumber += 1) {
        const seat = await prisma.seat.create({
          data: { eventId, rowNumber: row, seatNumber, categoryId: category.id },
        });
        seatIds.push(seat.id);
      }
    }

    buyerA = await register('buyer-a');
    buyerB = await register('buyer-b');
    buyerC = await register('buyer-c');  }, 120_000);

  afterAll(async () => {
    try {
      await prisma.notificationDelivery.deleteMany({
        where: { recipient: { endsWith: '@test.local' } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { userId: { in: createdUserIds } },
            { targetId: { in: [...createdEventIds, ...createdOrderIds, ...createdReturnIds] } },
          ],
        },
      });
      await prisma.return.deleteMany({ where: { eventId: { in: createdEventIds } } });
      await prisma.order.deleteMany({ where: { eventId: { in: createdEventIds } } });
      await prisma.reservation.deleteMany({ where: { eventId: { in: createdEventIds } } });
      await prisma.seat.deleteMany({ where: { eventId: { in: createdEventIds } } });
      await prisma.seatCategory.deleteMany({ where: { eventId: { in: createdEventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  it('registers a buyer, logs in and rotates the refresh token', async () => {
    const login = await http()
      .post('/api/auth/login')
      .send({ email: buyerAEmail, password: PASSWORD })
      .expect(201);

    expect(typeof login.body.accessToken).toBe('string');
    expect(login.body.user.role).toBe('BUYER');

    const refreshed = await http()
      .post('/api/auth/refresh')
      .send({ refreshToken: buyerA.refreshToken })
      .expect(201);

    expect(typeof refreshed.body.accessToken).toBe('string');
    expect(refreshed.body.accessToken.length).toBeGreaterThan(20);
  });

  it('books a seat, pays idempotently, then returns the ticket and releases the seat', async () => {
    const seatId = seatIds[0];
    const reservation = await book(buyerA.accessToken, eventId, seatId);
    expect(reservation.status).toBe('ACTIVE');
    expect(await seatStatus(eventId, seatId)).toBe('RESERVED');

    const order = await createOrder(buyerA.accessToken, reservation.id);
    buyerAOrderId = order.id;
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(Number(order.totalAmount)).toBe(1000);

    const createdEvent = await prisma.outbox.findFirst({
      where: {
        eventType: 'events.order.created',
        payload: { path: ['orderId'], equals: order.id },
      },
    });
    expect(createdEvent).not.toBeNull();
    expect(createdEvent?.status).toBe('PENDING');
    expect(await seatStatus(eventId, seatId)).toBe('RESERVED');

    const payment = await pay(buyerA.accessToken, order.id);
    expect(payment).toMatchObject({ success: true, status: 'PAID', idempotent: false });
    expect(await seatStatus(eventId, seatId)).toBe('SOLD');

    const repeated = await pay(buyerA.accessToken, order.id);
    expect(repeated).toMatchObject({ success: true, idempotent: true });

    const returnResponse = await http()
      .post('/api/returns')
      .set(auth(buyerA.accessToken))
      .send({ orderId: order.id, reason: 'Integration test' })
      .expect(201);
    createdReturnIds.push(returnResponse.body.id);
    expect(returnResponse.body.status).toBe('PENDING');

    const organizerLogin = await http()
      .post('/api/auth/login')
      .send({ email: organizerEmail, password: PASSWORD })
      .expect(201);

    const pending = await http()
      .get('/api/returns/organizer/pending')
      .set(auth(organizerLogin.body.accessToken))
      .expect(200);
    expect((pending.body as Array<{ id: string }>).some((item) => item.id === returnResponse.body.id)).toBe(
      true,
    );

    const approved = await http()
      .post(`/api/returns/${returnResponse.body.id}/approve`)
      .set(auth(organizerLogin.body.accessToken))
      .expect(201);
    expect(approved.body.status).toBe('APPROVED');

    expect(await seatStatus(eventId, seatId)).toBe('AVAILABLE');

    const orderAfter = await http()
      .get(`/api/orders/${order.id}`)
      .set(auth(buyerA.accessToken))
      .expect(200);
    expect(orderAfter.body.status).toBe('CANCELLED');
  });

  it('rejects a return request inside the 24h window', async () => {
    const soonEvent = await prisma.event.create({
      data: {
        organizerId,
        title: `IT Soon ${suffix}`,
        eventDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
        genre: EventGenre.THEATER,
        status: EventStatus.APPROVED,
      },
    });
    createdEventIds.push(soonEvent.id);

    const category = await prisma.seatCategory.create({
      data: { eventId: soonEvent.id, name: 'Soon', price: 500, capacity: 1 },
    });
    const seat = await prisma.seat.create({
      data: { eventId: soonEvent.id, rowNumber: 1, seatNumber: 1, categoryId: category.id },
    });

    const reservation = await book(buyerB.accessToken, soonEvent.id, seat.id);
    const order = await createOrder(buyerB.accessToken, reservation.id);
    await pay(buyerB.accessToken, order.id);

    const response = await http()
      .post('/api/returns')
      .set(auth(buyerB.accessToken))
      .send({ orderId: order.id, reason: 'Too late' })
      .expect(400);

    expect(String(response.body.message)).toContain('24 hours');
  });

  it('allows exactly one buyer to reserve the same seat concurrently', async () => {
    const seatId = seatIds[1];

    const [first, second] = await Promise.all([
      http()
        .post('/api/cart')
        .set(auth(buyerB.accessToken))
        .send({ eventId, seatIds: [seatId] }),
      http()
        .post('/api/cart')
        .set(auth(buyerC.accessToken))
        .send({ eventId, seatIds: [seatId] }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    expect(await seatStatus(eventId, seatId)).toBe('RESERVED');

    const activeReservations = await prisma.reservation.count({
      where: { eventId, seatIds: { has: seatId }, status: 'ACTIVE' },
    });
    expect(activeReservations).toBe(1);

    // Release whichever buyer won the race.
    for (const token of [buyerB.accessToken, buyerC.accessToken]) {
      const cart = await http().get('/api/cart').set(auth(token)).expect(200);
      for (const reservation of cart.body as Array<{ id: string }>) {
        await http().delete(`/api/cart/${reservation.id}`).set(auth(token));
      }
    }

    expect(await seatStatus(eventId, seatId)).toBe('AVAILABLE');
  });

  it('releases seats when a reservation expires', async () => {
    const seatId = seatIds[2];
    const reservation = await book(buyerA.accessToken, eventId, seatId);

    const past = new Date(Date.now() - 60_000);
    await prisma.reservation.update({ where: { id: reservation.id }, data: { expiresAt: past } });
    await prisma.seat.update({ where: { id: seatId }, data: { reservationExpiresAt: past } });

    const released = await bookingService.expireOverdueReservations();
    expect(released).toBeGreaterThanOrEqual(1);

    const reservationAfter = await prisma.reservation.findUnique({
      where: { id: reservation.id },
      select: { status: true },
    });
    expect(reservationAfter?.status).toBe('EXPIRED');
    expect(await seatStatus(eventId, seatId)).toBe('AVAILABLE');
  });

  it('cancels an unpaid order and releases its seats', async () => {
    const seatId = seatIds[3];
    const reservation = await book(buyerA.accessToken, eventId, seatId);
    const order = await createOrder(buyerA.accessToken, reservation.id);

    const cancelled = await http()
      .post(`/api/orders/${order.id}/cancel`)
      .set(auth(buyerA.accessToken))
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(await seatStatus(eventId, seatId)).toBe('AVAILABLE');
  });

  it('compensates a failed order Saga and restores the reservation', async () => {
    const seatId = seatIds[4];
    const reservation = await book(buyerA.accessToken, eventId, seatId);
    const ordersBefore = await prisma.order.count({ where: { eventId } });

    process.env.ORDER_SAGA_FORCE_FAIL_AFTER_CREATE = 'true';
    try {
      await http()
        .post('/api/orders')
        .set(auth(buyerA.accessToken))
        .send({ cartId: reservation.id })
        .expect(500);
    } finally {
      delete process.env.ORDER_SAGA_FORCE_FAIL_AFTER_CREATE;
    }

    const ordersAfter = await prisma.order.count({ where: { eventId } });
    expect(ordersAfter).toBe(ordersBefore);

    const reservationAfter = await prisma.reservation.findUnique({
      where: { id: reservation.id },
      select: { status: true },
    });
    expect(reservationAfter?.status).toBe('ACTIVE');
    expect(await seatStatus(eventId, seatId)).toBe('RESERVED');

    await http().delete(`/api/cart/${reservation.id}`).set(auth(buyerA.accessToken)).expect(200);
    expect(await seatStatus(eventId, seatId)).toBe('AVAILABLE');
  });
  it('forbids a buyer from reading another buyer order', async () => {
    const response = await http()
      .get(`/api/orders/${buyerAOrderId}`)
      .set(auth(buyerB.accessToken))
      .expect(403);
    expect(String(response.body.message)).toContain('access');
  });
});
