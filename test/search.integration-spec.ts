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

describe('Full-text search (integration)', () => {
  let app: INestApplication<App>;
  const suffix = randomUUID().slice(0, 8).toLowerCase();

  const userIds: string[] = [];
  const eventIds: string[] = [];

  let eventA: string;
  let eventB: string;
  let eventD: string;
  let eventPending: string;

  const http = () => request(app.getHttpServer());

  const createEvent = async (input: {
    title: string;
    description: string;
    venueName: string;
    genre: EventGenre;
    status: EventStatus;
    eventDate: Date;
  }) => {
    const event = await prisma.event.create({
      data: {
        organizerId: userIds[0],
        ...input,
      },
    });
    eventIds.push(event.id);
    return event;
  };

  const search = async (query: Record<string, string | number>) => {
    const response = await http().get('/api/events/search').query(query).expect(200);
    return response.body as {
      events: Array<{ id: string; title: string }>;
      total: number;
      page: number;
      totalPages: number;
    };
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

    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    const organizer = await prisma.user.create({
      data: {
        email: `search-org-${suffix}@test.local`,
        passwordHash,
        role: UserRole.ORGANIZER,
        fullName: 'IT Search',
      },
    });
    userIds.push(organizer.id);

    const a = await createEvent({
      title: `Rock ${suffix}`,
      description: `Zyx ${suffix} rock concert`,
      venueName: 'Moscow Hall',
      genre: EventGenre.CONCERT,
      status: EventStatus.APPROVED,
      eventDate: new Date('2026-12-01T18:00:00Z'),
    });
    eventA = a.id;

    const b = await createEvent({
      title: `Jazz ${suffix}`,
      description: `Zyx ${suffix} quiet evening with rock`,
      venueName: 'Moscow Jazz Club',
      genre: EventGenre.CONCERT,
      status: EventStatus.APPROVED,
      eventDate: new Date('2026-12-02T18:00:00Z'),
    });
    eventB = b.id;

    const d = await createEvent({
      title: `Theater ${suffix}`,
      description: `Zyx ${suffix} rock theater`,
      venueName: 'Kazan Stage',
      genre: EventGenre.THEATER,
      status: EventStatus.APPROVED,
      eventDate: new Date('2026-12-03T18:00:00Z'),
    });
    eventD = d.id;

    const pending = await createEvent({
      title: `Rock ${suffix} pending`,
      description: `Zyx ${suffix} rock pending`,
      venueName: 'Moscow Hall',
      genre: EventGenre.CONCERT,
      status: EventStatus.PENDING,
      eventDate: new Date('2026-12-04T18:00:00Z'),
    });
    eventPending = pending.id;
  }, 120_000);

  afterAll(async () => {
    try {
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await app?.close();
      await prisma.$disconnect();
    }
  }, 60_000);

  it('creates the generated tsvector column and the GIN index', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'events' AND column_name = 'search_vector'
    `;
    expect(columns).toHaveLength(1);

    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'events' AND indexname = 'events_search_vector_idx'
    `;
    expect(indexes).toHaveLength(1);
    expect(indexes[0].indexdef).toContain('USING gin');
  });

  it('ranks title matches above description matches and hides non-approved events', async () => {
    const result = await search({ q: `rock ${suffix}` });
    const ids = result.events.map((event) => event.id);

    expect(result.total).toBe(3);
    expect(ids).toContain(eventA);
    expect(ids).toContain(eventB);
    expect(ids).toContain(eventD);
    expect(ids).not.toContain(eventPending);
    expect(ids[0]).toBe(eventA);
  });

  it('applies city, genre and date filters together with the text query', async () => {
    const byCity = await search({ q: `rock ${suffix}`, city: 'Moscow' });
    expect(byCity.events.map((event) => event.id).sort()).toEqual([eventA, eventB].sort());

    const byGenre = await search({ q: `rock ${suffix}`, genre: EventGenre.THEATER });
    expect(byGenre.events.map((event) => event.id)).toEqual([eventD]);

    const byDate = await search({ q: `rock ${suffix}`, date: '2026-12-01' });
    expect(byDate.events.map((event) => event.id)).toEqual([eventA]);
  });

  it('falls back to substring matching for short queries', async () => {
    const result = await search({ q: 'ro', city: 'Moscow' });
    const ids = result.events.map((event) => event.id);
    expect(ids).toContain(eventA);
    expect(ids).toContain(eventB);
    expect(ids).not.toContain(eventD);
  });

  it('paginates results and reports the total', async () => {
    const result = await search({ q: `rock ${suffix}`, limit: 2 });
    expect(result.total).toBe(3);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(2);
    expect(result.events).toHaveLength(2);
  });

  it('finds the seeded demo event by title', async () => {
    const result = await search({ q: 'Demo' });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.events.some((event) => event.title.includes('Demo Concert'))).toBe(true);
  });
});
