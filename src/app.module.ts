import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { EventModule } from './modules/event/event.module';
import { BookingModule } from './modules/booking/booking.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ReturnModule } from './modules/return/return.module';
import { NotificationModule } from './modules/notification/notification.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { RealtimeModule } from './common/realtime/realtime.module';
import { OutboxModule } from './common/outbox/outbox.module';
import { ThrottlerModuleConfig } from './common/rate-limiting/rate-limiting.module';
import { RedisService } from './common/redis/redis.service';
import { WinstonLoggerService } from './common/logger/winston.logger';
import { MetricsService } from './common/metrics/metrics.service';
import { MetricsInterceptor } from './common/metrics/metrics.interceptor';
import { MetricsController } from './common/metrics/metrics.controller';
import { TraceIdInterceptor } from './interceptors/trace.interceptor';
import { HealthController } from './common/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModuleConfig,
    RealtimeModule,
    OutboxModule,
    AuthModule,
    UserModule,
    EventModule,
    BookingModule,
    OrderModule,
    PaymentModule,
    ReturnModule,
    NotificationModule,
    DashboardModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    RedisService,
    WinstonLoggerService,
    MetricsService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TraceIdInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class AppModule {}
