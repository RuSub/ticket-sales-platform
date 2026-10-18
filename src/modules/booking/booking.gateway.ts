import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'events',
})
export class BookingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  handleSeatUpdate(eventId: string, seatId: string, oldStatus: string, newStatus: string) {
    this.server.to(`event:${eventId}`).emit('seat_status_updated', {
      eventId,
      seatId,
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString(),
    });
  }
}
