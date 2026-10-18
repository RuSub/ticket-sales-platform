import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('events/:eventId/available-seats')
export class BookingController {
  constructor(private bookingService: BookingService) {}

  @Get()
  getAvailableSeats(@Param('eventId') eventId: string) {
    return this.bookingService.getAvailableSeats(eventId);
  }

  @Get('layout')
  getSeatLayout(@Param('eventId') eventId: string) {
    return this.bookingService.getSeatLayout(eventId);
  }
}

@Controller('cart')
export class CartController {
  constructor(private bookingService: BookingService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getCart(@Req() req: any) {
    return this.bookingService.getReservations(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  addToCart(@Req() req: any, @Body('seatIds') seatIds: string[], @Body('eventId') eventId: string) {
    return this.bookingService.createReservation(req.user.userId, eventId, seatIds);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':reservationId')
  removeFromCart(@Req() req: any, @Param('reservationId') reservationId: string) {
    return this.bookingService.removeReservation(reservationId, req.user.userId);
  }
}
