import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReturnStatus, UserRole } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ReturnService } from '../return/return.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { AssignAgencyDto } from './dto/agency.dto';

@Controller('organizer')
@Roles(UserRole.ORGANIZER, UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizerController {
  constructor(
    private readonly returnService: ReturnService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('events/:eventId/dashboard')
  async getDashboard(@Param('eventId', ParseUUIDPipe) eventId: string, @Req() req: any) {
    await this.assertOwner(eventId, req.user);

    const [seatGroups, paidOrders, activeReservations] = await Promise.all([
      prisma.seat.groupBy({
        by: ['status'],
        where: { eventId },
        _count: { _all: true },
      }),
      prisma.order.aggregate({
        where: { eventId, status: 'PAID' },
        _sum: { totalAmount: true, platformCommission: true, agencyCommission: true },
        _count: { _all: true },
      }),
      prisma.reservation.count({ where: { eventId, status: 'ACTIVE' } }),
    ]);

    const seatsByStatus = Object.fromEntries(
      seatGroups.map((group) => [group.status, group._count._all]),
    );

    return {
      eventId,
      seatsByStatus,
      ticketsSold: seatsByStatus.SOLD ?? 0,
      activeReservations,
      paidOrders: paidOrders._count._all,
      revenue: paidOrders._sum.totalAmount ?? 0,
      platformCommission: paidOrders._sum.platformCommission ?? 0,
      agencyCommission: paidOrders._sum.agencyCommission ?? 0,
    };
  }

  @Get('events/:eventId/stats')
  async getStats(@Param('eventId', ParseUUIDPipe) eventId: string, @Req() req: any) {
    await this.assertOwner(eventId, req.user);

    const [categories, soldByCategory, paidOrders] = await Promise.all([
      prisma.seatCategory.findMany({
        where: { eventId },
        select: { id: true, name: true, price: true, capacity: true },
        orderBy: { name: 'asc' },
      }),
      prisma.orderItem.groupBy({
        by: ['categoryId'],
        where: { order: { eventId, status: 'PAID' } },
        _count: { _all: true },
        _sum: { price: true },
      }),
      prisma.order.findMany({
        where: { eventId, status: 'PAID' },
        select: { totalAmount: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const soldMap = new Map(
      soldByCategory.map((row) => [
        row.categoryId,
        { count: row._count._all, revenue: row._sum.price ?? 0 },
      ]),
    );

    const revenueByDate = new Map<string, number>();
    for (const order of paidOrders) {
      const day = order.createdAt.toISOString().slice(0, 10);
      revenueByDate.set(day, (revenueByDate.get(day) ?? 0) + Number(order.totalAmount));
    }

    return {
      eventId,
      categories: categories.map((category) => ({
        ...category,
        sold: soldMap.get(category.id)?.count ?? 0,
        revenue: soldMap.get(category.id)?.revenue ?? 0,
      })),
      revenueByDate: [...revenueByDate.entries()].map(([date, revenue]) => ({ date, revenue })),
    };
  }

  @Post('events/:eventId/agencies')
  async assignAgency(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() req: any,
    @Body() dto: AssignAgencyDto,
  ) {
    await this.assertOwner(eventId, req.user);

    const agency = await prisma.user.findUnique({
      where: { id: dto.agencyId },
      select: { id: true, role: true, isActive: true, email: true },
    });
    if (!agency) {
      throw new NotFoundException('Agency user not found');
    }
    if (agency.role !== UserRole.AGENCY || !agency.isActive) {
      throw new BadRequestException('User is not an active agency');
    }

    const existing = await prisma.eventAgency.findUnique({
      where: { eventId_agencyId: { eventId, agencyId: dto.agencyId } },
    });
    if (existing) {
      throw new ConflictException('Agency is already assigned to this event');
    }

    const link = await prisma.eventAgency.create({
      data: { eventId, agencyId: dto.agencyId, assignedBy: req.user.userId },
    });

    await this.auditLogService.log(req.user.userId, 'agency_assigned', 'event', eventId, {
      agencyId: dto.agencyId,
    });

    return link;
  }

  @Delete('events/:eventId/agencies/:agencyId')
  async unassignAgency(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('agencyId', ParseUUIDPipe) agencyId: string,
    @Req() req: any,
  ) {
    await this.assertOwner(eventId, req.user);

    const deleted = await prisma.eventAgency.deleteMany({ where: { eventId, agencyId } });
    if (deleted.count === 0) {
      throw new NotFoundException('Agency assignment not found');
    }

    await this.auditLogService.log(req.user.userId, 'agency_unassigned', 'event', eventId, {
      agencyId,
    });

    return { message: 'Agency unassigned', eventId, agencyId };
  }

  @Get('events/:eventId/agencies')
  async listAgencies(@Param('eventId', ParseUUIDPipe) eventId: string, @Req() req: any) {
    await this.assertOwner(eventId, req.user);

    return prisma.eventAgency.findMany({
      where: { eventId },
      include: { agency: { select: { id: true, email: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Get('events/:eventId/agencies/stats')
  async getAgencyStats(@Param('eventId', ParseUUIDPipe) eventId: string, @Req() req: any) {
    await this.assertOwner(eventId, req.user);

    const [links, grouped] = await Promise.all([
      prisma.eventAgency.findMany({
        where: { eventId },
        include: { agency: { select: { id: true, email: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.order.groupBy({
        by: ['agencyId'],
        where: { eventId, agencyId: { not: null }, status: 'PAID' },
        _sum: { totalAmount: true, agencyCommission: true },
        _count: { _all: true },
      }),
    ]);

    const statsMap = new Map(grouped.map((row) => [row.agencyId, row]));

    return {
      eventId,
      agencies: links.map((link) => {
        const stats = statsMap.get(link.agencyId);
        return {
          agency: link.agency,
          assignedAt: link.createdAt,
          orders: stats?._count._all ?? 0,
          revenue: stats?._sum.totalAmount ?? 0,
          commission: stats?._sum.agencyCommission ?? 0,
        };
      }),
    };
  }

  @Get('returns/pending')
  getPendingReturns(@Req() req: any) {
    return this.returnService.findByOrganizer(req.user.userId, ReturnStatus.PENDING);
  }

  private async assertOwner(eventId: string, user: { userId: string; role: string }) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (user.role !== UserRole.ADMIN && event.organizerId !== user.userId) {
      throw new ForbiddenException('Not your event');
    }
  }
}
