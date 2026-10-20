import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.integration-spec.ts'],
    // The suite shares one PostgreSQL/Redis instance, so tests run serially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/ticket_platform',
      REDIS_HOST: process.env.REDIS_HOST ?? 'localhost',
      REDIS_PORT: process.env.REDIS_PORT ?? '6379',
      JWT_SECRET: process.env.JWT_SECRET ?? 'integration-secret',
      REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET ?? 'integration-refresh-secret',
      // Keep the outbox scheduler idle during tests.
      KAFKA_BROKERS: '',
      // The suite issues dozens of requests from one IP; lift the dev limits.
      THROTTLER_SHORT_LIMIT: '10000',
      THROTTLER_LONG_LIMIT: '10000',
    },
  },
});
