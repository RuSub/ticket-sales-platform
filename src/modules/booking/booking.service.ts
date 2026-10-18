import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { BookingGateway } from './booking.gateway';
import { SeatStatus } from '@prisma/client';

@Injectable()
export class BookingService {
  constructor(
    private redisService: RedisService,
    private bookingGateway: BookingGateway,
  ) {}

  private getRedis() {
    return this.redisService.getClient();
  }

  async getAvailableSeats(eventId: string) {
    return prisma.seat.findMany({
      where: { eventId, status: 'AVAILABLE' },
      include: { category: true },
    });
  }

  async getSeatLayout(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { seats: { include: { category: true } }, categories: true },
    });
    return event;
  }

  async createReservation(buyerId: string, eventId: string, seatIds: string[]) {
    const redis = this.getRedis();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

    // Try to acquire locks for all seats
    const lockKeys = seatIds.map(sid => `reservation:${eventId}:${sid}`);
    for (const key of lockKeys) {
      await redis.set(key, `${buyerId}:${Date.now()}`, 'EX', 600, 'NX');
    }

    // Create reservation
    const reservation = await prisma.reservation.create({
      data: {
        buyerId,
        eventId,
        seatIds,
        expiresAt,
        status: 'ACTIVE',
      },
    });

    // Update seat statuses to RESERVED
    await prisma.seat.updateMany({
      where: { id: { in: seatIds }, eventId },
      data: { status: 'RESERVED', reservationExpiresAt: expiresAt },
    });

    // Emit WebSocket event
    this.bookingGateway.handleSeatUpdate(eventId, seatIds.join(','), 'AVAILABLE', 'RESERVED');

    return reservation;
  }

  async getReservations(buyerId: string) {
    return prisma.reservation.findMany({
      where: { buyerId, status: 'ACTIVE' },
      include: { event: { select: { id: true, title: true, eventDate: true } } },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async removeReservation(reservationId: string, buyerId: string) {
    const reservation = await prisma.reservation.findFirst({
      where: { id: reservationId, buyerId, status: 'ACTIVE' },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');

    await this.releaseSeats(reservation.eventId, reservation.seatIds);
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'EXPIRED' },
    });

    return { message: 'Reservation removed' };
  }

  async expireReservation(reservationId: string) {
    const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation) return;

    await this.releaseSeats(reservation.eventId, reservation.seatIds);
    await prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'EXPIRED' },
    });
  }

  async releaseSeats(eventId: string, seatIds: string[]) {
    const redis = this.getRedis();

    // Release Redis locks
    const lockKeys = seatIds.map(sid => `reservation:${eventId}:${sid}`);
    await redis.del(...lockKeys);

    // Update seat statuses
    await prisma.seat.updateMany({
      where: { id: { in: seatIds }, eventId },
      data: { status: 'AVAILABLE', reservationExpiresAt: null },
    });

    // Emit WebSocket event
    this.bookingGateway.handleSeatUpdate(eventId, seatIds.join(','), 'RESERVED', 'AVAILABLE');
  }

  async acquireSeatLock(eventId: string, seatId: string, buyerId: string): Promise<boolean> {
    const redis = this.getRedis();
    const lockKey = `reservation:${eventId}:${seatId}`;
    const acquired = await redis.set(lockKey, buyerId, 'EX', 600, 'NX');
    return !!acquired;
  }

  async releaseSeatLock(eventId: string, seatId: string) {
    const redis = this.getRedis();
    const lockKey = `reservation:${eventId}:${seatId}`;
    await redis.del(lockKey);
  }
}
