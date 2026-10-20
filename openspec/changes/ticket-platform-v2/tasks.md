# Tasks

## 1. Payments: Provider Port, Intent, Webhooks

- [ ] 1.1 Add `Payment` model (provider, providerPaymentId unique, status, amount, currency, payload) and migration; verify `npx prisma validate` and `npx prisma migrate deploy` succeed
- [ ] 1.2 Define `PaymentProvider` port and `SandboxProvider` (HMAC-signed webhooks, 500 ms delay); verify an integration test creates a payment and receives `providerPaymentId`
- [ ] 1.3 Implement `POST /payments/:orderId/intent` (owner check, amount from order, returnUrl); verify integration test keeps the order `PENDING_PAYMENT` and returns a confirmation payload
- [ ] 1.4 Add `POST /payments/webhook` with raw body + HMAC verification and transactional `PAID`/`SOLD` transition; verify tests for valid signature (200, order paid) and invalid signature (400, no change)
- [ ] 1.5 Make webhook processing idempotent by `providerPaymentId`; verify a replayed webhook returns 200 without a second outbox event or state change
- [ ] 1.6 Add `PaymentReconciliationService` polling pending payments; verify a stuck `PENDING_PAYMENT` is reconciled to `PAID` when the provider reports success

## 2. Refunds

- [ ] 2.1 Add `Refund` model with unique `returnId`, provider ids, status (`PENDING`/`REFUNDED`/`FAILED`) and migration; verify migration applies and a duplicate `returnId` is rejected
- [ ] 2.2 Integrate refund creation into return approval (return `APPROVED`, seats released, refund `PENDING`); verify integration test asserts all three
- [ ] 2.3 Call `provider.refund` and process `refund.succeeded` webhook (`REFUNDED`, order `REFUNDED`); verify end-to-end test from approve to refunded order
- [ ] 2.4 Implement failure path (`refund.failed` → `FAILED`, order stays `PAID`) and `POST /returns/:id/refund` retry with idempotency; verify retry test produces a second provider call only once per attempt
- [ ] 2.5 Verify duplicate refund webhooks are ignored and `GET /returns/:id` exposes the refund status; cover with integration test

## 3. Agency Sale to Buyer Email and Invites

- [ ] 3.1 Add invite fields to `User` (`inviteTokenHash`, `inviteExpiresAt`, nullable `passwordHash`) and migration; verify migration applies without breaking existing users
- [ ] 3.2 Implement `POST /auth/accept-invite` (token hash, TTL, single use, bcrypt password, tokens); verify tests for success, expired and reused invites
- [ ] 3.3 Extend `POST /agency/orders` with `buyerEmail`: find existing buyer or create inactive one, set `buyerId`/`agencyId`; verify tests for existing and new buyers
- [ ] 3.4 Send the invitation email with a one-time link and verify the delivery row contains the link and no password
- [ ] 3.5 Verify unassigned events still return 403 and invitation tokens cannot be brute-forced (hash comparison, TTL)

## 4. Horizontal Scale Readiness

- [ ] 4.1 Add `@socket.io/redis-adapter` and configure pub/sub clients; verify an event emitted by instance A reaches a subscriber connected to instance B
- [ ] 4.2 Add a Redis leader lock for `OutboxScheduler`, `ReservationExpiryService` and `NotificationRetryService`; verify only one instance runs each tick
- [ ] 4.3 Add a `scale` compose profile with `app1`, `app2` and nginx `upstream`; verify `/api/health` and a booking work through nginx
- [ ] 4.4 Extend the load script with a 1000-connection WebSocket scenario; verify the run records connection errors and status sync
- [ ] 4.5 Set Prisma `connection_limit` guidance for N instances and document it in `.env.example`; verify the documented value fits PostgreSQL `max_connections`
- [ ] 4.6 Record the scale test results and topology in `docs/load-test.md`; verify the document matches the executed run

## 5. Fuzzy Search

- [ ] 5.1 Add `pg_trgm` extension and GIN trigram indexes on title/description; verify `pg_extension` and `pg_indexes` contain them
- [ ] 5.2 Implement fallback chain FTS → trigram → ILIKE with `status = APPROVED`; verify tests for a typo (`концрт`), a 2-character query and an FTS-empty case
- [ ] 5.3 Verify ranking and filters still work in the trigram branch and no duplicate events are returned

## 6. Production Metrics, Alerts, CI and TLS

- [ ] 6.1 Replace in-memory metrics with `prom-client` (HTTP histogram, request/error counters, outbox pending gauge); verify `/api/metrics` exposes them in Prometheus format
- [ ] 6.2 Add Grafana provisioning with alert rules (p95 > 500 ms, 5xx > 1 %, outbox pending, failed deliveries); verify `promtool check rules` passes
- [ ] 6.3 Add GitHub Actions workflow: install, `prisma migrate deploy`, `npm run test:all`, build; verify the workflow file passes `actionlint` (or a dry-run review)
- [ ] 6.4 Add TLS/secrets baseline: nginx HTTPS config, HTTP→HTTPS redirect, secrets via env/GitHub Secrets; verify the config renders and no secret is committed
- [ ] 6.5 Verify metrics labels are bounded (route templates, status class) and add a test for the `/api/metrics` payload

## 7. Conformance: Notifications and Outbox

- [ ] 7.1 Send a reservation email on successful booking with a payment link; verify an integration test finds a delivery for the reservation
- [ ] 7.2 Send a payment-confirmation email in addition to the ticket; verify both deliveries are recorded
- [ ] 7.3 Send an expiration email when a reservation expires; verify the expiry test observes the delivery
- [ ] 7.4 Add `outbox.attempts`/`next_attempt_at`, retry up to 5 times with backoff and mark `FAILED`; verify a test with an unreachable broker reaches `FAILED` after 5 attempts

## 8. Final Verification

- [ ] 8.1 Run `npm run test:all` on the final code and verify smoke + integration suites pass
- [ ] 8.2 Run the 1000-connection scale scenario and the booking load test; verify results are recorded in `docs/load-test.md`
- [ ] 8.3 Update README and `docs/project-overview.md` with the new payment/scale/ops architecture and verify links resolve

## Workflow follow-up

- Review the implementation against `openspec/specs/` (order-payment, returns, dashboard-agency, user-auth, search, non-functional).
- Archive the change after the review is complete.
- Verify the archived result.
