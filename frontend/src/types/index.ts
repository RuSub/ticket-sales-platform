export interface User {
  id: string;
  email: string;
  role: 'BUYER' | 'ORGANIZER' | 'AGENCY' | 'ADMIN' | 'SUPPORT';
  fullName: string | null;
  phone: string | null;
  isBlocked: boolean;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Omit<User, 'isBlocked' | 'createdAt'>;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  location: string;
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'HIDDEN' | 'COMPLETED' | 'CANCELLED';
  organizerId: string;
  venueTemplateId: string | null;
  imageUrl: string | null;
  createdAt: string;
}

export interface SeatCategory {
  id: string;
  name: string;
  price: number;
  row: number;
  seats: number;
}

export interface Seat {
  id: string;
  categoryId: string;
  row: number;
  number: number;
  status: 'AVAILABLE' | 'RESERVED' | 'BOOKED';
  category?: SeatCategory;
}

export interface VenueLayout {
  id: string;
  name: string;
  layout: Record<string, unknown>;
  categories: SeatCategory[];
  seats: Seat[];
}

export interface Order {
  id: string;
  userId: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED';
  totalAmount: number;
  createdAt: string;
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  seatId: string;
  price: number;
  seat: Seat;
}

export interface SearchFilters {
  query?: string;
  city?: string;
  genre?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
