import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { prisma } from '../../prisma/prisma.service';

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN || '*' },
  namespace: 'events',
})
export class BookingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(BookingGateway.name);

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /**
   * Client -> Server: subscribe:seats { eventId } (or a bare eventId string).
   * Joins the event room and pushes the full seat state once.
   */
  @SubscribeMessage('subscribe:seats')
  async subscribeToSeats(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { eventId?: string } | string,
  ) {
    const eventId = typeof body === 'string' ? body : body?.eventId;
    if (!eventId) {
      return { ok: false, error: 'eventId is required' };
    }

    await client.join(this.roomFor(eventId));

    const seats = await prisma.seat.findMany({
      where: { eventId },
      select: {
        id: true,
        rowNumber: true,
        seatNumber: true,
        categoryId: true,
        status: true,
        reservationExpiresAt: true,
      },
      orderBy: [{ rowNumber: 'asc' }, { seatNumber: 'asc' }],
    });

    client.emit('seat_status_initial', {
      eventId,
      seats,
      timestamp: new Date().toISOString(),
    });

    return { ok: true, eventId, count: seats.length };
  }

  @SubscribeMessage('unsubscribe:seats')
  async unsubscribeFromSeats(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { eventId?: string } | string,
  ) {
    const eventId = typeof body === 'string' ? body : body?.eventId;
    if (eventId) {
      await client.leave(this.roomFor(eventId));
    }
    return { ok: true };
  }

  handleSeatUpdate(eventId: string, seatIds: string[], oldStatus: string, newStatus: string) {
    if (!this.server) {
      return;
    }
    const timestamp = new Date().toISOString();
    for (const seatId of seatIds) {
      this.server.to(this.roomFor(eventId)).emit('seat_status_updated', {
        eventId,
        seatId,
        oldStatus,
        newStatus,
        timestamp,
      });
    }
  }

  private roomFor(eventId: string) {
    return `event:${eventId}`;
  }
}
