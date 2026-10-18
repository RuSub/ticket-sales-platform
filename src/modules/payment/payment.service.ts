import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { prisma } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class PaymentService {
  constructor(
    private auditLogService: AuditLogService,
    private notificationService: NotificationService,
  ) {}

  async charge(orderId: string, paymentMethod: string, userId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new BadRequestException('Order not found');
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ConflictException(`Order is already ${order.status}`);
    }

    // Emulated payment - always succeeds for MVP
    // In production, this would call a real payment gateway
    const paymentResult = await this.emulatePaymentGateway(Number(order.totalAmount), paymentMethod);

    if (!paymentResult.success) {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAYMENT_FAILED },
      });
      await this.auditLogService.log(userId, 'payment_failed', 'order', orderId, { reason: 'Gateway declined' });
      return { success: false, error: 'Payment declined' };
    }

    // Update order status
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID },
    });

    // Send ticket email
    await this.notificationService.sendTicketEmail('user@example.com', {
      ticketId: orderId,
      eventName: 'Event Name',
    });

    await this.auditLogService.log(userId, 'payment_completed', 'order', orderId, { amount: order.totalAmount.toString() });

    return { success: true, orderId };
  }

  private async emulatePaymentGateway(amount: number, method: string): Promise<{ success: boolean }> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // For MVP, always succeed
    return { success: true };
  }

  async generateQRCode(ticketId: string) {
    // QR code generation placeholder - in production use qrcode library
    return { ticketId, qrData: `TICKET:${ticketId}` };
  }
}
