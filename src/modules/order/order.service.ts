import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class OrderService {
  constructor(
    private auditLogService: AuditLogService,
    private notificationService: NotificationService,
  ) {}

  async createFromCart(buyerId: string, cartId: string, agencyId?: string) {
    const reservation = await prisma.reservation.findFirst({
      where: { id: cartId, buyerId, status: 'ACTIVE' },
      include: { event: { include: { categories: true } } },
    });
    if (!reservation) throw new NotFoundException('Cart reservation not found');

    const event = reservation.event;

    // Calculate total
    const seats = await prisma.seat.findMany({
      where: { id: { in: reservation.seatIds }, eventId: event.id },
      include: { category: true },
    });

    const totalAmount = seats.reduce((sum, seat) => sum + parseFloat(seat.category.price.toString()), 0);

    // Get platform commission
    const commissionSetting = await prisma.platformSetting.findUnique({ where: { key: 'platform_commission' } });
    const platformCommission = parseFloat((totalAmount * 0.1).toFixed(2)); // 10% default

    // Create order with items
    const order = await prisma.order.create({
      data: {
        buyerId,
        eventId: event.id,
        agencyId,
        status: OrderStatus.PENDING_PAYMENT,
        totalAmount,
        platformCommission,
        agencyCommission: agencyId ? parseFloat((totalAmount * 0.05).toFixed(2)) : 0,
        items: {
          create: seats.map(seat => ({
            seatId: seat.id,
            categoryId: seat.categoryId,
            price: parseFloat(seat.category.price.toString()),
          })),
        },
      },
      include: { items: { include: { seat: true, category: true } } },
    });

    // Update seat statuses to SOLD
    await prisma.seat.updateMany({
      where: { id: { in: reservation.seatIds } },
      data: { status: 'SOLD' },
    });

    // Update reservation status
    await prisma.reservation.update({
      where: { id: cartId },
      data: { status: 'CONVERTED' },
    });

    // Release reservation locks
    const redis = require('ioredis');
    // Locks are now permanent since order is created

    // Send notification
    this.notificationService.sendPaymentEmail('user@example.com', event.title);

    // Log audit
    await this.auditLogService.log(buyerId, 'order_created', 'order', order.id, { totalAmount });

    return order;
  }

  async findById(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: { items: { include: { seat: true, category: true } } },
    });
  }

  async findByBuyer(buyerId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { buyerId },
        include: { items: { include: { seat: true, category: true } } },
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where: { buyerId } }),
    ]);
    return { orders, total, page, totalPages: Math.ceil(total / limit) };
  }

  async cancel(orderId: string, userId: string, role?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // Only allow cancellation if not yet paid
    if (order.status === 'PAID') {
      throw new BadRequestException('Cannot cancel paid order. Request a refund instead.');
    }

    const cancelled = await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });

    // Release seats
    const items = await prisma.orderItem.findMany({ where: { orderId } });
    const seatIds = items.map(item => item.seatId);
    await prisma.seat.updateMany({
      where: { id: { in: seatIds } },
      data: { status: 'AVAILABLE' },
    });

    await this.auditLogService.log(userId, 'order_cancelled', 'order', orderId, { role });

    return cancelled;
  }
}
