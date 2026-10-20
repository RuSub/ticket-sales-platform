# Spec Delta

## Purpose

Создание заказов, обработка платежей через эмулированный шлюз, генерация QR-билетов.

## ADDED Requirements

### Requirement: Order Creation
The system SHALL create orders from cart.

#### Scenario: Create order from cart
- **WHEN** buyer sends POST /orders with cartId
- **THEN** system creates order with status PENDING_PAYMENT
- **AND** reserves seats for 10 minutes

#### Scenario: Saga order creation
- **WHEN** order is created
- **THEN** system runs Saga: reserve seats -> create order -> send confirmation
- **AND** on any step failure, rolls back previous steps

#### Scenario: Cancel order before payment
- **WHEN** buyer sends POST /orders/:id/cancel
- **THEN** system changes status to CANCELLED
- **AND** releases all reserved seats

### Requirement: Emulated Payment Gateway
The system SHALL emulate a payment gateway with preparation for real integration.

#### Scenario: Initiate payment
- **WHEN** buyer sends POST /payments/:orderId/charge with paymentMethod
- **THEN** system emulates payment processing
- **AND** returns result within 1-2 seconds

#### Scenario: Successful payment
- **WHEN** payment succeeds
- **THEN** order status changes to PAID
- **AND** seats change status to SOLD

#### Scenario: Failed payment
- **WHEN** payment is declined
- **THEN** order status changes to PAYMENT_FAILED
- **AND** seats return to AVAILABLE

#### Scenario: Payment idempotency
- **WHEN** buyer sends the same payment request twice
- **THEN** system returns result of first processing
- **AND** does not create duplicate transaction

### Requirement: QR Code Generation
The system SHALL generate QR codes for paid tickets.

#### Scenario: Generate QR code
- **WHEN** order is paid
- **THEN** system generates QR code with unique ticketId
- **AND** QR contains: { ticketId, eventId, seatId, price, createdAt }

#### Scenario: Send ticket to email
- **WHEN** order is paid
- **THEN** system sends ticket to buyer email
- **AND** attachment contains PDF with QR code

#### Scenario: Ticket in user cabinet
- **WHEN** order is paid
- **THEN** ticket is available at /orders/:id/ticket
- **AND** displays QR code and details

### Requirement: Outbox Pattern
The system SHALL guarantee payment event delivery.

#### Scenario: Write to outbox
- **WHEN** payment is processed
- **THEN** system writes event to outbox table
- **AND** async publisher publishes to Kafka

#### Scenario: Retry on failure
- **WHEN** Kafka event publication fails
- **THEN** system retries with exponential backoff
- **AND** maximum 5 attempts

### Requirement: Order History
Users SHALL view their order history.

#### Scenario: Get order history (buyer)
- **WHEN** buyer sends GET /orders
- **THEN** system returns all user orders with pagination
- **AND** includes status, date, amount, ticket list

#### Scenario: Get order details
- **WHEN** buyer sends GET /orders/:id
- **THEN** system returns full order with tickets and status
