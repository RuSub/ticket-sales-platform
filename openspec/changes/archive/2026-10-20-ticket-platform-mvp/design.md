# Design

## Architecture: Модульный Монолит

### Decision: Модульный монолит вместо микросервисов

**Context:** MVP требует быстрой разработки и простоты. Пиковая нагрузка 10 000 req/s требует горизонтального масштабирования.

**Decision:** Используем модульный монолит с чёткими границами модулей. Каждый модуль — самостоятельная единица с собственными entities, services, controllers. При росте критичные модули (booking, payment) можно вынести в отдельные сервисы.

**Consequences:**
- (+) Проще разработка и деплой
- (+) Нет сетевой задержки между модулями
- (+) Проще тестирование и отладка
- (-) Масштабирование на уровне модулей, не сервисов
- (-) Риск cross-module coupling (mitigated через чёткие boundaries)

### Decision: NestJS как фреймворк

**Context:** Требуется модульная архитектура, TypeScript, DI, поддержка WebSocket.

**Decision:** NestJS с модульной архитектурой. Каждый модуль соответствует capability из specs.

**Consequences:**
- (+) Встроенная DI, модульность
- (+) TypeScript из коробки
- (+) Поддержка WebSocket (Socket.IO adapter)
- (+) Встроенная валидация (class-validator)
- (+) Готовые стратегии аутентификации (Passport.js)

### Decision: PostgreSQL + JSONB

**Context:** Нужна строгая консистентность для билетов, но гибкость для схем залов.

**Decision:** PostgreSQL 15+ с JSONB для схем залов. Все транзакционные данные — в реляционных таблицах.

**Consequences:**
- (+) ACID транзакции для билетов
- (+) JSONB для гибких схем залов
- (+) Full-Text Search встроен
- (+) Надёжность и зрелость
- (-) Вертикальное масштабирование (mitigated через read replicas)

### Decision: Redis для блокировок и кэша

**Context:** Высокая конкуренция за места требует быстрых distributed locks.

**Decision:** Redis 7+ для distributed locks (resilient-lock), кэша схем залов, и TTL-управления резервированиями.

**Consequences:**
- (+) Миллисекундные операции lock/unlock
- (+) TTL для автоматического освобождения резервов
- (+) Pub/Sub для real-time уведомлений
- (-) Дополнительная инфраструктура

### Decision: Kafka для событий

**Context:** Real-time обновления статусов, асинхронная обработка email, Saga pattern.

**Decision:** Apache Kafka для event-driven архитектуры.

**Topics:**
- `events.order.created` — заказ создан
- `events.order.paid` — заказ оплачен
- `events.order.cancelled` — заказ отменён
- `events.seat.reserved` — место зарезервировано
- `events.seat.available` — место свободно
- `events.payment.completed` — платёж завершён
- `events.payment.failed` — платёж отклонён
- `events.notification.email` — отправка email
- `events.return.requested` — запрос на возврат
- `events.return.approved` — возврат одобрен
- `events.return.rejected` — возврат отклонён

**Consequences:**
- (+) Event sourcing ready
- (+) Decoupled modules
- (+) Real-time streaming
- (-) Дополнительная инфраструктура

### Decision: WebSocket для real-time

**Context:** Статусы мест должны обновляться < 1 сек.

**Decision:** WebSocket через Socket.IO adapter NestJS. SSE как fallback для HTTP-only клиентов.

**Consequences:**
- (+) Push-уведомления в реальном времени
- (+) Низкая задержка
- (+) Socket.IO поддерживает fallback на polling
- (-) Сложнее масштабирование (mitigated через Redis adapter)

## Database Schema

### Core Tables

