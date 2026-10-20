# Design

## Context

См. `proposal.md` — Why. Текущее состояние: оплата эмулируется внутри `PaymentService`, агентство
покупает «на себя», приложение — один процесс, поиск — FTS/ILIKE без нечёткости, метрики — in-memory,
outbox без backoff, CI/TLS отсутствуют. Всё перечисленное меняется без переписывания доменных границ.

## Goals / Non-Goals

**Goals:**
- Провайдер-агностичные платежи с вебхуками, идемпотентностью и денежными возвратами.
- Продажа агентством на конкретного покупателя с приглашением.
- Готовность к нескольким инстансам и 1000 WebSocket-соединений.
- Нечёткий поиск, production-метрики/алерты, CI-миграции и TLS.
- Закрыть conformance-долги: письма reservation/payment/expiry, outbox backoff.

**Non-Goals:**
- Интеграция с конкретным банком до выбора провайдера (порт + sandbox).
- Гарантия 10 000 rps на одном ноутбуке; проверка — на распределённом стенде.
- Мультирегион, шардирование, замена PostgreSQL.

## Decisions

### 1. Платёжный порт и sandbox-адаптер

```ts
interface PaymentProvider {
  createPayment(input: { orderId: string; amount: number; currency: string; returnUrl: string }): Promise<{
    providerPaymentId: string;
    confirmationUrl?: string;
  }>;
  refund(input: { providerPaymentId: string; amount: number; reason?: string }): Promise<{
    providerRefundId: string;
    status: 'pending' | 'succeeded' | 'failed';
  }>;
  verifyWebhook(input: { headers: Record<string, string>; rawBody: Buffer }): {
    type: 'payment.succeeded' | 'payment.failed' | 'refund.succeeded' | 'refund.failed';
    providerPaymentId: string;
    providerRefundId?: string;
    payload: unknown;
  };
}
```

`SandboxProvider` повторяет текущую эмуляцию (всегда успех, задержка 500 мс) и подписывает вебхуки
HMAC-SHA256. HTTP-адаптер включается `PAYMENT_PROVIDER=http` и `PAYMENT_API_URL/PAYMENT_SECRET`.
Выбор провайдера не блокирует change: домен работает через порт.

### 2. Вебхуки: raw body, HMAC, идемпотентность

`NestFactory.create(AppModule, { rawBody: true })`, контроллер получает `req.rawBody`, проверяет
подпись `X-Signature` через `crypto.timingSafeEqual`. Событие обрабатывается в транзакции:
условный переход `PENDING_PAYMENT → PAID`, места `RESERVED → SOLD`, запись в outbox. Повторный
вебхук определяется по уникальному `Payment.providerPaymentId` и текущему статусу: если заказ уже
`PAID`, возвращается 200 без изменений. Неверная подпись — 400 и запись в лог с `traceId`.

**Альтернатива** — polling статуса у провайдера: оставляем как fallback-задачу сверки
(`PaymentReconciliationService`), но основной канал — вебхук.

### 3. Возвраты: отдельная сущность `Refund`

`Return` описывает бизнес-возврат, `Refund` — деньги. Уникальность `Refund.returnId` защищает от
двойного возврата. Поток:

1. approve возврата: в транзакции `Return → APPROVED`, места `SOLD/RESERVED → AVAILABLE`,
   создаётся `Refund(PENDING)`;
2. вызов `provider.refund`;
3. вебхук `refund.succeeded` → `Refund → REFUNDED`, `Order → REFUNDED`;
   `refund.failed` → `Refund → FAILED`, заказ остаётся `PAID`, возврат — `APPROVED` для повторной
   попытки через `POST /returns/:id/refund`.

Освобождение мест происходит на шаге approve (билет аннулируется), а деньги возвращаются
асинхронно; если refund в итоге не прошёл, поддержка видит `Refund FAILED` и может повторить или
вернуть места вручную.

### 4. Агентская продажа на email и приглашение

`POST /agency/orders { eventId, seatIds, buyerEmail }`:

- проверяется назначение агентства на событие;
- покупатель ищется по email; если нет — создаётся с `isActive=false`, случайным паролем,
  `inviteTokenHash` (SHA-256 от одноразового токена) и `inviteExpiresAt = now + 7 дней`;
- создаётся резервация и заказ: `buyerId` — покупатель, `agencyId` — агентство;
- новому покупателю отправляется письмо со ссылкой `/accept-invite?token=...`.

`POST /auth/accept-invite { token, password }` проверяет хэш и срок, ставит bcrypt-пароль,
`isActive=true`, очищает токен и выдаёт access/refresh. Пароль никогда не пересылается письмом.

### 5. Масштабирование: Redis-адаптер и несколько инстансов

