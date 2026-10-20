import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingService } from './booking.service';

@Injectable()
export class ReservationExpiryService {
  private readonly logger = new Logger(ReservationExpiryService.name);

  constructor(private readonly bookingService: BookingService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async expireReservations() {
    try {
      const released = await this.bookingService.expireOverdueReservations();
      if (released > 0) {
        this.logger.log(`Released ${released} expired reservation(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Reservation expiry run failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
