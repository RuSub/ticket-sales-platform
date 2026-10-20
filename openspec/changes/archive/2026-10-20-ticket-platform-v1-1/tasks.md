# Tasks

## 1. Data Model & Agency Assignment

- [x] 1.1 Add `EventAgency` and `NotificationDelivery` models plus a migration; verify `npx prisma validate` succeeds and `npx prisma migrate deploy` applies on the dev database
- [x] 1.2 Implement `POST/DELETE /organizer/events/:eventId/agencies` with ownership, `AGENCY`-role and duplicate checks; verify integration test covers 201, 403 for a foreign organizer and 409 for a duplicate assignment
- [x] 1.3 Rework `GET /agency/events` to read from `EventAgency` instead of paid orders; verify integration test returns only assigned events for the agency
- [x] 1.4 Land the agency-assignment integration test in `test/` and verify `npm run test:integration` passes with it

## 2. Agency Sales

- [x] 2.1 Implement `POST /agency/orders` (reserve seats, create order with `agencyId`, 5 % commission, release reservation on failure); verify integration test asserts `agencyId`, commission and seat states
- [x] 2.2 Rework `GET /agency/stats` to aggregate real agency orders and assigned events; verify integration test asserts tickets, revenue and commission after a sale
- [x] 2.3 Document the agency sale flow (agency acts as buyer) in README and verify the documented request/response matches the test

## 3. Real-time Dashboards

- [x] 3.1 Add `DashboardGateway` in namespace `/dashboards` with `subscribe:organizer` and `subscribe:agency` handlers and rooms; verify WS test receives `sales_updated` after subscribing
- [x] 3.2 Emit `sales_updated` after payment and return; verify WS test observes sold/reserved/available/revenue changes after a payment
- [x] 3.3 Emit `stats_updated` after an agency sale; verify WS test observes updated tickets/revenue/commission
- [x] 3.4 Land the dashboard WS integration test and verify `npm run test:integration` passes with it

## 4. Notifications

- [x] 4.1 Build a Nodemailer transport from `SMTP_*` with a `json` mode for tests; verify a test send records a `SENT` delivery and a Mailhog smoke send is visible at http://localhost:8025
- [x] 4.2 Implement `NotificationDelivery` persistence with a unique `dedupeKey`; verify migration applies and an integration test rejects a duplicate key
- [x] 4.3 Register `NotificationConsumer` in `NotificationModule` and create a delivery row on each Kafka message; verify an integration test publishes an outbox event and observes the delivery row
- [x] 4.4 Implement the retry worker (exponential backoff, 3 attempts, `nextAttemptAt`); verify an integration test with a failing transport yields `FAILED` after 3 attempts
- [x] 4.5 Implement `GET /orders/:id/ticket` returning the PDF with QR and attach the same PDF to the paid email; verify the integration test downloads a `%PDF` body and the buyer-only access rule (403 for another buyer)
- [x] 4.6 Send the ticket email to the real buyer address on payment (instead of the hardcoded one); verify the integration test asserts the delivery recipient equals the buyer email
- [x] 4.7 Land the notifications integration tests (success, retry, attachment) and verify `npm run test:integration` passes with them

## 5. Saga & QR Wiring

- [x] 5.1 Extract order creation into explicit Saga steps with compensations (release Redis locks, delete order, restore reservation); verify an integration test that forces a failure after order creation leaves no order and an `ACTIVE` reservation
- [x] 5.2 Write the `events.order.created` outbox event in the same transaction as the order and verify an integration test sees the outbox row with the order id
- [x] 5.3 Generate QR/PDF on payment, persist the ticket reference and expose it via `/orders/:id/ticket`; verify the paid-flow integration test asserts the PDF contains the ticket id

## 6. Full-Text Search

- [x] 6.1 Add a migration with a generated `search_vector` (`russian`, weighted title/description) and a GIN index; verify `\d events` shows the column and `pg_indexes` lists the GIN index
- [x] 6.2 Rewrite `SearchService` on `websearch_to_tsquery` + `ts_rank` with the existing filters and an `ILIKE` fallback for queries shorter than 3 characters; verify integration tests cover relevance order, each filter and the fallback
- [x] 6.3 Verify search still returns only `APPROVED` events and that the demo event is found by title

## 7. Observability & Load

- [x] 7.1 Register `WinstonLoggerService` as the application logger and propagate `traceId`/`userId` through `AsyncLocalStorage`; verify a request produces a log line containing both fields
- [x] 7.2 Add `scripts/load-booking.mjs` (autocannon, configurable connections) that books seats and fails on p95 > 500 ms or > 1 % errors; verify a run with `LOAD_CONNECTIONS=100` completes and prints p95
- [x] 7.3 Run the load test at the highest connection count the laptop sustains and record parameters, p95 and error rate in `docs/load-test.md`; verify the file matches the executed run

## 8. Verification Suite

- [x] 8.1 Add an event CRUD integration test (create, update, moderate, delete, foreign-organizer 403) and verify it passes
- [x] 8.2 Add a WebSocket integration test for `seat_status_updated` (subscribe → reserve → receive) and verify it passes
- [x] 8.3 Add a full buyer-journey test (search → layout → reserve → pay → ticket PDF) and verify it passes
- [x] 8.4 Add a compose smoke script (`docker compose up`, `/api/health`, one booking) gated by an env flag and verify it passes against the running stack
- [x] 8.5 Run `npm run test:all` and the load test together on the final code and verify all suites pass

## Workflow follow-up

- Review the implementation against the existing specs in `openspec/specs/`.
- Archive the change after the review is complete.
- Verify the archived result.