```sql
-- Users
users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role USER_ROLE NOT NULL DEFAULT 'BUYER',
  full_name VARCHAR(255),
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

-- Events
events (
  id UUID PRIMARY KEY,
  organizer_id UUID REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_date TIMESTAMP NOT NULL,
  venue_name VARCHAR(255),
  venue_address TEXT,
  genre EVENT_GENRE NOT NULL,
  status EVENT_STATUS DEFAULT 'DRAFT',
  sale_start_time TIMESTAMP,
  template_id UUID REFERENCES venue_templates(id),
  venue_layout JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

-- Venue Templates
venue_templates (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  layout_schema JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
)

-- Seats
seats (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  seat_number INTEGER NOT NULL,
  category_id UUID REFERENCES seat_categories(id),
  status SEAT_STATUS DEFAULT 'AVAILABLE',
  reservation_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

-- Seat Categories
seat_categories (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  zone_name VARCHAR(100),
  price DECIMAL(10,2) NOT NULL,
  capacity INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
)

-- Orders
orders (
  id UUID PRIMARY KEY,
  buyer_id UUID REFERENCES users(id),
  event_id UUID REFERENCES events(id),
  agency_id UUID REFERENCES users(id),
  status ORDER_STATUS DEFAULT 'PENDING_PAYMENT',
  total_amount DECIMAL(10,2) NOT NULL,
  platform_commission DECIMAL(10,2) DEFAULT 0,
  agency_commission DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

-- Order Items
order_items (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  seat_id UUID REFERENCES seats(id),
  category_id UUID REFERENCES seat_categories(id),
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
)

-- Reservations (Cart)
reservations (
  id UUID PRIMARY KEY,
  buyer_id UUID REFERENCES users(id),
  event_id UUID REFERENCES events(id),
  seat_ids UUID[] NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status RESERVATION_STATUS DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW()
)

-- Returns
returns (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  buyer_id UUID REFERENCES users(id),
  status RETURN_STATUS DEFAULT 'PENDING',
  reason TEXT,
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

-- Audit Log
audit_log (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id UUID,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMP DEFAULT NOW()
)

-- Outbox
outbox (
  id UUID PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status OUTBOX_STATUS DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP
)

-- Platform Settings
platform_settings (
  id UUID PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
)
```

## API Design

### REST Endpoints

```
/auth
  POST   /auth/register          # Регистрация
  POST   /auth/login             # Вход
  POST   /auth/refresh           # Обновление токена
  POST   /auth/logout            # Выход
  POST   /auth/oauth2/:provider  # OAuth2 авторизация

/users
  GET    /users/me               # Профиль
  PATCH  /users/me               # Обновление профиля

/events
  GET    /events                 # Список (пагинация, фильтры)
  GET    /events/:id             # Детали
  POST   /events                 # Создание (ORGANIZER)
  PATCH  /events/:id             # Обновление (ORGANIZER)
  DELETE /events/:id             # Удаление (ORGANIZER)

/events/search
  GET    /events/search          # Поиск

/events/:eventId
  GET    /events/:eventId/available-seats  # Доступные места
  PUT    /events/:eventId/venue-layout     # Обновление схемы (ORGANIZER)

/venue-templates
  GET    /venue-templates        # Шаблоны залов

/cart
  GET    /cart                   # Корзина
  POST   /cart                   # Добавить в корзину
  DELETE /cart/:reservationId    # Удалить из корзины

/orders
  GET    /orders                 # История заказов
  GET    /orders/:id             # Детали заказа
  POST   /orders                 # Создание заказа
  POST   /orders/:id/cancel      # Отмена заказа

/payments
  POST   /payments/:orderId/charge  # Оплата

/returns
  GET    /returns                # История возвратов
  POST   /returns                 # Запрос на возврат
  DELETE /returns/:returnId       # Отмена запроса

/organizer
  GET    /organizer/events/:eventId/dashboard  # Дашборд
  GET    /organizer/events/:eventId/stats      # Статистика
  GET    /organizer/returns/pending            # Запросы на возврат
  POST   /organizer/events/:eventId/agencies   # Назначить агентство
  GET    /organizer/events/:eventId/agencies/stats  # Статистика агентств
  POST   /organizer/returns/:returnId/approve  # Одобрить возврат
  POST   /organizer/returns/:returnId/reject   # Отклонить возврат

/agency
  GET    /agency/events              # Назначенные мероприятия
  POST   /agency/orders               # Продажа билетов
  GET    /agency/stats                # Статистика

/admin
  GET    /admin/users                # Управление пользователями
  PATCH  /admin/users/:id/role       # Изменение роли
  POST   /admin/users/:id/block      # Блокировка
  POST   /admin/users/:id/unblock    # Разблокировка
  GET    /admin/events/pending       # Очередь модерации
  POST   /admin/events/:id/approve   # Одобрение
  POST   /admin/events/:id/reject    # Отклонение
  GET    /admin/settings/commission  # Настройка комиссии
  PATCH  /admin/settings/commission  # Изменение комиссии
  GET    /admin/analytics            # Глобальная аналитика

/support
  GET    /support/orders             # Поиск заказов
  GET    /support/orders/:id         # Детали заказа
  GET    /support/orders/:id/history # История действий
  POST   /support/orders/:id/cancel  # Ручная отмена
  POST   /support/orders/:id/confirm # Ручное подтверждение
  POST   /support/returns/:id/approve # Ручное одобрение возврата
  POST   /support/returns/:id/reject  # Ручное отклонение возврата
```

