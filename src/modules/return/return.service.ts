import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../prisma/prisma.service';
import { ReturnStatus, SeatStatus, OrderStatus } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class ReturnService {
  constructor(
    private auditLogService: AuditLogService,
    private notificationService: NotificationService,
  ) {}

  async create(orderId: string, buyerId: string, reason?: string, requestedBy?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'PAID') throw new BadRequestException('Only paid orders can be returned');

    // Check 24-hour restriction
    const event = await prisma.event.findUnique({ where: { id: order.eventId } });
    if (event) {
      const hoursUntilEvent = (event.eventDate.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilEvent < 24) {
        throw new BadRequestException('Too close to event date');
      }
    }

    const returnReq = await prisma.return.create({
      data: {
        orderId,
        buyerId,
        eventId: order.eventId,
        status: ReturnStatus.PENDING,
        reason,
        requestedBy,
      },
    });

    await this.notificationService.sendReturnEmail('user@example.com', 'requested');
    return returnReq;
  }

  async findById(id: string) {
    return prisma.return.findUnique({
      where: { id },
      include: { order: { include: { items: { include: { seat: true, category: true } } } } },
    });
  }

  async findByBuyer(buyerId: string) {
    return prisma.return.findMany({
      where: { buyerId },
      include: { order: { select: { id: true, totalAmount: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByOrganizer(eventId: string) {
    return prisma.return.findMany({
      where: { eventId, status: ReturnStatus.PENDING },
      include: { buyer: { select: { id: true, email: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(id: string, approverId: string, approverRole: string) {
    const returnReq = await prisma.return.findUnique({ where: { id } });
    if (!returnReq) throw new NotFoundException('Return not found');
    if (returnReq.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Return is not pending');
    }

    const approved = await prisma.return.update({
      where: { id },
      data: {
        status: ReturnStatus.APPROVED,
        approvedBy: approverId,
      },
    });

    // Release seats back to available
    const order = await prisma.order.findUnique({ where: { id: returnReq.orderId } });
    if (order) {
      const items = await prisma.orderItem.findMany({ where: { orderId: returnReq.orderId } });
      const seatIds = items.map(item => item.seatId);

      await prisma.seat.updateMany({
        where: { id: { in: seatIds } },
        data: { status: SeatStatus.AVAILABLE },
      });

      await prisma.order.update({
        where: { id: returnReq.orderId },
        data: { status: OrderStatus.CANCELLED },
      });
    }

    await this.auditLogService.log(approverId, 'return_approved', 'return', id, { role: approverRole });
    await this.notificationService.sendReturnEmail('user@example.com', 'approved');

    return approved;
  }

  async reject(id: string, rejectorId: string, rejectorRole: string) {
    const returnReq = await prisma.return.findUnique({ where: { id } });
    if (!returnReq) throw new NotFoundException('Return not found');
    if (returnReq.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Return is not pending');
    }

    const rejected = await prisma.return.update({
      where: { id },
      data: { status: ReturnStatus.REJECTED, approvedBy: rejectorId },
    });

    await this.auditLogService.log(rejectorId, 'return_rejected', 'return', id, { role: rejectorRole });
    await this.notificationService.sendReturnEmail('user@example.com', 'rejected');

    return rejected;
  }

  async cancel(id: string, userId: string) {
    const returnReq = await prisma.return.findUnique({ where: { id } });
    if (!returnReq) throw new NotFoundException('Return not found');
    if (returnReq.status !== ReturnStatus.PENDING) {
      throw new BadRequestException('Can only cancel pending returns');
    }

    await prisma.return.delete({ where: { id } });
    return { message: 'Return cancelled' };
  }

  async bulkAction(returnIds: string[], action: 'approve' | 'reject', userId: string, role: string) {
    const results = [];
    for (const id of returnIds) {
      try {
        if (action === 'approve') {
          results.push(await this.approve(id, userId, role));
        } else {
          results.push(await this.reject(id, userId, role));
        }
      } catch (e: any) {
        results.push({ id, error: e.message });
      }
    }
    return { results };
  }
}
