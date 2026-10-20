import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api/client';
import { getSocket } from '../api/socket';
import { useAuthStore } from '../store/auth';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime, formatPrice } from '../utils/format';
import type { Event, Seat, SeatStatus } from '../types';
import '../styles/event-detail.css';

type SeatSnapshot = Pick<
  Seat,
  'id' | 'rowNumber' | 'seatNumber' | 'categoryId' | 'status' | 'reservationExpiresAt'
>;

type SeatUpdatePayload = {
  eventId: string;
  seatId: string;
  oldStatus: SeatStatus;
  newStatus: SeatStatus;
};

export function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  const [event, setEvent] = useState<Event | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<Event>(`/events/${id}`);
      setEvent(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось загрузить событие'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live seat statuses. The gateway replies with the full state on subscribe
  // and then pushes diffs; selections are dropped when a seat is taken.
  useEffect(() => {
    if (!id) {
      return;
    }

    const socket = getSocket();

    const onInitial = (payload: { eventId: string; seats: SeatSnapshot[] }) => {
      if (payload.eventId !== id) {
        return;
      }
      setEvent((current) =>
        current ? { ...current, seats: payload.seats as Seat[] } : current,
      );
    };

    const onUpdated = (payload: SeatUpdatePayload) => {
      if (payload.eventId !== id) {
        return;
      }
      setEvent((current) =>
        current
          ? {
              ...current,
              seats: (current.seats ?? []).map((seat) =>
                seat.id === payload.seatId ? { ...seat, status: payload.newStatus } : seat,
              ),
            }
          : current,
      );
      if (payload.newStatus !== 'AVAILABLE') {
        setSelected((current) => {
          if (!current.has(payload.seatId)) {
            return current;
          }
          const next = new Set(current);
          next.delete(payload.seatId);
          return next;
        });
      }
    };

    socket.on('seat_status_initial', onInitial);
    socket.on('seat_status_updated', onUpdated);
    socket.emit('subscribe:seats', { eventId: id });

    return () => {
      socket.emit('unsubscribe:seats', { eventId: id });
      socket.off('seat_status_initial', onInitial);
      socket.off('seat_status_updated', onUpdated);
    };
  }, [id]);

  const categoryById = useMemo(
    () => new Map((event?.categories ?? []).map((category) => [category.id, category])),
    [event],
  );

  const groupedSeats = useMemo(
    () =>
      (event?.categories ?? []).map((category) => ({
        category,
        seats: (event?.seats ?? [])
          .filter((seat) => seat.categoryId === category.id)
          .sort((a, b) => a.rowNumber - b.rowNumber || a.seatNumber - b.seatNumber),
      })),
    [event],
  );

  const selectedSeats = useMemo(
    () => (event?.seats ?? []).filter((seat) => selected.has(seat.id)),
    [event, selected],
  );

  const total = selectedSeats.reduce(
    (sum, seat) => sum + Number(categoryById.get(seat.categoryId)?.price ?? 0),
    0,
  );

  const toggleSeat = (seat: Seat) => {
    if (seat.status !== 'AVAILABLE') {
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(seat.id)) {
        next.delete(seat.id);
      } else {
        next.add(seat.id);
      }
      return next;
    });
  };

  const handleBook = async () => {
    if (!id || selected.size === 0) {
      return;
    }
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    setBooking(true);
    setError(null);
    try {
      await api.post('/cart', { eventId: id, seatIds: [...selected] });
      navigate('/cart');
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось забронировать места'));
      setSelected(new Set());
      await load();
    } finally {
      setBooking(false);
    }
  };

  if (loading) {
    return <div className="loading">Загрузка...</div>;
  }
  if (!event) {
    return <div className="error-message">{error ?? 'Событие не найдено'}</div>;
  }

  return (
    <div className="event-detail-container">
      <button className="btn-back" onClick={() => navigate('/')}>
        ← К событиям
      </button>

      <div className="event-info">
        <h1>{event.title}</h1>
        {event.description && <p className="event-description">{event.description}</p>}
        <div className="event-meta">
          <span>📅 {formatDateTime(event.eventDate)}</span>
          <span>📍 {event.venueName ?? 'Площадка уточняется'}</span>
          {event.venueAddress && <span>🗺️ {event.venueAddress}</span>}
        </div>
        {event.status !== 'APPROVED' && (
          <div className="notice">Событие ещё не одобрено — бронирование недоступно.</div>
        )}
      </div>

      <div className="venue-layout">
        <div className="venue-header">
          <h2>Выберите места</h2>
          <span className="live-badge">● обновляется в реальном времени</span>
        </div>

        <div className="seat-legend">
          <span className="legend-item">
            <span className="seat available" /> Свободно
          </span>
          <span className="legend-item">
            <span className="seat selected" /> Выбрано
          </span>
          <span className="legend-item">
            <span className="seat sold" /> Занято
          </span>
          <span className="legend-item">
            <span className="seat blocked" /> Недоступно
          </span>
        </div>

        {groupedSeats.length === 0 ? (
          <div className="empty-state">
            <p>Для этого события ещё не сгенерированы места.</p>
          </div>
        ) : (
          groupedSeats.map(({ category, seats }) => (
            <section key={category.id} className="category-section">
              <h3>
                {category.name} — {formatPrice(category.price)}
              </h3>
              <div className="seats-grid">
                {seats.map((seat) => {
                  const visual = selected.has(seat.id)
                    ? 'selected'
                    : seat.status === 'AVAILABLE'
                      ? 'available'
                      : seat.status === 'BLOCKED'
                        ? 'blocked'
                        : 'sold';

                  return (
                    <button
                      key={seat.id}
                      type="button"
                      className={`seat ${visual}`}
                      onClick={() => toggleSeat(seat)}
                      disabled={seat.status !== 'AVAILABLE'}
                      title={`Ряд ${seat.rowNumber}, место ${seat.seatNumber} — ${seat.status}`}
                    >
                      {seat.seatNumber}
                    </button>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {selected.size > 0 && (
        <div className="cart-summary">
          <div>
            <p>
              Выбрано мест: {selected.size} · {formatPrice(total)}
            </p>
            <small className="muted">Места удерживаются 10 минут после бронирования</small>
          </div>
          <button className="btn-primary" onClick={handleBook} disabled={booking}>
            {booking ? 'Бронируем...' : isAuthenticated ? 'Забронировать' : 'Войти и забронировать'}
          </button>
        </div>
      )}
    </div>
  );
}
