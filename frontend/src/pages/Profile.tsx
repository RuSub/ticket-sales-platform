import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../store/auth';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime, formatPrice } from '../utils/format';
import type { Order, OrderListResponse, OrderStatus } from '../types';
import '../styles/profile.css';

const STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Ожидает оплаты',
  PAID: 'Оплачен',
  PAYMENT_FAILED: 'Ошибка оплаты',
  CANCELLED: 'Отменён',
  COMPLETED: 'Завершён',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: '#f59e0b',
  PAID: '#22c55e',
  PAYMENT_FAILED: '#ef4444',
  CANCELLED: '#6b7280',
  COMPLETED: '#3b82f6',
};

export function Profile() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<OrderListResponse>('/orders');
      setOrders(data.orders);
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось загрузить заказы'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (orderId: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(orderId);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Не удалось выполнить действие'));
    } finally {
      setBusyId(null);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>👤 Личный кабинет</h1>
        <button className="btn-logout" onClick={handleLogout}>
          Выйти
        </button>
      </div>

      {user && (
        <div className="profile-card">
          <h2>{user.fullName || user.email}</h2>
          <p>📧 {user.email}</p>
          <p>🎭 Роль: {user.role}</p>
          {user.phone && <p>📱 {user.phone}</p>}
        </div>
      )}

      <h2>📋 История заказов</h2>

      {error && <div className="error-message">{error}</div>}
      {notice && <div className="notice success">{notice}</div>}

      {loading ? (
        <div className="loading">Загрузка...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <p>У вас пока нет заказов</p>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <article key={order.id} className="order-card">
              <div className="order-card-header">
                <div>
                  <strong>{order.event?.title ?? `Заказ #${order.id.slice(0, 8)}`}</strong>
                  {order.event && (
                    <div className="muted">📅 {formatDateTime(order.event.eventDate)}</div>
                  )}
                </div>
                <span
                  className="status-badge"
                  style={{ backgroundColor: STATUS_COLORS[order.status] }}
                >
                  {STATUS_LABELS[order.status]}
                </span>
              </div>

              <div className="order-card-items">
                {order.items.map((item) => (
                  <div key={item.id} className="order-item-mini">
                    <span>
                      Ряд {item.seat?.rowNumber ?? '—'}, место {item.seat?.seatNumber ?? '—'}
                      {item.category ? ` · ${item.category.name}` : ''}
                    </span>
                    <span>{formatPrice(item.price)}</span>
                  </div>
                ))}
              </div>

              <div className="order-card-footer">
                <span>📅 {formatDateTime(order.createdAt)}</span>
                <div className="order-card-actions">
                  <strong>{formatPrice(order.totalAmount)}</strong>

                  {order.status === 'PENDING_PAYMENT' && (
                    <>
                      <button
                        className="btn-primary btn-small"
                        disabled={busyId === order.id}
                        onClick={() =>
                          runAction(
                            order.id,
                            () =>
                              api.post(`/payments/${order.id}/charge`, {
                                paymentMethod: 'CARD',
                              }),
                            'Оплата прошла успешно',
                          )
                        }
                      >
                        Оплатить
                      </button>
                      <button
                        className="btn-secondary btn-small"
                        disabled={busyId === order.id}
                        onClick={() =>
                          runAction(
                            order.id,
                            () => api.post(`/orders/${order.id}/cancel`),
                            'Заказ отменён',
                          )
                        }
                      >
                        Отменить
                      </button>
                    </>
                  )}

                  {order.status === 'PAID' && (
                    <button
                      className="btn-secondary btn-small"
                      disabled={busyId === order.id}
                      onClick={() =>
                        runAction(
                          order.id,
                          () => api.post('/returns', { orderId: order.id }),
                          'Запрос на возврат отправлен организатору',
                        )
                      }
                    >
                      Запросить возврат
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
