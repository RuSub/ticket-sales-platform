export type UserRole = 'BUYER' | 'ORGANIZER' | 'AGENCY' | 'ADMIN' | 'SUPPORT';

export type EventStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'CANCELLED' | 'HIDDEN';

export type EventGenre =
  | 'CONCERT'
  | 'THEATER'
  | 'SPORT'
  | 'CONFERENCE'
  | 'FESTIVAL'
  | 'OTHER';

export type SeatStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'BLOCKED';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'PAYMENT_FAILED'
  | 'CANCELLED'
  | 'COMPLETED';

export type ReservationStatus = 'ACTIVE' | 'EXPIRED' | 'CONVERTED';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface SeatCategory {
  id: string;
  name: string;
  zoneName: string | null;
  price: string | number;
  capacity: number;
}

export interface Seat {
  id: string;
  rowNumber: number;
  seatNumber: number;
  categoryId: string;
  status: SeatStatus;
  reservationExpiresAt: string | null;
  category?: SeatCategory;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  eventDate: string;
  venueName: string | null;
  venueAddress: string | null;
  genre: EventGenre;
  status: EventStatus;
  saleStartTime: string | null;
  createdAt?: string;
  categories?: SeatCategory[];
  seats?: Seat[];
  organizer?: { id: string; fullName: string | null };
  _count?: { seats: number };
}

export interface EventListResponse {
  events: Event[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SeatLayoutResponse {
  eventId: string;
  title: string;
  eventDate: string;
  categories: SeatCategory[];
  seats: Seat[];
}

export interface Reservation {
  id: string;
  buyerId: string;
  eventId: string;
  seatIds: string[];
  expiresAt: string;
  status: ReservationStatus;
  event?: { id: string; title: string; eventDate: string };
}

export interface OrderItem {
  id: string;
  seatId: string;
  categoryId: string;
  price: string | number;
  seat?: Seat;
  category?: SeatCategory;
}

export interface Order {
  id: string;
  buyerId: string;
  eventId: string;
  agencyId: string | null;
  status: OrderStatus;
  totalAmount: string | number;
  platformCommission: string | number;
  agencyCommission: string | number;
  createdAt: string;
  items: OrderItem[];
  event?: { id: string; title: string; eventDate: string; venueName: string | null };
}

export interface OrderListResponse {
  orders: Order[];
  total: number;
  page: number;
  totalPages: number;
}
