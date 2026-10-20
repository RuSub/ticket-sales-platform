import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { prisma } from '../../prisma/prisma.service';

type SocketUser = { sub: string; role: string };

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN || '*' },
  namespace: 'dashboards',
})
export class DashboardGateway implements OnGatewayConnection {
  private readonly logger = new Logger(DashboardGateway.name);
  private readonly jwt = new JwtService();

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const rawToken = (client.handshake.auth?.token ??
      client.handshake.headers?.authorization) as string | undefined;
    const token = rawToken?.startsWith('Bearer ') ? rawToken.slice(7) : rawToken;
    if (!token) {
      return;
    }

    try {
      const payload = this.jwt.verify<SocketUser>(token, {
        secret: process.env.JWT_SECRET,
      });
      client.data.user = { sub: payload.sub, role: payload.role };
    } catch {
      this.logger.debug(`Rejected dashboards socket ${client.id}: invalid token`);
    }
  }

  @SubscribeMessage('subscribe:organizer')
  async subscribeOrganizer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { eventId?: string } | string,
  ) {
    const eventId = typeof body === 'string' ? body : body?.eventId;
    const user = client.data.user as SocketUser | undefined;

    if (!user) {
      return { ok: false, error: 'Authentication required' };
    }
    if (!eventId) {
      return { ok: false, error: 'eventId is required' };
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true },
    });
    if (!event) {
      return { ok: false, error: 'Event not found' };
    }
    if (user.role !== 'ADMIN' && event.organizerId !== user.sub) {
      return { ok: false, error: 'Forbidden' };
    }

    await client.join(this.organizerRoom(eventId));
    client.emit('sales_updated', await this.salesSnapshot(eventId));

    return { ok: true, eventId };
  }

  @SubscribeMessage('subscribe:agency')
  async subscribeAgency(@ConnectedSocket() client: Socket) {
    const user = client.data.user as SocketUser | undefined;

    if (!user) {
      return { ok: false, error: 'Authentication required' };
    }
    if (user.role !== 'AGENCY' && user.role !== 'ADMIN') {
      return { ok: false, error: 'Forbidden' };
    }

    await client.join(this.agencyRoom(user.sub));
    client.emit('stats_updated', await this.agencySnapshot(user.sub));

    return { ok: true, agencyId: user.sub };
  }

  async emitSales(eventId: string) {
    if (!this.server) {
      return;
    }
    const snapshot = await this.salesSnapshot(eventId);
    this.server.to(this.organizerRoom(eventId)).emit('sales_updated', snapshot);
  }

  async emitAgency(agencyId: string) {
    if (!this.server) {
      return;
    }
    this.server.to(this.agencyRoom(agencyId)).emit('stats_updated', await this.agencySnapshot(agencyId));
  }

  private async salesSnapshot(eventId: string) {
    const [seatGroups, paidOrders] = await Promise.all([
      prisma.seat.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } }),
      prisma.order.aggregate({
        where: { eventId, status: 'PAID' },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
    ]);

    const seats = Object.fromEntries(
      seatGroups.map((group) => [group.status, group._count._all]),
    );

    return {
      eventId,
      available: seats.AVAILABLE ?? 0,
      reserved: seats.RESERVED ?? 0,
      sold: seats.SOLD ?? 0,
      paidOrders: paidOrders._count._all,
      revenue: paidOrders._sum.totalAmount ?? 0,
      timestamp: new Date().toISOString(),
    };
  }

  private async agencySnapshot(agencyId: string) {
    const where = { agencyId, status: 'PAID' as const };

    const [summary, tickets] = await Promise.all([
      prisma.order.aggregate({
        where,
        _count: { _all: true },
        _sum: { totalAmount: true, agencyCommission: true },
      }),
      prisma.orderItem.count({ where: { order: where } }),
    ]);

    return {
      agencyId,
      totalOrders: summary._count._all,
      totalTicketsSold: tickets,
      totalRevenue: summary._sum.totalAmount ?? 0,
      totalCommission: summary._sum.agencyCommission ?? 0,
      timestamp: new Date().toISOString(),
    };
  }

  private organizerRoom(eventId: string) {
    return `organizer:${eventId}`;
  }

  private agencyRoom(agencyId: string) {
    return `agency:${agencyId}`;
  }
}
