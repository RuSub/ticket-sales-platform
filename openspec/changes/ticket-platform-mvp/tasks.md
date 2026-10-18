# Tasks

## 1. Project Scaffolding

- [x] 1.1 Initialize NestJS project with TypeScript and verify compilation succeeds
- [x] 1.2 Add all dependencies (Prisma, Redis, Kafka, Socket.IO, Passport, etc.) and verify npm install succeeds
- [x] 1.3 Create Docker Compose configuration (PostgreSQL, Redis, Kafka, Zookeeper) and verify all services start
- [x] 1.4 Configure Prisma schema with all models and verify migration creates tables
- [x] 1.5 Set up NestJS module structure (9 modules) and verify app bootstraps

## 2. Database & Prisma

- [x] 2.1 Create all database tables via Prisma schema and verify migration applies cleanly
- [x] 2.2 Create Prisma client singleton and verify database connection works
- [x] 2.3 Seed database with venue templates and platform settings, verify seed script runs
- [x] 2.4 Create Redis client with connection pooling and verify connectivity

## 3. Authentication Module

- [x] 3.1 Implement User entity and UserModule with Prisma service, verify unit tests pass
- [x] 3.2 Implement password hashing (bcrypt) and registration endpoint, verify POST /auth/register works
- [x] 3.3 Implement JWT strategy and login endpoint, verify POST /auth/login returns tokens
- [x] 3.4 Implement token refresh endpoint, verify POST /auth/refresh returns new accessToken
- [x] 3.5 Implement OAuth2 strategy (Google) and callback endpoint, verify OAuth2 flow works
- [x] 3.6 Implement @Roles() decorator and role-based guards, verify role access control works

## 4. User Management Module

- [x] 4.1 Implement User CRUD endpoints (me, update, admin list), verify all endpoints respond correctly
- [x] 4.2 Implement admin user management (role change, block/unblock), verify admin operations work
- [x] 4.3 Implement audit log service and verify admin/support actions are logged

## 5. Event Management Module

- [x] 5.1 Implement Event entity and EventModule with Prisma service, verify unit tests pass
- [x] 5.2 Implement event CRUD endpoints (create, read, update, delete), verify all operations work
- [x] 5.3 Implement event status workflow (DRAFT -> PENDING -> APPROVED/HIDDEN), verify status transitions
- [x] 5.4 Implement organizer ownership check and verify only owners can edit/delete
- [x] 5.5 Implement venue template endpoints and verify template listing works
- [x] 5.6 Implement venue layout update with JSONB validation, verify layout schema is validated
- [x] 5.7 Implement seat categories CRUD and verify categories are linked to events
- [x] 5.8 Implement sale time restriction and verify tickets unavailable before saleStartTime
- [x] 5.9 Implement event moderation endpoints (admin approve/reject), verify moderation workflow

## 6. Search Module

- [x] 6.1 Implement PostgreSQL Full-Text Search service, verify tsvector index is created
- [x] 6.2 Implement search endpoint with text, date, city, genre filters, verify search returns results
- [x] 6.3 Implement combined filters and verify all filters work together
- [x] 6.4 Implement pagination and verify totalCount is returned
- [x] 6.5 Verify only APPROVED events are returned in search results

## 7. Seat Booking Module

- [x] 7.1 Implement Seat entity and SeatModule with Prisma service, verify unit tests pass
- [x] 7.2 Implement available seats endpoint, verify returns only AVAILABLE seats
- [x] 7.3 Implement WebSocket gateway for seat status updates, verify client connection works
- [x] 7.4 Implement initial seat state broadcast on subscription, verify client receives all seats
- [x] 7.5 Implement seat_status_updated event push, verify all subscribers receive updates < 1 sec
- [x] 7.6 Implement reservation creation with Redis distributed locks, verify lock is acquired
- [x] 7.7 Implement cart endpoints (add, remove, list), verify cart operations work
- [x] 7.8 Implement reservation TTL with Redis (10 min), verify auto-expiry works
- [ ] 7.9 Implement concurrent booking test, verify only one user succeeds for same seat

## 8. Order & Payment Module

- [ ] 8.1 Implement Order entity and OrderModule with Prisma service, verify unit tests pass
- [ ] 8.2 Implement order creation from cart, verify order is created with PENDING_PAYMENT status
- [ ] 8.3 Implement Saga pattern for order creation (reserve + create + confirm), verify rollback on failure
- [ ] 8.4 Implement order cancellation endpoint, verify seats are released
- [ ] 8.5 Implement order history endpoints (list, detail), verify orders are returned correctly
- [ ] 8.6 Implement payment gateway emulation service, verify payment flow works
- [ ] 8.7 Implement payment charge endpoint, verify order status changes to PAID on success
- [ ] 8.8 Implement payment idempotency, verify duplicate charge requests return same result
- [x] 8.9 Implement Outbox pattern for payment events, verify events are published to Kafka
- [x] 8.10 Implement QR code generation service, verify QR contains correct ticket data
- [x] 8.11 Implement ticket PDF generation, verify PDF contains QR code and details

