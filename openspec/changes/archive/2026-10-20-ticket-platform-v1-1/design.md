# Design

## Context

Спеки в `openspec/specs/` уже описывают целевое поведение, но реализация ему не соответствует:
уведомления логируются вместо отправки, `EventAgency` отсутствует (эндпоинты 501), поиск идёт
через `ILIKE`, Saga и `/orders/:id/ticket` не реализованы, real-time дашборды отсутствуют,
Winston не назначен логгером, нагрузочный тест не проводился. См. `proposal.md` — Why.

Ограничения: dev-стенд на PostgreSQL 15 + Redis 7 + Kafka (Confluent 7.6) в Docker Desktop с
3.7 ГБ RAM; Prisma 6, NestJS 12, Socket.IO; существующие контракты REST/WS нельзя ломать;
миграции должны быть аддитивными.

## Goals / Non-Goals

**Goals:**
- Реализовать уже специфицированное поведение без изменения требований.
- Добавить проверяемые quality gates: интеграционные тесты, WS-тест, нагрузочный прогон.
- Сохранить работоспособность текущего MVP-флоу (бронь → оплата → возврат).

**Non-Goals:**
- Новые продуктовые требования (изменения поведения фиксируются отдельным change в спеках).
- Разделение монолита на сервисы, Kubernetes, реальный платёжный шлюз.
- 10 000 rps: проверяется целевой p95 бронирования на доступном железе.

## Decisions

### 1. Агентства: связь `EventAgency`, а не массив на событии

Новая модель `EventAgency { id, eventId, agencyId, assignedBy, createdAt, @@unique([eventId, agencyId]) }`
с каскадным удалением по событию. Назначение — `POST/DELETE /organizer/events/:id/agencies`
(организатор-владелец, целевой пользователь с ролью `AGENCY`); ошибки 403/404/409.

Альтернатива — `agencyIds String[]` в `Event`: не даёт FK-целостности, уникальности и удобной
статистики. Отклонено.

Агентская продажа: `POST /agency/orders { eventId, seatIds }` создаёт резервацию от имени
агентства (`buyerId = agencyId`), затем заказ с `agencyId` и комиссией 5 %. При ошибке создания
заказа резервация освобождается. Покупка «на конкретного покупателя» (email) — вне scope,
потребует отдельного сценария; зафиксировано как ограничение.

### 2. Уведомления: Nodemailer + журнал доставок, consumer в модуле

Транспорт создаётся из `SMTP_*` (Mailhog в dev, `SMTP_MODE=json` для тестов). Каждая отправка
пишется в `NotificationDelivery { id, dedupeKey @unique, orderId?, template, recipient, subject,
status, attempts, lastError, nextAttemptAt, createdAt, updatedAt }`.

`NotificationConsumer` регистрируется в `NotificationModule` и подписывается на
`events.notification.email`; при ошибке попытка увеличивается и планируется retry с backoff
(1 → 2 → 4 мин, максимум 3), раз в минуту `DeliveryRetryService` добирает созревшие записи.
`dedupeKey` (id outbox-события) защищает от повторной отправки.

Билет: `QRCodeService.generateTicketPDF` вызывается при оплате, PDF кладётся во вложение;
`GET /orders/:id/ticket` отдаёт тот же PDF (buyer-владелец, поддержка/админ).

Альтернатива — отправлять синхронно из `PaymentService`: блокирует оплату и не даёт ретраев.
Отклонено.

### 3. Поиск: generated `tsvector` + GIN, `ts_rank`, fallback ILIKE

Миграция добавляет в `events` generated-колонку
`search_vector tsvector GENERATED ALWAYS AS (setweight(to_tsvector('russian', coalesce(title,'')),'A') || setweight(to_tsvector('russian', coalesce(description,'')),'B')) STORED`
и GIN-индекс. Prisma-схема колонку не описывает (raw SQL).

Запрос: `websearch_to_tsquery('russian', $q)` + `ts_rank(search_vector, query)` с сортировкой по
релевантности, фильтры (date/city/genre/status) — фрагментами `Prisma.sql`, пагинация
`LIMIT/OFFSET`, отдельный `COUNT(*)`. Для `q` короче 3 символов — текущий `ILIKE`-поиск.

Альтернатива — `pg_trgm`: не соответствует требованию «PostgreSQL Full-Text Search» и не даёт
весов заголовка. Отклонено.

### 4. Saga: транзакционное ядро + компенсации

