import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, ReturnStatus } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { DashboardGateway } from '../../common/realtime/dashboard.gateway';

const STAFF_ROLES = ['ADMIN', 'SUPPORT'];
const HOURS_BEFORE_EVENT_LIMIT = 24;

@Injectable()
export class ReturnService {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly dashboardGateway: DashboardGateway,
  ) {}

  async create(orderId: string, buyerId: string, reason?: string, requestedBy?: string, role?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { email: true } },
        event: { select: { eventDate: true, title: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.buyerId !== buyerId && !STAFF_ROLES.includes(role ?? '')) {
      throw new ForbiddenException('You can only request a return for your own order');
    }
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('Only paid orders can be returned');
    }

    const existing = await prisma.return.findFirst({
      where: { orderId, status: { in: [ReturnStatus.PENDING, ReturnStatus.APPROVED] } },
    });
    if (existing) {
      throw new ConflictException('A return for this order is already in progress');
    }

    const hoursUntilEvent = (order.event.eventDate.getTime() - Date.now()) / 3_600_000;
    if (hoursUntilEvent < HOURS_BEFORE_EVENT_LIMIT) {
      throw new BadRequestException('Returns are not allowed within 24 hours of the event');
    }

    const returnRequest = await prisma.return.create({
      data: {
        orderId,
        buyerId: order.buyerId,
        eventId: order.eventId,
        status: ReturnStatus.PENDING,
        reason,
        requestedBy: requestedBy ?? buyerId,
      },
    });

    await this.notificationService.sendReturnEmail(order.buyer.email, 'requested');
    return returnRequest;
  }

  async findById(id: string, userId: string, role?: string) {
    const returnRequest = await prisma.return.findUnique({
      where: { id },
      include: {
        order: { include: { items: { include: { seat: true, category: true } } } },
        event: { select: { organizerId: true, title: true } },
      },
    });

    if (!returnRequest) {
      throw new NotFoundException('Return not found');
    }

    const isStaff = STAFF_ROLES.includes(role ?? '');
    const isBuyer = returnRequest.buyerId === userId;
    const isOrganizer = returnRequest.event?.organizerId === userId;
    if (!isStaff && !isBuyer && !isOrganizer) {
      throw new ForbiddenException('You do not have access to this return');
    }

    return returnRequest;
  }

  async findByBuyer(buyerId: string) {
    return prisma.return.findMany({
      where: { buyerId },
      include: { order: { select: { id: true, totalAmount: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByOrganizer(organizerId: string, status?: ReturnStatus) {
    return prisma.return.findMany({
      where: {
        ...(status ? { status } : {}),
        event: { organizerId },
      },
      include: {
        buyer: { select: { id: true, email: true, fullName: true } },
        order: { select: { id: true, totalAmount: true, status: true } },
        event: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(id: string, approverId: string, approverRole: string) {
    const returnRequest = await prisma.return.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            items: { select: { seatId: true } },
            buyer: { select: { email: true } },
          },
        },
        event: { select: { organizerId: true, title: true } },
      },
    });

    if (!returnRequest) {
      throw new NotFoundException('Return not found');
    }
    this.assertCanModerate(returnRequest, approverId, approverRole);
    if (returnRequest.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Return is not pending');
    }

    const seatIds = returnRequest.order.items.map((item) => item.seatId);

    const approved = await prisma.$transaction(async (tx) => {
      const updated = await tx.return.updateMany({
        where: { id, status: ReturnStatus.PENDING },
        data: { status: ReturnStatus.APPROVED, approvedBy: approverId },
      });
      if (updated.count === 0) {
        throw new ConflictException('Return status changed, please retry');
      }

      await tx.seat.updateMany({
        where: { id: { in: seatIds }, status: { in: ['RESERVED', 'SOLD'] } },
        data: { status: 'AVAILABLE', reservationExpiresAt: null },
      });

      await tx.order.updateMany({
        where: { id: returnRequest.orderId, status: OrderStatus.PAID },
        data: { status: OrderStatus.CANCELLED },
      });

      return tx.return.findUniqueOrThrow({ where: { id } });
    });

    await this.auditLogService.log(approverId, 'return_approved', 'return', id, {
      role: approverRole,
      releasedSeats: seatIds.length,
    });
    await this.notificationService.sendReturnEmail(returnRequest.order.buyer.email, 'approved');
    await this.dashboardGateway.emitSales(returnRequest.eventId);

    return approved;
  }

  async reject(id: string, rejectorId: string, rejectorRole: string) {
    const returnRequest = await prisma.return.findUnique({
      where: { id },
      include: {
        order: { include: { buyer: { select: { email: true } } } },
        event: { select: { organizerId: true } },
      },
    });

    if (!returnRequest) {
      throw new NotFoundException('Return not found');
    }
    this.assertCanModerate(returnRequest, rejectorId, rejectorRole);
    if (returnRequest.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Return is not pending');
    }

    const rejected = await prisma.$transaction(async (tx) => {
      const updated = await tx.return.updateMany({
        where: { id, status: ReturnStatus.PENDING },
        data: { status: ReturnStatus.REJECTED, approvedBy: rejectorId },
      });
      if (updated.count === 0) {
        throw new ConflictException('Return status changed, please retry');
      }
      return tx.return.findUniqueOrThrow({ where: { id } });
    });

    await this.auditLogService.log(rejectorId, 'return_rejected', 'return', id, {
      role: rejectorRole,
    });
    await this.notificationService.sendReturnEmail(returnRequest.order.buyer.email, 'rejected');

    return rejected;
  }

  async cancel(id: string, userId: string) {
    const returnRequest = await prisma.return.findUnique({ where: { id } });
    if (!returnRequest) {
      throw new NotFoundException('Return not found');
    }
    if (returnRequest.buyerId !== userId) {
      throw new ForbiddenException('You can only cancel your own return request');
    }
    if (returnRequest.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Only pending returns can be cancelled');
    }

    await prisma.return.delete({ where: { id } });
    return { message: 'Return cancelled' };
  }

  async bulkAction(
    returnIds: string[],
    action: 'approve' | 'reject',
    userId: string,
    role: string,
  ) {
    const results: Array<Record<string, unknown>> = [];
    for (const id of returnIds) {
      try {
        const result =
          action === 'approve'
            ? await this.approve(id, userId, role)
            : await this.reject(id, userId, role);
        results.push({ id, ok: true, status: result.status });
      } catch (error) {
        results.push({ id, ok: false, error: error instanceof Error ? error.message : 'Failed' });
      }
    }
    return { results };
  }

  private assertCanModerate(
    returnRequest: { event?: { organizerId: string } | null },
    userId: string,
    role: string,
  ) {
    if (STAFF_ROLES.includes(role)) {
      return;
    }
    if (returnRequest.event?.organizerId === userId) {
      return;
    }
    throw new ForbiddenException('Only the event organizer or support can moderate this return');
  }
}
