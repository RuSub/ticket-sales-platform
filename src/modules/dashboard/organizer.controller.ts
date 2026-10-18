import { Controller, Get, Post, Param, Body, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';

@Controller('organizer')
export class OrganizerController {
  constructor() {}

  @UseGuards(JwtAuthGuard)
  @Get('events/:eventId/dashboard')
  getDashboard(@Param('eventId') eventId: string, @Req() req: any) {
    return prisma.event.findUnique({
      where: { id: eventId },
      select: {
        _count: { select: { seats: true } },
        orders: {
          where: { status: 'PAID' },
          select: { totalAmount: true },
        },
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('events/:eventId/stats')
  getStats(@Param('eventId') eventId: string) {
    return prisma.event.findUnique({
      where: { id: eventId },
      include: {
        categories: { select: { name: true, _count: { select: { seats: true } } } },
        orders: {
          where: { status: 'PAID' },
          select: { totalAmount: true, createdAt: true },
        },
      },
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('events/:eventId/agencies')
  assignAgency(@Param('eventId') eventId: string, @Req() req: any, @Body('agencyId') agencyId: string) {
    return { message: 'Agency assigned', eventId, agencyId };
  }

  @UseGuards(JwtAuthGuard)
  @Get('events/:eventId/agencies/stats')
  getAgencyStats(@Param('eventId') eventId: string) {
    return { message: 'Agency statistics', eventId };
  }

  @UseGuards(JwtAuthGuard)
  @Get('returns/pending')
  getPendingReturns(@Req() req: any) {
    return { message: 'Get pending returns' };
  }
}
