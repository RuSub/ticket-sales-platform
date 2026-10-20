import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { NotificationService } from '../notification/notification.service';
import { RedisService } from '../../common/redis/redis.service';
import { DashboardGateway } from '../../common/realtime/dashboard.gateway';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly notificationService: NotificationService,
    private readonly redisService: RedisService,
    private readonly dashboardGateway: DashboardGateway,
  ) {}

  async charge(orderId: string, paymentMethod: string, userId: string, role?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { select: { seatId: true } },
        buyer: { select: { email: true, fullName: true } },
        event: { select: { title: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const isStaff = role === 'ADMIN' || role === 'SUPPORT';
    if (order.buyerId !== userId && !isStaff) {
      throw new ForbiddenException('You cannot pay for someone else`s order');
    }

    // Idempotency: a repeated charge returns the original outcome.
    if (order.status === OrderStatus.PAID) {
      return { success: true, orderId, status: order.status, idempotent: true };
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new ConflictException(`Order is ${order.status}`);
    }

    const seatIds = order.items.map((item) => item.seatId);
    const ticketId = randomUUID();
    const gatewayResult = await this.emulatePaymentGateway(Number(order.totalAmount), paymentMethod);

    if (!gatewayResult.success) {
      await prisma.$transaction(async (tx) => {
        await tx.order.updateMany({
          where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
          data: { status: OrderStatus.PAYMENT_FAILED },
        });
        await tx.seat.updateMany({
          where: { id: { in: seatIds }, status: 'RESERVED' },
          data: { status: 'AVAILABLE', reservationExpiresAt: null },
        });
      });

      await this.releaseLocks(order.eventId, seatIds);
      await this.auditLogService.log(userId, 'payment_failed', 'order', orderId, {
        reason: 'Gateway declined',
        paymentMethod,
      });

      await this.dashboardGateway.emitSales(order.eventId);

      return { success: false, error: 'Payment declined' };
    }

    const paid = await prisma.$transaction(async (tx) => {
      // Conditional transition makes concurrent double-charges safe.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.PAID, ticketId },
      });
      if (claimed.count === 0) {
        return false;
      }

      const sold = await tx.seat.updateMany({
        where: { id: { in: seatIds }, status: 'RESERVED' },
        data: { status: 'SOLD', reservationExpiresAt: null },
      });
      if (sold.count !== seatIds.length) {
        throw new ConflictException('Tickets are no longer reserved');
      }

      await tx.outbox.create({
        data: {
          eventType: 'events.order.paid',
          payload: {
            orderId,
            buyerId: order.buyerId,
            eventId: order.eventId,
            amount: order.totalAmount.toString(),
            currency: 'RUB',
            paymentMethod,
            paidAt: new Date().toISOString(),
          },
        },
      });

      return true;
    });

    if (!paid) {
      return { success: true, orderId, status: OrderStatus.PAID, idempotent: true };
    }

    await this.releaseLocks(order.eventId, seatIds);
    await this.auditLogService.log(userId, 'payment_completed', 'order', orderId, {
      amount: order.totalAmount.toString(),
      paymentMethod,
    });

    await this.notificationService.sendTicketEmail(order.buyer.email, {
      ticketId: orderId,
      orderId,
      eventName: order.event.title,
    });

    await this.dashboardGateway.emitSales(order.eventId);
    if (order.agencyId) {
      await this.dashboardGateway.emitAgency(order.agencyId);
    }

    return { success: true, orderId, status: OrderStatus.PAID, idempotent: false };
  }

  async generateQRCode(ticketId: string) {
    return { ticketId, qrData: `TICKET:${ticketId}` };
  }

  private async emulatePaymentGateway(
    amount: number,
    method: string,
  ): Promise<{ success: boolean }> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!Number.isFinite(amount) || amount <= 0) {
      return { success: false };
    }
    // Test hook: paymentMethod=FAIL simulates a declined payment.
    if (method?.toUpperCase() === 'FAIL') {
      return { success: false };
    }
    return { success: true };
  }

  private async releaseLocks(eventId: string, seatIds: string[]) {
    if (!seatIds.length) {
      return;
    }
    await this.redisService
      .getClient()
      .del(...seatIds.map((seatId) => `reservation:${eventId}:${seatId}`))
      .catch(() => undefined);
  }
}
