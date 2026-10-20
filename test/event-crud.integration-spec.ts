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

describe('Event CRUD and moderation (integration)', () => {
  let app: INestApplication<App>;
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const eventIds: string[] = [];

  let organizerToken: string;
  let otherOrganizerToken: string;
  let adminToken: string;
  let eventId: string;

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

    const organizer = await createUser(UserRole.ORGANIZER, 'crud-org');
    await createUser(UserRole.ORGANIZER, 'crud-org2');
    const admin = await createUser(UserRole.ADMIN, 'crud-admin');

    organizerToken = await login(organizer.email);
    otherOrganizerToken = await login(`crud-org2-${suffix}@test.local`);
    adminToken = await login(admin.email);
  }, 120_000);

  afterAll(async () => {
    try {
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

  it('creates an event with generated seats and returns its details', async () => {
    const response = await http()
      .post('/api/events')
      .set(auth(organizerToken))
      .send({
        title: `IT CRUD ${suffix}`,
        description: 'Event created through the API',
        eventDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        venueName: 'CRUD Hall',
        genre: EventGenre.CONCERT,
        venueLayout: { rows: 2, seatsPerRow: 3, basePrice: 1000 },
      })
      .expect(201);

    eventId = response.body.id;
    eventIds.push(eventId);
    expect(response.body.status).toBe(EventStatus.PENDING);
    expect(response.body.organizerId).toBeTruthy();

    const details = await http().get(`/api/events/${eventId}`).expect(200);
    expect(details.body.categories).toHaveLength(1);
    expect(details.body.seats).toHaveLength(6);
    expect(details.body.seats[0].category.name).toBe('Standard');
  });

  it('checks ownership and rejects mass assignment of status', async () => {
    await http()
      .patch(`/api/events/${eventId}`)
      .set(auth(otherOrganizerToken))
      .send({ title: 'Hijacked' })
      .expect(403);

    const updated = await http()
      .patch(`/api/events/${eventId}`)
      .set(auth(organizerToken))
      .send({ title: `IT CRUD ${suffix} updated` })
      .expect(200);
    expect(updated.body.title).toContain('updated');

    await http()
      .patch(`/api/events/${eventId}`)
      .set(auth(organizerToken))
      .send({ status: EventStatus.APPROVED })
      .expect(400);
  });

  it('runs moderation: pending queue, approval and public visibility', async () => {
    await http()
      .get('/api/events/pending')
      .set(auth(organizerToken))
      .expect(403);

    const pending = await http()
      .get('/api/events/pending')
      .set(auth(adminToken))
      .expect(200);
    expect(
      (pending.body.events as Array<{ id: string }>).some((event) => event.id === eventId),
    ).toBe(true);

    const approved = await http()
      .post(`/api/events/${eventId}/approve`)
      .set(auth(adminToken))
      .expect(201);
    expect(approved.body.status).toBe(EventStatus.APPROVED);

    const publicList = await http().get('/api/events').expect(200);
    expect(
      (publicList.body.events as Array<{ id: string }>).some((event) => event.id === eventId),
    ).toBe(true);
  });

  it('deletes the event and returns 404 afterwards', async () => {
    await http()
      .delete(`/api/events/${eventId}`)
      .set(auth(otherOrganizerToken))
      .expect(403);

    await http().delete(`/api/events/${eventId}`).set(auth(organizerToken)).expect(200);
    await http().get(`/api/events/${eventId}`).expect(404);
  });
});