### WebSocket Events

```
Client -> Server:
  subscribe:seats:{eventId}   # Подписка на обновления мест
  subscribe:organizer:{eventId}  # Подписка на дашборд организатора
  subscribe:agency:stats      # Подписка на статистику агентства

Server -> Client:
  seat_status_updated: { eventId, seatId, oldStatus, newStatus, timestamp }
  sales_updated: { eventId, sold, reserved, available, revenue }
  stats_updated: { totalTicketsSold, totalRevenue, totalCommission }
```

## Security Design

### Authentication Flow

```
1. User registers/logs in -> JWT tokens returned
2. Access token (15 min TTL) in Authorization: Bearer header
3. Refresh token (7 day TTL) in httpOnly cookie
4. On access token expiry -> POST /auth/refresh
5. On refresh token expiry -> re-login
```

### Authorization Flow

```
1. JWT contains { userId, role, iat, exp }
2. @Roles() decorator checks role from JWT
3. @Owner() decorator checks resource ownership
4. @Audit() decorator logs admin/support actions
```

### Data Protection

```
1. Passwords: bcrypt (cost factor 12)
2. TLS 1.2+ for all external communications
3. Sensitive fields encrypted at rest (AES-256)
4. SQL injection prevention: parameterized queries via Prisma
5. XSS prevention: input validation + output encoding
6. CSRF prevention: sameSite cookies + CSRF token for stateful operations
```

## Deployment Architecture

### Docker Compose (Development/Staging)

```yaml
services:
  app: NestJS application (port 3000)
  postgres: PostgreSQL 15 (port 5432)
  redis: Redis 7 (port 6379)
  kafka: Apache Kafka (port 9092)
  zookeeper: Zookeeper (port 2181)
  mailhog: Email testing (port 1025, 8025)
  prometheus: Metrics (port 9090)
  grafana: Dashboard (port 3001)
```

### Production (Future)

```
Kubernetes Cluster:
  - app-deployment: NestJS (replicas: auto-scale 3-20)
  - postgres-statefulset: Primary + Read Replicas
  - redis-sentinel: High availability
  - kafka-cluster: 3 brokers
  - ingress: Load balancer + TLS termination
```

## Technology Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Framework | NestJS | 10+ |
| ORM | Prisma | 5+ |
| Database | PostgreSQL | 15+ |
| Cache/Locks | Redis | 7+ |
| Message Broker | Apache Kafka | 3.6+ |
| Real-time | Socket.IO | 4+ |
| Auth | Passport.js + JWT | - |
| Validation | class-validator | - |
| Email | Nodemailer | - |
| QR Code | qrcode | - |
| PDF | pdfkit | - |
| Testing | Jest + Supertest | - |
| CI/CD | GitHub Actions | - |
| Monitoring | Prometheus + Grafana | - |
| Logging | Winston + morgan | - |
