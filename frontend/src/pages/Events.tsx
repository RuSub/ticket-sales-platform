import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import type { Event } from '../types';
import '../styles/events.css';

export function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchEvents = async (query?: string) => {
    setLoading(true);
    try {
      const params = query ? { query } : {};
      const { data } = await api.get<Event[]>('/events', { params });
      setEvents(data);
    } catch {
      setError('Не удалось загрузить события');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEvents(search);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '24',
      minute: '24',
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      APPROVED: '#22c55e',
      DRAFT: '#f59e0b',
      PENDING: '#3b82f6',
      COMPLETED: '#6b7280',
      CANCELLED: '#ef4444',
    };
    return colors[status] || '#6b7280';
  };

  return (
    <div className="events-container">
      <div className="events-header">
        <h1>🎫 События</h1>
        <form className="search-form" onSubmit={handleSearch}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск событий..."
          />
          <button type="submit" className="btn-secondary">
            🔍
          </button>
        </form>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <div className="events-grid">
          {events.length === 0 ? (
            <div className="empty-state">
              <p>События не найдены</p>
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="event-card"
                onClick={() => navigate(`/events/${event.id}`)}
              >
                <div className="event-status" style={{ backgroundColor: getStatusColor(event.status) }}>
                  {event.status}
                </div>
                <h3>{event.title}</h3>
                <p className="event-description">{event.description}</p>
                <div className="event-meta">
                  <span className="event-date">📅 {formatDate(event.date)}</span>
                  <span className="event-location">📍 {event.location}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
