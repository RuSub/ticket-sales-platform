# Ticket Platform

Платформа продажи билетов на мероприятия: каталог и поиск событий, выбор мест на схеме зала,
резервирование с таймаутом, оплата, возвраты и панели для организатора, агентства, поддержки и
администратора.

## Стек

| Слой | Технологии |
|------|------------|
| Backend | NestJS 12, TypeScript, Prisma 6 |
| БД | PostgreSQL 15 (+ JSONB для схем залов) |
| Кэш и блокировки | Redis 7 (distributed locks, TTL резервов) |
| События | Kafka (outbox-паттерн) |
| Real-time | Socket.IO (namespace `/events`) |
| Auth | Passport.js: JWT (access/refresh), Google OAuth2 |
| Frontend | React 19, Vite 8, React Router 7, Zustand, Axios |
| Инфраструктура | Docker Compose, Prometheus + Grafana, Mailhog |

## Быстрый старт (Docker)

```bash
cp .env.example .env          # заполните секреты и OAuth-ключи
docker compose up --build
```

- приложение: http://localhost:3000/api (Swagger не подключён)
- фронтенд: http://localhost
- Mailhog: http://localhost:8025
- Prometheus: http://localhost:9090, Grafana: http://localhost:3001 (admin/admin)

Контейнер `app` при старте сам применяет миграции (`prisma migrate deploy`). Наполнение демо-данными:

```bash
docker compose exec app npx ts-node prisma/seed.ts
```

## Локальная разработка

```bash
# инфраструктура (можно поднять только нужные сервисы)
docker compose up -d postgres redis kafka

# backend
npm install
npx prisma migrate dev
npm run prisma:seed
npm run start:dev            # http://localhost:3000/api

# frontend
cd frontend
npm install
npm run dev                  # http://localhost:5173, /api и /socket.io проксируются на :3000
```

## Демо-аккаунты

После `prisma:seed` создаются пользователи с паролем `ChangeMe123!` (переопределяется `SEED_PASSWORD`):

| Email | Роль |
|-------|------|
| admin@ticketplatform.com | ADMIN |
| organizer@ticketplatform.com | ORGANIZER |
| agency@ticketplatform.com | AGENCY |
| support@ticketplatform.com | SUPPORT |
| buyer@ticketplatform.com | BUYER |

Seed также создаёт одобренное событие **Demo Concert** с 450 местами и категориями.

## Роли и доступ

| Роль | Возможности |
|------|-------------|
| BUYER | каталог, бронирование, оплата, возвраты, история заказов |
| ORGANIZER | CRUD своих мероприятий, схемы залов и категории, модерация возвратов, статистика |
| AGENCY | статистика продаж и комиссий по своим заказам |
| SUPPORT | поиск заказов, ручная отмена/подтверждение, возвраты, история действий |
| ADMIN | модерация мероприятий, пользователи и роли, комиссия платформы, аналитика |

RBAC реализован через `@Roles()` + `RolesGuard`; проверка владельца ресурса — в сервисах.

## Агентские продажи

Организатор назначает агентство на своё мероприятие:

```http
POST /api/organizer/events/:eventId/agencies
Authorization: Bearer <organizer token>
{ "agencyId": "<uuid>" }
→ 201 { "eventId": "...", "agencyId": "...", "assignedBy": "..." }
```

Агентство видит только назначенные события (`GET /api/agency/events`) и продаёт места:

```http
POST /api/agency/orders
Authorization: Bearer <agency token>
{ "eventId": "<uuid>", "seatIds": ["<uuid>"] }
→ 201 {
  "buyerId": "<agencyId>", "agencyId": "<agencyId>",
  "status": "PENDING_PAYMENT", "totalAmount": "1000.00",
  "agencyCommission": "50.00", "items": [ ... ]
}
```

Агентство выступает покупателем (`buyerId = agencyId`), комиссия — 5 % от суммы. Места
резервируются на 10 минут; если создание заказа не удалось, резервация освобождается. Оплата —
обычным `POST /api/payments/:orderId/charge` от токена агентства. Статистика:
`GET /api/agency/stats` (`assignedEvents`, `totalOrders`, `totalTicketsSold`, `totalRevenue`,
`totalCommission`, `salesByEvent`, `salesByDate`).

## Основные эндпоинты

```
POST   /api/auth/register|login|refresh|logout
GET    /api/auth/me
GET    /api/events                     # только APPROVED, пагинация
GET    /api/events/search              # q, date, city, genre
GET    /api/events/:id
GET    /api/events/templates
POST   /api/events                     # ORGANIZER, авто-генерация мест из шаблона
POST   /api/events/:id/generate-seats
GET    /api/events/:id/available-seats
GET    /api/events/:id/available-seats/layout
GET    /api/cart | POST /api/cart | DELETE /api/cart/:id
POST   /api/orders                     # { cartId }
GET    /api/orders | GET /api/orders/:id
POST   /api/orders/:id/cancel
POST   /api/payments/:orderId/charge   # { paymentMethod }, идемпотентно
GET    /api/returns | POST /api/returns | DELETE /api/returns/:id
POST   /api/returns/:id/approve|reject
GET    /api/organizer/... | /api/agency/... | /api/admin/... | /api/support/...
GET    /api/health | /api/metrics
```

## WebSocket

Подключение: `io('/events')`.

```js
socket.emit('subscribe:seats', { eventId });
socket.on('seat_status_initial', ({ seats }) => {});
socket.on('seat_status_updated', ({ seatId, oldStatus, newStatus }) => {});
```

## Тесты

```bash
npm run test:e2e           # smoke без БД: bootstrap, health, metrics, RBAC, валидация
npm run test:integration   # на живой БД: бронь, оплата, возврат, гонка, TTL, отмена
npm run test:all           # оба набора подряд
COMPOSE_SMOKE=1 npm run smoke:compose  # проверка compose-стека и одной брони
npm test                   # unit-тесты (пока отсутствуют)
```

Smoke-тесты не требуют инфраструктуры. Интеграционные тесты используют
`DATABASE_URL` (по умолчанию `postgresql://postgres:postgres@localhost:5432/ticket_platform`)
и Redis, создают собственные фикстуры и удаляют их после прогона; лимиты троттлинга
для них поднимаются через `THROTTLER_*_LIMIT` в `vitest.config.integration.ts`.

## Структура

```
src/
  common/          # redis, kafka, outbox, metrics, health, audit, qr
  guards/          # RolesGuard
  modules/         # auth, user, event, search, booking, order, payment, return,
                   # notification, dashboard
prisma/            # schema.prisma, migrations, seed.ts
frontend/src/      # React SPA: pages, api, store, components, styles
openspec/          # спецификации и change-артефакты (spec-driven workflow)
```

## Ограничения текущего MVP

- Метрики хранятся в памяти процесса (без `prom-client`), при перезапуске сбрасываются.
- Outbox-паблишер запускается только при заданном `KAFKA_BROKERS`; ретраи без backoff.
- Поиск использует PostgreSQL FTS (`russian`, веса title/description); для запросов короче 3 символов — `ILIKE`.
- Письма уходят через SMTP (Mailhog в dev); без настроенного SMTP доставки помечаются `FAILED` после 3 попыток.
- Real-time дашборды требуют подключения к namespace `/dashboards` с JWT в `handshake.auth.token`.

