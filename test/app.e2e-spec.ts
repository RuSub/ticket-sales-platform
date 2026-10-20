import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET ?? 'test-refresh-secret';

/**
 * Smoke tests that do not need PostgreSQL/Redis: they cover bootstrap, the
 * global prefix and the RBAC layer (guards run before any DB access).
 */
describe('API smoke (e2e)', () => {
  let app: INestApplication<App>;
  let jwt: JwtService;

  const tokenFor = (role: string) =>
    jwt.sign(
      {
        sub: '22222222-2222-4222-8222-222222222222',
        email: 'smoke@example.com',
        role,
        type: 'access',
      },
      { secret: process.env.JWT_SECRET, expiresIn: 600 },
    );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    jwt = app.get(JwtService);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health returns ok', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('GET /api/metrics exposes prometheus text', async () => {
    const response = await request(app.getHttpServer()).get('/api/metrics').expect(200);
    expect(response.text).toContain('process_uptime_seconds');
  });

  it('rejects unauthenticated access to admin endpoints', async () => {
    await request(app.getHttpServer()).get('/api/admin/users').expect(401);
  });

  it('forbids BUYER from admin endpoints', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('BUYER')}`)
      .expect(403);
  });

  it('forbids SUPPORT from admin endpoints', async () => {
    await request(app.getHttpServer())
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${tokenFor('SUPPORT')}`)
      .expect(403);
  });

  it('rejects an invalid registration payload before touching the database', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: '123' })
      .expect(400);
  });
});
