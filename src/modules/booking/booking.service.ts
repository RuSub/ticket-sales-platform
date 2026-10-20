import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reservation } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { EventService } from '../event/event.service';
import { BookingGateway } from './booking.gateway';

const RESERVATION_TTL_SECONDS = 10 * 60;

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly bookingGateway: BookingGateway,
    private readonly eventService: EventService,
  ) {}

  async getAvailableSeats(eventId: string) {
    return prisma.seat.findMany({
      where: { eventId, status: 'AVAILABLE' },
      include: { category: true },
      orderBy: [{ rowNumber: 'asc' }, { seatNumber: 'asc' }],
    });
  }

  async getSeatLayout(eventId: string) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        seats: { include: { category: true }, orderBy: [{ rowNumber: 'asc' }, { seatNumber: 'asc' }] },
        categories: true,
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return {
      eventId: event.id,
      title: event.title,
      eventDate: event.eventDate,
      categories: event.categories,
      seats: event.seats,
    };
  }

  async createReservation(buyerId: string, eventId: string, seatIds: string[]) {
    const uniqueSeatIds = [...new Set(seatIds ?? [])];
    if (!eventId) {
      throw new BadRequestException('eventId is required');
    }
    if (uniqueSeatIds.length === 0) {
      throw new BadRequestException('seatIds must not be empty');
    }

    await this.eventService.isSaleAvailable(eventId);

    const seats = await prisma.seat.findMany({
      where: { id: { in: uniqueSeatIds }, eventId },
      select: { id: true, status: true },
    });

    if (seats.length !== uniqueSeatIds.length) {
      throw new BadRequestException('Some seats do not belong to this event');
    }
    if (seats.some((seat) => seat.status !== 'AVAILABLE')) {
      throw new ConflictException('Seat is no longer available');
    }

    const redis = this.redisService.getClient();
    const acquiredLocks: string[] = [];
    let reservation: Reservation;

    try {
      // Locks are taken one by one; if any seat is already locked we release
      // everything we took and fail, so two buyers can never hold the same seat.
      for (const seatId of uniqueSeatIds) {
        const key = this.lockKey(eventId, seatId);
        const acquired = await redis.set(key, buyerId, 'EX', RESERVATION_TTL_SECONDS, 'NX');
        if (acquired !== 'OK') {
          throw new ConflictException('Seat is no longer available');
        }
        acquiredLocks.push(key);
      }

      const expiresAt = new Date(Date.now() + RESERVATION_TTL_SECONDS * 1000);

      reservation = await prisma.$transaction(async (tx) => {
        // Conditional update is the real guard: only AVAILABLE seats are claimed.
        const claimed = await tx.seat.updateMany({
          where: { id: { in: uniqueSeatIds }, eventId, status: 'AVAILABLE' },
          data: { status: 'RESERVED', reservationExpiresAt: expiresAt },
        });

        if (claimed.count !== uniqueSeatIds.length) {
          throw new ConflictException('Seat is no longer available');
        }

        return tx.reservation.create({
          data: {
            buyerId,
            eventId,
            seatIds: uniqueSeatIds,
            expiresAt,
            status: 'ACTIVE',
          },
        });
      });
    } catch (error) {
      if (acquiredLocks.length > 0) {
        await redis.del(...acquiredLocks).catch(() => undefined);
      }
      throw error;
    }

    this.bookingGateway.handleSeatUpdate(eventId, uniqueSeatIds, 'AVAILABLE', 'RESERVED');
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
    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    await prisma.$transaction(async (tx) => {
      await tx.reservation.updateMany({
        where: { id: reservationId, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });
      await tx.seat.updateMany({
        where: {
          id: { in: reservation.seatIds },
          eventId: reservation.eventId,
          status: 'RESERVED',
        },
        data: { status: 'AVAILABLE', reservationExpiresAt: null },
      });
    });

    await this.releaseLocks(reservation.eventId, reservation.seatIds);
    this.bookingGateway.handleSeatUpdate(
      reservation.eventId,
      reservation.seatIds,
      'RESERVED',
      'AVAILABLE',
    );

    return { message: 'Reservation removed' };
  }

  /** Releases one reservation and cancels unpaid orders that hold its seats. */
  async expireReservation(reservationId: string): Promise<boolean> {
    const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!reservation || reservation.status !== 'ACTIVE') {
      return false;
    }

    const seatIds = reservation.seatIds;

    const expired = await prisma.$transaction(async (tx) => {
      const claimed = await tx.reservation.updateMany({
        where: { id: reservationId, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });
      if (claimed.count === 0) {
        return false;
      }

      await tx.order.updateMany({
        where: {
          buyerId: reservation.buyerId,
          eventId: reservation.eventId,
          status: 'PENDING_PAYMENT',
          items: { some: { seatId: { in: seatIds } } },
        },
        data: { status: 'CANCELLED' },
      });

      await tx.seat.updateMany({
        where: {
          id: { in: seatIds },
          eventId: reservation.eventId,
          status: 'RESERVED',
        },
        data: { status: 'AVAILABLE', reservationExpiresAt: null },
      });

      return true;
    });

    if (!expired) {
      return false;
    }

    await this.releaseLocks(reservation.eventId, seatIds);
    this.bookingGateway.handleSeatUpdate(reservation.eventId, seatIds, 'RESERVED', 'AVAILABLE');
    return true;
  }

  /** Used by the expiry scheduler. Returns number of released reservations. */
  async expireOverdueReservations(): Promise<number> {
    const overdue = await prisma.reservation.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: new Date() } },
      select: { id: true },
      orderBy: { expiresAt: 'asc' },
      take: 200,
    });

    let released = 0;
    for (const reservation of overdue) {
      try {
        if (await this.expireReservation(reservation.id)) {
          released += 1;
        }
      } catch (error) {
        this.logger.error(
          `Failed to expire reservation ${reservation.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return released;
  }

  private async releaseLocks(eventId: string, seatIds: string[]) {
    if (!seatIds.length) {
      return;
    }
    await this.redisService
      .getClient()
      .del(...seatIds.map((seatId) => this.lockKey(eventId, seatId)))
      .catch(() => undefined);
  }

  private lockKey(eventId: string, seatId: string) {
    return `reservation:${eventId}:${seatId}`;
  }
}