- Socket.IO переводится на `@socket.io/redis-adapter` (pub/sub клиенты), комнаты становятся
  общими для всех инстансов.
- Клиенты подключаются только по WebSocket (`transports: ['websocket']`), поэтому sticky sessions
  не нужны; при необходимости polling включается вместе с `ip_hash` в nginx.
- Compose: два сервиса `app1`/`app2` из одного образа и nginx `upstream` с `least_conn`.
- Фоновые задачи (`OutboxScheduler`, `ReservationExpiryService`, `NotificationRetryService`) не
  должны выполняться на всех репликах: leader-lock в Redis (`SET lock:worker NX EX 60`), продление
  на каждом тике.
- Prisma: ограничить `connection_limit` в `DATABASE_URL`, чтобы N инстансов не исчерпали пул PG.

**Альтернатива** — sticky sessions без адаптера: не решает fan-out между инстансами и хуже
масштабируется. Отклонено.

### 6. Нечёткий поиск: `pg_trgm` как fallback

Миграция: `CREATE EXTENSION IF NOT EXISTS pg_trgm;` и GIN-индексы
`gin (title gin_trgm_ops)`, `gin (coalesce(description,'') gin_trgm_ops)`. Цепочка:

1. `q` ≥ 3 символов → FTS `websearch_to_tsquery` + `ts_rank`;
2. FTS пуст → `similarity(title, q) > 0.2` или `q % title`, сортировка по similarity;
3. `q` < 3 → trigram/ILIKE без FTS.

Все ветки сохраняют фильтры и `status = APPROVED`; raw SQL возвращает `id` + score, гидратация —
Prisma.

### 7. Метрики и алерты

Вместо in-memory `MetricsService` — `prom-client` registry:

- `http_request_duration_seconds` (histogram, labels method/route/status),
- `http_requests_total`, `http_request_errors_total`,
- `outbox_pending_total`, `notification_failed_total`,
- default process metrics.

`/api/metrics` отдаёт `registry.metrics()`. Grafana provisioning: дашборд + alert rules
(p95 > 500 мс 5 минут, 5xx > 1 %, outbox PENDING > 100, notification FAILED > 10).

### 8. CI/CD, секреты, TLS

GitHub Actions: checkout → setup Node → `npm ci` → `prisma migrate deploy` (Postgres service) →
`npm run test:all` → `npm run build` → docker build. Секреты — GitHub Secrets; в приложении только
`process.env`, `.env` не коммитится. TLS — nginx с сертификатом (Let's Encrypt) или ingress
провайдера; HTTP → HTTPS редирект, HSTS.

### 9. Conformance-долги

- `PaymentService`, `BookingService`, `ReservationExpiryService` вызывают письма reservation/
  payment/timeout по REQ-NOTIF-002 (через `NotificationService`, с dedupeKey).
- В `outbox` добавляются `attempts`, `next_attempt_at`; паблишер делает до 5 попыток с backoff и
  помечает `FAILED` после исчерпания (REQ-PAYMENT-004).

## Risks / Trade-offs

- **Raw body vs helmet/body-parser** → включать `rawBody: true` и не парсить JSON для вебхука;
  покрыть тестом подписи.
- **Refund асинхронен** → статус `REFUND_PENDING` может висеть; нужен reconciliation-джоб и
  ручной retry.
- **Места освобождаются до подтверждения refund** → возможна продажа места при последующем отказе
  refund; риск принят, поддержка видит `Refund FAILED`.
- **Leader-lock** → при потере Redis задачи могут дублироваться; операции идемпотентны, но
  дубликаты писем отсекаются `dedupeKey`.
- **pg_trgm** → индекс растёт; для больших каталогов нужен мониторинг размера и `VACUUM`.
- **Приглашения** → одноразовые, с TTL и хэшем токена; пароль задаёт сам пользователь.
- **Несколько инстансов в compose** → усложняет локальный стенд; поднимаются отдельным профилем
  `scale`.

## Migration Plan

1. Аддитивная миграция: `Payment`, `Refund`, поля приглашения, `outbox.attempts/next_attempt_at`,
   `CREATE EXTENSION pg_trgm` + GIN-индексы.
2. Деплой: `prisma migrate deploy` в CI до старта; `PAYMENT_PROVIDER=sandbox` по умолчанию.
3. Включение `PAYMENT_PROVIDER=http` и вебхук-секрета — конфигурацией, без релиза.
4. Откат: код откатывается независимо; новые таблицы/колонки не мешают старой версии.

## Open Questions

- Конкретный платёжный провайдер (Stripe / YooKassa / T-Bank) — выбирается после change, порт готов.
- Шаблон письма-приглашения согласуется с дизайном; технически используется текущий
  `NotificationService`.
