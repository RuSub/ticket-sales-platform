# Spec Delta

## Purpose

Отправка электронных билетов на email, уведомления о статусе заказов и резервирований.

## ADDED Requirements

### Requirement: Ticket Email Delivery
The system SHALL send electronic tickets to email.

#### Scenario: Send after payment
- **WHEN** order is paid
- **THEN** system sends email with: subject 'Your ticket for {eventName}', order details + QR code, PDF attachment with QR code

#### Scenario: Ticket in user cabinet
- **WHEN** user opens /orders/:id/ticket
- **THEN** system displays QR code and ticket details

### Requirement: Status Notifications
The system SHALL notify about reservation and order status.

#### Scenario: Booking confirmation notification
- **WHEN** seats are reserved
- **THEN** system sends email: 'Seats reserved for 10 minutes' with payment link

#### Scenario: Timeout expiration notification
- **WHEN** reservation expires without payment
- **THEN** system sends email: 'Reservation expired'
- **AND** seats return to pool

#### Scenario: Payment confirmation notification
- **WHEN** order is paid
- **THEN** system sends email: 'Payment confirmed. Your ticket is ready.'

#### Scenario: Return approval notification
- **WHEN** return is approved
- **THEN** system sends email: 'Return approved. Funds refunded.'

### Requirement: Email Queue
The system SHALL asynchronously process email sending.

#### Scenario: Add to queue
- **WHEN** event requires email sending
- **THEN** system adds event to Kafka notifications.topic queue

#### Scenario: Process queue
- **WHEN** consumer processes event from queue
- **THEN** system sends email via SMTP
- **AND** records result in log

#### Scenario: Retry on failure
- **WHEN** email sending fails
- **THEN** system retries with exponential backoff
- **AND** maximum 3 attempts