## 9. Returns Module

- [x] 9.1 Implement Return entity and ReturnModule with Prisma service, verify unit tests pass
- [x] 9.2 Implement return request endpoint (buyer), verify return is created with PENDING status
- [x] 9.3 Implement 24-hour restriction, verify returns rejected for events within 24 hours
- [x] 9.4 Implement return cancellation by buyer, verify return is deleted
- [x] 9.5 Implement organizer return management (approve/reject), verify seats are released on approve
- [x] 9.6 Implement support manual operations (approve/reject), verify support actions work
- [x] 9.7 Implement return history endpoints (buyer, organizer), verify history is returned

## 10. Organizer Dashboard Module

- [x] 10.1 Implement organizer dashboard endpoint (sales metrics), verify dashboard returns correct data
- [ ] 10.2 Implement real-time sales updates via WebSocket, verify organizer receives live data
- [ ] 10.3 Implement event statistics endpoint, verify stats by category and date are correct
- [ ] 10.4 Implement agency assignment endpoint, verify agency is linked to event
- [ ] 10.5 Implement agency statistics endpoint, verify sales and commissions per agency
- [ ] 10.6 Implement bulk return operations, verify bulk approve/reject works

## 11. Agency Dashboard Module

- [ ] 11.1 Implement agency events endpoint, verify assigned events are returned
- [ ] 11.2 Implement agency order creation (sell tickets), verify order has agencyId
- [ ] 11.3 Implement agency statistics endpoint, verify sales/revenue/commission stats
- [ ] 11.4 Implement agency real-time stats via WebSocket, verify live updates work

## 12. Admin Dashboard Module

- [ ] 12.1 Implement admin user list endpoint with pagination, verify users are returned
- [ ] 12.2 Implement admin event moderation queue, verify PENDING events are listed
- [ ] 12.3 Implement approve/reject endpoints, verify status changes correctly
- [ ] 12.4 Implement platform commission settings, verify commission is applied to new orders
- [ ] 12.5 Implement global analytics endpoint, verify all metrics are correct

## 13. Support Dashboard Module

- [ ] 13.1 Implement support order search endpoint, verify orders found by email/orderId/ticketId
- [ ] 13.2 Implement support order details endpoint, verify full order data is returned
- [ ] 13.3 Implement support manual cancel/confirm, verify orders are updated and audited
- [ ] 13.4 Implement order action history endpoint, verify chronological history is returned
- [ ] 13.5 Implement support return operations, verify manual approve/reject works

## 14. Notifications Module

- [ ] 14.1 Implement email service with Nodemailer, verify email sending works
- [x] 14.2 Implement email templates (ticket, reservation, payment, return), verify templates render
- [x] 14.3 Implement Kafka consumer for notifications, verify emails are sent asynchronously
- [ ] 14.4 Implement email retry logic with exponential backoff, verify retries work
- [ ] 14.5 Integrate email sending into order paid flow, verify ticket email is sent on payment

## 15. Non-Functional Requirements

- [ ] 15.1 Implement structured logging with Winston, verify logs contain userId, traceId, timestamp
- [ ] 15.2 Implement Prometheus metrics middleware, verify metrics are exposed at /metrics
- [x] 15.3 Implement request tracing (traceId propagation), verify traceId spans modules
- [ ] 15.4 Implement input validation (class-validator) on all DTOs, verify validation errors are returned
- [x] 15.5 Implement rate limiting on public endpoints, verify rate limit headers are returned
- [ ] 15.6 Implement CORS configuration, verify CORS headers are correct
- [x] 15.7 Add health check endpoint, verify /health returns service status
- [ ] 15.8 Load test booking endpoint, verify p95 latency <= 500ms under 1000 concurrent users

## 16. Integration & Testing

- [ ] 16.1 Write integration tests for auth flow (register, login, refresh), verify all tests pass
- [ ] 16.2 Write integration tests for event CRUD, verify all tests pass
- [ ] 16.3 Write integration tests for booking flow (select, reserve, pay, cancel), verify all tests pass
- [ ] 16.4 Write integration tests for return flow (request, approve, reject), verify all tests pass
- [ ] 16.5 Write WebSocket integration test for seat status updates, verify real-time updates work
- [ ] 16.6 End-to-end smoke test: full buyer journey (search -> select -> reserve -> pay -> ticket), verify complete flow works
- [ ] 16.7 Verify Docker Compose starts all services and app connects to all dependencies

## Workflow follow-up

- Review the implementation against all spec requirements
- Archive the change after review is complete
- Verify the archived result
