import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { BookingService } from '../booking/booking.service';
import { OrderService } from '../order/order.service';
import { CreateAgencyOrderDto } from './dto/agency.dto';

@Controller('agency')
@Roles(UserRole.AGENCY, UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgencyController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly orderService: OrderService,
  ) {}

  @Get('events')
  getEvents(@Req() req: any) {
    return prisma.event.findMany({
      where: {
        status: 'APPROVED',
        agencies: { some: { agencyId: req.user.userId } },
      },
      select: {
        id: true,
        title: true,
        eventDate: true,
        venueName: true,
        genre: true,
        status: true,
        _count: { select: { seats: true } },
      },
      orderBy: { eventDate: 'asc' },
    });
  }

  @Get('events/:eventId')
  async getEvent(@Param('eventId', ParseUUIDPipe) eventId: string, @Req() req: any) {
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        agencies: { some: { agencyId: req.user.userId } },
      },
      select: {
        id: true,
        title: true,
        description: true,
        eventDate: true,
        venueName: true,
        venueAddress: true,
        genre: true,
        status: true,
        categories: true,
        _count: { select: { seats: true } },
      },
    });

    if (!event) {
      throw new NotFoundException('Event is not assigned to this agency');
    }
    return event;
  }

  @Post('orders')
  async createOrder(@Req() req: any, @Body() dto: CreateAgencyOrderDto) {
    const assignment = await prisma.eventAgency.findUnique({
      where: { eventId_agencyId: { eventId: dto.eventId, agencyId: req.user.userId } },
    });
    if (!assignment) {
      throw new ForbiddenException('Event is not assigned to this agency');
    }

    // Reserve first, then convert into an order. If the order fails the
    // reservation is released so the seats never stay locked.
    const reservation = await this.bookingService.createReservation(
      req.user.userId,
      dto.eventId,
      dto.seatIds,
    );

    try {
      return await this.orderService.createFromCart(
        req.user.userId,
        reservation.id,
        req.user.userId,
      );
    } catch (error) {
      await this.bookingService
        .removeReservation(reservation.id, req.user.userId)
        .catch(() => undefined);
      throw error;
    }
  }

  @Get('stats')
  async getStats(@Req() req: any) {
    const agencyId = req.user.userId;
    const where = { agencyId, status: 'PAID' as const };

    const [assignedEvents, summary, ticketsSold, byEvent, orders] = await Promise.all([
      prisma.eventAgency.count({ where: { agencyId } }),
      prisma.order.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalAmount: true, agencyCommission: true },
      }),
      prisma.orderItem.count({ where: { order: where } }),
      prisma.order.groupBy({
        by: ['eventId'],
        where,
        _count: { _all: true },
        _sum: { totalAmount: true, agencyCommission: true },
      }),
      prisma.order.findMany({
        where,
        select: { totalAmount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const eventIds = byEvent.map((row) => row.eventId);
    const events = await prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, title: true, eventDate: true },
    });
    const eventMap = new Map(events.map((event) => [event.id, event]));

    const salesByDate = new Map<string, { revenue: number; orders: number }>();
    for (const order of orders) {
      const day = order.createdAt.toISOString().slice(0, 10);
      const current = salesByDate.get(day) ?? { revenue: 0, orders: 0 };
      current.revenue += Number(order.totalAmount);
      current.orders += 1;
      salesByDate.set(day, current);
    }

    return {
      assignedEvents,
      totalOrders: summary._count._all,
      totalTicketsSold: ticketsSold,
      totalRevenue: summary._sum.totalAmount ?? 0,
      totalCommission: summary._sum.agencyCommission ?? 0,
      salesByEvent: byEvent.map((row) => ({
        event: eventMap.get(row.eventId) ?? null,
        orders: row._count._all,
        revenue: row._sum.totalAmount ?? 0,
        commission: row._sum.agencyCommission ?? 0,
      })),
      salesByDate: [...salesByDate.entries()].map(([date, value]) => ({ date, ...value })),
    };
  }
}
