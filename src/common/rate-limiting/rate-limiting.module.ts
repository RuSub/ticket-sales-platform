import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

export const ThrottlerConfig = {
  ttl: 60000, // 1 minute
  limit: 100, // 100 requests per minute
};

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const ThrottlerModuleConfig = ThrottlerModule.forRoot([
  {
    name: 'short',
    ttl: 10000,
    limit: envLimit('THROTTLER_SHORT_LIMIT', 30),
  },
  {
    name: 'long',
    ttl: 60000,
    limit: envLimit('THROTTLER_LONG_LIMIT', 100),
  },
]);

@Injectable()
export class ThrottlerCustomGuard extends ThrottlerGuard {}
