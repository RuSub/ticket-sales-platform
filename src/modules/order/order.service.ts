import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { RedisService } from '../../common/redis/redis.service';
import { DashboardGateway } from '../../common/realtime/dashboard.gateway';

const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING_PAYMENT,
  OrderStatus.PAYMENT_FAILED,
];

@Injectable()
export class OrderService {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly redisService: RedisService,
    private readonly dashboardGateway: DashboardGateway,
  ) {}

  async createFromCart(buyerId: string, cartId: string, agencyId?: string) {
    // Saga step 1: validate the cart and the seats it holds.
    const reservation = await prisma.reservation.findFirst({
      where: { id: cartId, buyerId, status: 'ACTIVE' },
    });
    if (!reservation) {
      throw new NotFoundException('Active cart reservation not found');
    }
    if (reservation.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Reservation has expired');
    }

    const seats = await prisma.seat.findMany({
      where: { id: { in: reservation.seatIds }, eventId: reservation.eventId },
      include: { category: true },
    });

    if (seats.length !== reservation.seatIds.length) {
      throw new BadRequestException('Some reserved seats no longer exist');
    }
    if (seats.some((seat) => seat.status !== 'RESERVED')) {
      throw new ConflictException('Reserved seats are no longer held');
    }

    const totalAmount = Number(
      seats.reduce((sum, seat) => sum + Number(seat.category.price), 0).toFixed(2),
    );

    const commissionSetting = await prisma.platformSetting.findUnique({
      where: { key: 'platform_commission' },
    });
    const configuredPercentage = Number(
      (commissionSetting?.value as { percentage?: number } | null)?.percentage,
    );
    const percentage = Number.isFinite(configuredPercentage) ? configuredPercentage : 10;

    const platformCommission = Number(((totalAmount * percentage) / 100).toFixed(2));
    const agencyCommission = agencyId ? Number((totalAmount * 0.05).toFixed(2)) : 0;

    // Saga step 2: order, reservation conversion and the outbox event commit together.
    const { order, outboxId } = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          buyerId,
          eventId: reservation.eventId,
          agencyId,
          status: OrderStatus.PENDING_PAYMENT,
          totalAmount,
          platformCommission,
          agencyCommission,
          items: {
            create: seats.map((seat) => ({
              seatId: seat.id,
              categoryId: seat.categoryId,
              price: seat.category.price,
            })),
          },
        },
        include: { items: { include: { seat: true, category: true } } },
      });

      const converted = await tx.reservation.updateMany({
        where: { id: cartId, status: 'ACTIVE' },
        data: { status: 'CONVERTED' },
      });
      if (converted.count !== 1) {
        throw new ConflictException('Reservation is no longer active');
      }

      const outbox = await tx.outbox.create({
        data: {
          eventType: 'events.order.created',
          payload: {
            orderId: created.id,
            buyerId,
            eventId: reservation.eventId,
            agencyId: agencyId ?? null,
            totalAmount,
            seatIds: seats.map((seat) => seat.id),
          },
        },
      });

      return { order: created, outboxId: outbox.id };
    });

    // Saga step 3: side effects; any failure compensates step 2.
    try {
      if (process.env.ORDER_SAGA_FORCE_FAIL_AFTER_CREATE === 'true') {
        throw new Error('Order Saga failure (test hook)');
      }
      await this.auditLogService.log(buyerId, 'order_created', 'order', order.id, {
        totalAmount,
        seatCount: seats.length,
      });
    } catch (error) {
      await this.compensateOrder(order.id, outboxId, reservation);
      throw error;
    }

    return order;
  }

  private async compensateOrder(
    orderId: string,
    outboxId: string,
    reservation: { id: string; eventId: string; seatIds: string[] },
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.outbox.deleteMany({ where: { id: outboxId } });
      await tx.order.deleteMany({ where: { id: orderId } });
      await tx.reservation.updateMany({
        where: { id: reservation.id, status: 'CONVERTED' },
        data: { status: 'ACTIVE' },
      });
    });

    await this.releaseLocks(reservation.eventId, reservation.seatIds);
  }
  async findById(id: string, requesterId: string, role?: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { seat: { include: { category: true } }, category: true } },
        event: { select: { id: true, title: true, eventDate: true, venueName: true } },
        buyer: { select: { email: true, fullName: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.assertCanAccessOrder(order, requesterId, role);
    return order;
  }

  async findByBuyer(buyerId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { buyerId },
        include: { items: { include: { seat: true, category: true } } },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where: { buyerId } }),
    ]);

    return { orders, total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
  }

  async cancel(orderId: string, userId: string, role?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { seatId: true } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.assertCanAccessOrder(order, userId, role);

    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException('Cannot cancel a paid order. Request a return instead.');
    }
    if (order.status === OrderStatus.CANCELLED) {
      return order;
    }
    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(`Order cannot be cancelled in status ${order.status}`);
    }

    const seatIds = order.items.map((item) => item.seatId);

    const cancelled = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: { in: CANCELLABLE_STATUSES } },
        data: { status: OrderStatus.CANCELLED },
      });
      if (updated.count === 0) {
        throw new ConflictException('Order status changed, please retry');
      }

      await tx.seat.updateMany({
        where: { id: { in: seatIds }, eventId: order.eventId, status: 'RESERVED' },
        data: { status: 'AVAILABLE', reservationExpiresAt: null },
      });

      await tx.reservation.updateMany({
        where: {
          buyerId: order.buyerId,
          eventId: order.eventId,
          status: 'ACTIVE',
          seatIds: { hasSome: seatIds },
        },
        data: { status: 'EXPIRED' },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: { include: { seat: true, category: true } } },
      });
    });

    await this.releaseLocks(order.eventId, seatIds);

    await this.auditLogService.log(userId, 'order_cancelled', 'order', orderId, {
      role: role ?? 'BUYER',
      releasedSeats: seatIds.length,
    });
    await this.dashboardGateway.emitSales(order.eventId);

    return cancelled;
  }

  /** Manual confirmation by support: PENDING_PAYMENT -> PAID. */
  async confirmBySupport(orderId: string, userId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { seatId: true } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status === OrderStatus.PAID) {
      return order;
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException(`Cannot confirm an order in status ${order.status}`);
    }

    const seatIds = order.items.map((item) => item.seatId);

    const confirmed = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.PAID },
      });
      if (updated.count === 0) {
        throw new ConflictException('Order status changed, please retry');
      }

      await tx.seat.updateMany({
        where: { id: { in: seatIds }, status: 'RESERVED' },
        data: { status: 'SOLD', reservationExpiresAt: null },
      });

      return tx.order.findUniqueOrThrow({ where: { id: orderId } });
    });

    await this.releaseLocks(order.eventId, seatIds);
    await this.auditLogService.log(userId, 'order_confirmed_by_support', 'order', orderId, {
      releasedSeats: seatIds.length,
    });
    await this.dashboardGateway.emitSales(order.eventId);

    return confirmed;
  }

  private assertCanAccessOrder(
    order: { buyerId: string; agencyId?: string | null },
    requesterId: string,
    role?: string,
  ) {
    if (role === 'ADMIN' || role === 'SUPPORT') {
      return;
    }
    if (order.buyerId === requesterId) {
      return;
    }
    if (role === 'AGENCY' && order.agencyId === requesterId) {
      return;
    }
    throw new ForbiddenException('You do not have access to this order');
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
