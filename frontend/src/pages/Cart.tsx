import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime, formatExpiresIn, formatPrice } from '../utils/format';
import type { Order, Reservation, Seat, SeatLayoutResponse } from '../types';
import '../styles/cart.css';

export function Cart() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [seatsByEvent, setSeatsByEvent] = useState<Record<string, Seat[]>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: items } = await api.get<Reservation[]>('/cart');
      setReservations(items);

      const eventIds = [...new Set(items.map((item) => item.eventId))];
      const layouts = await Promise.all(
        eventIds.map(async (eventId) => {
          try {
            const { data } = await api.get<SeatLayoutResponse>(
              `/events/${eventId}/available-seats/layout`,
            );
            return [eventId, data.seats] as const;
          } catch {
            return [eventId, [] as Seat[]] as const;
          }
        }),
      );
      setSeatsByEvent(Object.fromEntries(layouts) as Record<string, Seat[]>);
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось загрузить корзину'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const seatsOf = (reservation: Reservation) =>
    (seatsByEvent[reservation.eventId] ?? []).filter((seat) =>
      reservation.seatIds.includes(seat.id),
    );

  const total = useMemo(
    () =>
      reservations.reduce(
        (sum, reservation) =>
          sum +
          seatsOf(reservation).reduce(
            (inner, seat) => inner + Number(seat.category?.price ?? 0),
            0,
          ),
        0,
      ),
    [reservations, seatsByEvent],
  );

  const handleCheckout = async (reservation: Reservation) => {
    setBusyId(reservation.id);
    setError(null);
    setNotice(null);
    try {
      const { data: order } = await api.post<Order>('/orders', { cartId: reservation.id });
      await api.post(`/payments/${order.id}/charge`, { paymentMethod: 'CARD' });
      setReservations((current) => current.filter((item) => item.id !== reservation.id));
      setNotice('Оплата прошла успешно. Билеты доступны в личном кабинете.');
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          'Не удалось оформить заказ. Проверьте личный кабинет: заказ мог быть создан.',
        ),
      );
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (reservation: Reservation) => {
    setBusyId(reservation.id);
    setError(null);
    try {
      await api.delete(`/cart/${reservation.id}`);
      setReservations((current) => current.filter((item) => item.id !== reservation.id));
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось освободить места'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="loading">Загрузка...</div>;
  }

  return (
    <div className="cart-container">
      <h1>🛒 Корзина</h1>

      {error && <div className="error-message">{error}</div>}
      {notice && (
        <div className="notice success">
          {notice} <Link to="/profile">Перейти в личный кабинет</Link>
        </div>
      )}

      {reservations.length === 0 ? (
        <div className="empty-state">
          <p>Корзина пуста — выберите места на странице события.</p>
          <button className="btn-primary" onClick={() => navigate('/')}>
            К событиям
          </button>
        </div>
      ) : (
        <>
          <div className="cart-items">
            {reservations.map((reservation) => {
              const seats = seatsOf(reservation);
              const sum = seats.reduce(
                (inner, seat) => inner + Number(seat.category?.price ?? 0),
                0,
              );

              return (
                <article key={reservation.id} className="reservation-card">
                  <div className="order-header">
                    <div>
                      <h3>{reservation.event?.title ?? 'Событие'}</h3>
                      {reservation.event && (
                        <span className="muted">
                          📅 {formatDateTime(reservation.event.eventDate)}
                        </span>
                      )}
                    </div>
                    <span className="order-status">
                      истекает через {formatExpiresIn(reservation.expiresAt)}
                    </span>
                  </div>

                  <div className="order-items">
                    {seats.length > 0 ? (
                      seats.map((seat) => (
                        <div key={seat.id} className="order-item">
                          <span>
                            Ряд {seat.rowNumber}, место {seat.seatNumber}
                            {seat.category ? ` · ${seat.category.name}` : ''}
                          </span>
                          <span>{formatPrice(seat.category?.price ?? 0)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="order-item">
                        <span>Мест забронировано: {reservation.seatIds.length}</span>
                        <span>—</span>
                      </div>
                    )}
                  </div>

                  <div className="order-footer">
                    <strong>Итого: {formatPrice(sum)}</strong>
                    <div className="order-actions">
                      <button
                        className="btn-primary"
                        onClick={() => handleCheckout(reservation)}
                        disabled={busyId === reservation.id}
                      >
                        {busyId === reservation.id ? 'Оформляем...' : 'Оформить и оплатить'}
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => handleRemove(reservation)}
                        disabled={busyId === reservation.id}
                      >
                        Убрать
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="cart-total">
            <h2>Общая сумма: {formatPrice(total)}</h2>
          </div>
        </>
      )}
    </div>
  );
}
