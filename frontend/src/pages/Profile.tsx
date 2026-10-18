import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuthStore } from '../store/auth';
import type { Order } from '../types';
import '../styles/profile.css';

export function Profile() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const { data } = await api.get<Order[]>('/orders');
        setOrders(data);
      } catch {
        setError('Не удалось загрузить заказы');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '24',
      minute: '24',
    });
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      PAID: '#22c55e',
      PENDING: '#f59e0b',
      CANCELLED: '#ef4444',
      REFUNDED: '#6b7280',
    };
    return colors[status] || '#6b7280';
  };

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>👤 Личный кабинет</h1>
        <button className="btn-secondary" onClick={logout}>
          Выйти
        </button>
      </div>

      {user && (
        <div className="profile-card">
          <h2>{user.fullName || user.email}</h2>
          <p>📧 {user.email}</p>
          <p>🎭 Роль: {user.role}</p>
        </div>
      )}

      <h2>📋 История заказов</h2>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : (
        <div className="orders-list">
          {orders.length === 0 ? (
            <div className="empty-state">
              <p>У вас пока нет заказов</p>
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="order-card">
                <div className="order-card-header">
                  <span>Заказ #{order.id.slice(0, 8)}</span>
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(order.status) }}
                  >
                    {order.status}
                  </span>
                </div>
                <div className="order-card-items">
                  {order.items.map((item) => (
                    <div key={item.id} className="order-item-mini">
                      <span>
                        Ряд {item.seat.row}, Место {item.seat.number}
                      </span>
                      <span>{item.price} ₽</span>
                    </div>
                  ))}
                </div>
                <div className="order-card-footer">
                  <span>📅 {formatDate(order.createdAt)}</span>
                  <strong>{order.totalAmount} ₽</strong>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
