import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';

let socket: Socket | null = null;

/**
 * Shared Socket.IO connection to the `/events` namespace.
 * In dev Vite proxies `/socket.io` to the backend; in production nginx does it.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io('/events', {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socket;
}
