import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import type { Order } from '../types';
import '../styles/cart.css';

export function Cart() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Order[]>('/orders');
      setOrders(data.filter((o) => o.status === 'PENDING'));
    } catch {
      setError('Не удалось загрузить корзину');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handleCheckout = async (orderId: string) => {
    try {
      await api.post(`/payments/${orderId}/pay`);
      await fetchOrders();
    } catch {
      setError('Ошибка оплаты');
    }
  };

  const handleCancel = async (orderId: string) => {
    try {
      await api.post(`/orders/${orderId}/cancel`);
      await fetchOrders();
    } catch {
      setError('Ошибка отмены');
    }
  };

  if (loading) return <div className="loading">Загрузка...</div>;
  if (error) return <div className="error-message">{error}</div>;

  const totalAmount = orders.reduce((sum, order) => sum + order.totalAmount, 0);

  return (
    <div className="cart-container">
      <h1>🛒 Корзина</h1>

      {orders.length === 0 ? (
        <div className="empty-state">
          <p>Корзина пуста</p>
          <button className="btn-primary" onClick={() => navigate('/')}>
            К событиям
          </button>
        </div>
      ) : (
        <div className="cart-items">
          {orders.map((order) => (
            <div key={order.id} className="cart-order">
              <div className="order-header">
                <span>Заказ #{order.id.slice(0, 8)}</span>
                <span className="order-status">Ожидает оплаты</span>
              </div>
              <div className="order-items">
                {order.items.map((item) => (
                  <div key={item.id} className="order-item">
                    <span>
                      Ряд {item.seat.row}, Место {item.seat.number}
                    </span>
                    <span>{item.price} ₽</span>
                  </div>
                ))}
              </div>
              <div className="order-footer">
                <strong>Итого: {order.totalAmount} ₽</strong>
                <div className="order-actions">
                  <button
                    className="btn-primary"
                    onClick={() => handleCheckout(order.id)}
                  >
                    Оплатить
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => handleCancel(order.id)}
                  >
                    Отменить
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {orders.length > 0 && (
        <div className="cart-total">
          <h2>Общая сумма: {totalAmount} ₽</h2>
        </div>
      )}
    </div>
  );
}
