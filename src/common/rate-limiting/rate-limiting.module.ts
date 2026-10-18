import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

export const ThrottlerConfig = {
  ttl: 60000, // 1 minute
  limit: 100, // 100 requests per minute
};

export const ThrottlerModuleConfig = ThrottlerModule.forRoot([
  {
    name: 'short',
    ttl: 10000,
    limit: 30,
  },
  {
    name: 'long',
    ttl: 60000,
    limit: 100,
  },
]);

@Injectable()
export class ThrottlerCustomGuard extends ThrottlerGuard {}
