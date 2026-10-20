import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReservationDto } from './dto/booking.dto';

@Controller('events/:eventId/available-seats')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  getAvailableSeats(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.bookingService.getAvailableSeats(eventId);
  }

  @Get('layout')
  getSeatLayout(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.bookingService.getSeatLayout(eventId);
  }
}

@Controller('cart')
export class CartController {
  constructor(private readonly bookingService: BookingService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  getCart(@Req() req: any) {
    return this.bookingService.getReservations(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  addToCart(@Req() req: any, @Body() dto: CreateReservationDto) {
    return this.bookingService.createReservation(req.user.userId, dto.eventId, dto.seatIds);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':reservationId')
  removeFromCart(
    @Req() req: any,
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ) {
    return this.bookingService.removeReservation(reservationId, req.user.userId);
  }
}
