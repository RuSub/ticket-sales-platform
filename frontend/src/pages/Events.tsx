import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime } from '../utils/format';
import type { Event, EventGenre, EventListResponse } from '../types';
import '../styles/events.css';

const GENRE_LABELS: Record<EventGenre, string> = {
  CONCERT: 'Концерт',
  THEATER: 'Театр',
  SPORT: 'Спорт',
  CONFERENCE: 'Конференция',
  FESTIVAL: 'Фестиваль',
  OTHER: 'Другое',
};

export function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const load = useCallback(async (term: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = term.trim()
        ? await api.get<EventListResponse>('/events/search', { params: { q: term.trim() } })
        : await api.get<EventListResponse>('/events');
      setEvents(data.events);
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось загрузить события'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    void load(search);
  };

  return (
    <div className="events-container">
      <div className="events-header">
        <h1>🎫 События</h1>
        <form className="search-form" onSubmit={handleSearch}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название, площадка или описание..."
            aria-label="Поиск событий"
          />
          <button type="submit" className="btn-secondary">
            🔍
          </button>
        </form>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : events.length === 0 ? (
        <div className="empty-state">
          <p>{search ? 'По вашему запросу ничего не найдено' : 'Пока нет доступных событий'}</p>
        </div>
      ) : (
        <div className="events-grid">
          {events.map((event) => (
            <article
              key={event.id}
              className="event-card"
              onClick={() => navigate(`/events/${event.id}`)}
            >
              <span className="event-genre">{GENRE_LABELS[event.genre] ?? event.genre}</span>
              <h3>{event.title}</h3>
              {event.description && <p className="event-description">{event.description}</p>}
              <div className="event-meta">
                <span>📅 {formatDateTime(event.eventDate)}</span>
                <span>📍 {event.venueName ?? 'Площадка уточняется'}</span>
                {typeof event._count?.seats === 'number' && (
                  <span>🎟️ {event._count.seats} мест</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
