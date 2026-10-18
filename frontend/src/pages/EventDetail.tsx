import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import type { Event, SeatCategory, Seat } from '../types';
import '../styles/event-detail.css';

export function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<Event | null>(null);
  const [categories, setCategories] = useState<SeatCategory[]>([]);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [cartLoading, setCartLoading] = useState(false);

  useEffect(() => {
    const fetchEvent = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const { data: eventData } = await api.get<Event>(`/events/${id}`);
        setEvent(eventData);

        const { data: layout } = await api.get(`/booking/venue/${id}/layout`);
        setCategories(layout.categories || []);
        setSeats(layout.seats || []);
      } catch {
        setError('Не удалось загрузить событие');
      } finally {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [id]);

  const handleSeatClick = (seatId: string) => {
    const seat = seats.find((s) => s.id === seatId);
    if (!seat || seat.status !== 'AVAILABLE') return;

    setSelectedSeats((prev) =>
      prev.includes(seatId)
        ? prev.filter((id) => id !== seatId)
        : [...prev, seatId]
    );
  };

  const getSeatStatus = (seat: Seat) => {
    if (selectedSeats.includes(seat.id)) return 'selected';
    if (seat.status === 'RESERVED' || seat.status === 'BOOKED') return 'booked';
    return 'available';
  };

  const handleAddToCart = async () => {
    if (selectedSeats.length === 0) return;
    setCartLoading(true);
    try {
      await api.post('/booking/cart', { seatIds: selectedSeats });
      navigate('/cart');
    } catch {
      setError('Не удалось добавить места в корзину');
    } finally {
      setCartLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '24',
      minute: '24',
    });
  };

  if (loading) return <div className="loading">Загрузка...</div>;
  if (error) return <div className="error-message">{error}</div>;
  if (!event) return <div className="empty-state">Событие не найдено</div>;

  return (
    <div className="event-detail-container">
      <button className="btn-back" onClick={() => navigate('/')}>
        ← Назад
      </button>

      <div className="event-info">
        <h1>{event.title}</h1>
        <p className="event-description">{event.description}</p>
        <div className="event-meta">
          <span>📅 {formatDate(event.date)}</span>
          <span>📍 {event.location}</span>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="venue-layout">
          <h2>Выберите места</h2>
          <div className="seat-legend">
            <span className="legend-item">
              <span className="seat available" /> Свободно
            </span>
            <span className="legend-item">
              <span className="seat selected" /> Выбрано
            </span>
            <span className="legend-item">
              <span className="seat booked" /> Занято
            </span>
          </div>

          <div className="categories-grid">
            {categories.map((category) => (
              <div key={category.id} className="category-section">
                <h3>{category.name} — {category.price} ₽</h3>
                <div className="seats-grid">
                  {seats
                    .filter((s) => s.categoryId === category.id)
                    .sort((a, b) => a.row - b.row || a.number - b.number)
                    .map((seat) => (
                      <button
                        key={seat.id}
                        className={`seat ${getSeatStatus(seat)}`}
                        onClick={() => handleSeatClick(seat.id)}
                        disabled={seat.status !== 'AVAILABLE'}
                        title={`Ряд ${seat.row}, Место ${seat.number}`}
                      >
                        {seat.number}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedSeats.length > 0 && (
        <div className="cart-summary">
          <p>Выбрано мест: {selectedSeats.length}</p>
          <button
            className="btn-primary"
            onClick={handleAddToCart}
            disabled={cartLoading}
          >
            {cartLoading ? 'Добавление...' : 'В корзину'}
          </button>
        </div>
      )}
    </div>
  );
}
