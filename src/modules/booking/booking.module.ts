import { Module } from '@nestjs/common';
import { BookingService } from './booking.service';
import { BookingController, CartController } from './booking.controller';
import { BookingGateway } from './booking.gateway';
import { RedisService } from '../../common/redis/redis.service';

@Module({
  controllers: [BookingController, CartController],
  providers: [BookingService, BookingGateway, RedisService],
  exports: [BookingService],
})
export class BookingModule {}
