import { Controller, Get, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('agency')
export class AgencyController {
  @UseGuards(JwtAuthGuard)
  @Get('events')
  getEvents(@Req() req: any) {
    return { message: 'Get assigned events', userId: req.user.userId };
  }

  @UseGuards(JwtAuthGuard)
  @Get('events/:eventId')
  getEvent(@Param('eventId') eventId: string) {
    return { message: 'Get event details', eventId };
  }

  @UseGuards(JwtAuthGuard)
  @Post('orders')
  createOrder(@Req() req: any, @Body('seatIds') seatIds: string[], @Body('eventId') eventId: string) {
    return { message: 'Create agency order', userId: req.user.userId, seatIds, eventId };
  }

  @UseGuards(JwtAuthGuard)
  @Get('stats')
  getStats(@Req() req: any) {
    return {
      totalTicketsSold: 0,
      totalRevenue: 0,
      totalCommission: 0,
      salesByEvent: [],
      salesByDate: [],
    };
  }
}
