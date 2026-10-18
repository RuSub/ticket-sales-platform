import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { EventModule } from './modules/event/event.module';
import { SearchModule } from './modules/search/search.module';
import { BookingModule } from './modules/booking/booking.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ReturnModule } from './modules/return/return.module';
import { NotificationModule } from './modules/notification/notification.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ThrottlerModuleConfig } from './common/rate-limiting/rate-limiting.module';
import { RedisService } from './common/redis/redis.service';
import { KafkaService } from './common/kafka/kafka.service';
import { WinstonLoggerService } from './common/logger/winston.logger';
import { RolesGuard } from './guards/roles.guard';
import { TraceIdInterceptor } from './interceptors/trace.interceptor';
import { HealthController } from './common/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModuleConfig,
    AuthModule,
    UserModule,
    EventModule,
    SearchModule,
    BookingModule,
    OrderModule,
    PaymentModule,
    ReturnModule,
    NotificationModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    RedisService,
    KafkaService,
    WinstonLoggerService,
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TraceIdInterceptor,
    },
  ],
})
export class AppModule {}
