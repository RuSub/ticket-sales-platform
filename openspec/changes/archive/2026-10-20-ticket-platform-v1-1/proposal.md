# Proposal

## Why

MVP заархивирован с 84/99 задач, но оставшиеся 15 — это не новые возможности, а расхождение
реализации с уже утверждёнными спеками: письма с билетами фактически не уходят (Nodemailer не
подключён), назначение агентств и агентские продажи отвечают 501, real-time дашборды отсутствуют,
поиск игнорирует `tsvector`, Saga и выдача QR/PDF-билета не реализованы, структурное логирование и
нагрузочная проверка не подтверждены. Пользователь уже ожидает это поведение по спекам — система
обязана ему соответствовать, иначе MVP нельзя отдавать организаторам и агентствам.

## What Changes

Приведение реализации к существующим требованиям (без изменения самих требований):

- **notifications**: реальная отправка через Nodemailer (SMTP/Mailhog), ретраи с экспоненциальным
  backoff (3 попытки), письмо с PDF+QR во вложении, зарегистрированный Kafka-consumer, учёт
  результатов доставки.
- **dashboard-organizer / dashboard-agency**: связь `EventAgency`, назначение агентства
  организатором, агентские продажи с `agencyId` и комиссией, real-time события `sales_updated` и
  `stats_updated`.
- **order-payment**: Saga создания заказа с явными шагами и компенсациями, выдача билета
  `GET /orders/:id/ticket` (QR + PDF) и вложение его в письмо.
- **search**: `tsvector` + GIN-индекс, ранжирование `ts_rank` (заголовок важнее описания),
  fallback на `ILIKE` для коротких запросов.
- **non-functional**: Winston как глобальный логгер с `traceId`/`userId`, нагрузочный тест
  бронирования (p95 ≤ 500 мс при 1000 конкурентных пользователей).
- **verification**: автотесты на event CRUD, WebSocket-обновления, полный путь покупателя и smoke
  Docker Compose.

**Требования не меняются.** Всё перечисленное уже зафиксировано в `openspec/specs/*`, поэтому
change идёт с `skip_specs: true` и без дельта-спек: это работа по соответствию, а не по изменению
поведения.

## Capabilities

### New Capabilities

Нет: change не вводит новых требований к поведению системы.

### Modified Capabilities

Нет: `notifications`, `order-payment`, `search`, `dashboard-organizer`, `dashboard-agency` и
`non-functional` уже содержат требования на перечисленное выше. Дельта-спеки не создаются
(`skip_specs: true`); при необходимости уточнить поведение оно сначала меняется в основных спеках
отдельным change.

## Impact

- **Prisma**: новые модели `EventAgency` (уникальная пара eventId+agencyId) и
  `NotificationDelivery` (попытки, статус, `nextAttemptAt`); миграция без изменения существующих
  таблиц.
- **API**: реализация уже описанных `POST/DELETE /organizer/events/:id/agencies`,
  `GET /agency/events`, `POST /agency/orders`, `GET /agency/stats`,
  `GET /orders/:id/ticket`; WS-события `sales_updated`, `stats_updated` и подписки на комнаты
  организатора/агентства.
- **Modules**: `notification`, `order`, `payment`, `search`, `dashboard-*`, `prisma`, `guards`.
- **Infra**: SMTP-конфигурация (Mailhog), скрипт нагрузочного теста, расширение интеграционных
  тестов; новых production-зависимостей не требуется (`nodemailer`, `qrcode`, `pdfkit` уже есть).
- **Совместимость**: контракты не ломаются — только реализуются отсутствующие эндпоинты и события;
  миграция аддитивная.