`OrderService.createFromCart` оформляется как оркестратор:

1. проверить активную резервацию и её срок;
2. в одной транзакции создать заказ/позиции и перевести резервацию в `CONVERTED`;
3. записать `events.order.created` в outbox в той же транзакции;
4. при ошибке шага 2 — снять Redis-локи и оставить резервацию активной;
5. при ошибке после создания заказа — удалить заказ и вернуть резервацию в `ACTIVE`.

Полноценный внешний оркестратор (Temporal) избыточен для монолита; транзакция БД + компенсации
закрывают требование «откатить предыдущие шаги».

### 5. Real-time дашборды: отдельный namespace `dashboards`

`DashboardGateway` (`namespace: 'dashboards'`) с обработчиками `subscribe:organizer {eventId}` и
`subscribe:agency`, комнатами `organizer:{eventId}` и `agency:{agencyId}`. Снимок метрик
пересчитывается после оплаты, возврата и назначения агентства и отправляется как
`sales_updated { eventId, sold, reserved, available, revenue }` и
`stats_updated { agencyId, totalTicketsSold, totalRevenue, totalCommission }`.

Path-style `/ws/organizer/:eventId` из спеки заменяется на событие подписки: Socket.IO не
поддерживает path-параметры namespace, а контракт «обновление < 1 c» сохраняется.

### 6. Логирование: Winston как app logger + AsyncLocalStorage

`app.useLogger(app.get(WinstonLoggerService))` в `main.ts`. `TraceIdInterceptor` кладёт
`traceId`/`userId` в `AsyncLocalStorage`; Winston-формат добавляет их в каждую строку. Файловые
транспорты включаются только при `LOG_TO_FILE=true` (в контейнере каталог `logs/` создаётся
заранее), по умолчанию — JSON в stdout.

### 7. Нагрузочный тест: autocannon, целевой p95

Скрипт `scripts/load-booking.mjs` (devDependency `autocannon`) готовит событие и пул мест, шлёт
бронирования с `connections=LOAD_CONNECTIONS` (по умолчанию 1000), собирает p95 и процент ошибок,
падает с ненулевым кодом при `p95 > 500 мс` или ошибках > 1 %. Результат и параметры железа
фиксируются в `docs/load-test.md`.

Альтернатива — k6: требует отдельного бинарника. Отклонено.

### 8. Тесты: расширение интеграционного набора

- event CRUD + модерация через API;
- WebSocket-тест (socket.io-client как devDependency) на `seat_status_updated` и
  `sales_updated`;
- полный путь покупателя: поиск → схема → бронь → оплата → PDF-билет;
- compose smoke: `docker compose up`, health, одна бронь (запускается вручную/по env-флагу).

## Risks / Trade-offs

- **Generated tsvector + GIN на большой таблице** → миграция блокирует запись; для dev-объёмов
  приемлемо, для production — `CREATE INDEX CONCURRENTLY` отдельной миграцией.
- **Два Socket.IO namespace** → клиенты должны подключаться к `/dashboards`; старый `/events`
  продолжает работать. Проверяется WS-тестом.
- **SMTP недоступен** → письма уходят в retry и помечаются `FAILED` после 3 попыток; в тестах
  используется `json`-транспорт, в dev — Mailhog.
- **1000 соединений на слабом ноутбуке** → возможен p95 выше цели; результат фиксируется честно,
  порог конфигурируется, тренд важнее абсолютного числа.
- **Агентство как покупатель** (`buyerId = agencyId`) → упрощение; продажа «на email клиента»
  потребует отдельного сценария и вынесена в Non-Goals.
- **Удаление назначения агентства** не отзывает уже созданные заказы → историческая статистика
  сохраняется, это осознанно.

## Migration Plan

1. Миграция: `EventAgency`, `NotificationDelivery`, generated `search_vector` + GIN — аддитивно.
2. `prisma migrate deploy` (в Docker — автоматически в entrypoint), затем seed без изменений.
3. Включение SMTP через переменные окружения; без них письма остаются в retry.
4. Откат: код откатывается независимо; при необходимости удаляются новые таблицы/индекс
   обратной миграцией (данные MVP не затрагиваются).

## Open Questions

Нет блокирующих. Идентичность покупателя при агентской продаже сознательно упрощена (см. Risks);
если понадобится продажа на конкретный email — это отдельный change со своей дельтой в
`dashboard-agency`.
