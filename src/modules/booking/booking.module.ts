import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController, CartController } from './booking.controller';
import { BookingGateway } from './booking.gateway';
import { ReservationExpiryService } from './reservation-expiry.service';
import { RedisService } from '../../common/redis/redis.service';
import { EventModule } from '../event/event.module';

@Module({
  imports: [EventModule],
  controllers: [BookingController, CartController],
  providers: [BookingService, BookingGateway, ReservationExpiryService, RedisService],
  exports: [BookingService],
})
export class BookingModule {}
