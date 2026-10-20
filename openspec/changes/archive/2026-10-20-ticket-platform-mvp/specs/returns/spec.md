# Spec Delta

## Purpose

Запросы возвратов, подтверждение организатором, освобождение мест.

## ADDED Requirements

### Requirement: Return Request (Buyer)
Buyer SHALL be able to request a ticket refund.

#### Scenario: Submit return request
- **WHEN** buyer sends POST /returns with orderId
- **AND** order has status PAID
- **THEN** system creates return request with status PENDING

#### Scenario: Time restriction
- **WHEN** event is less than 24 hours away
- **THEN** system rejects return request with error 'Too close to event date'

#### Scenario: Cancel return request
- **WHEN** buyer sends DELETE /returns/:returnId
- **AND** return status is PENDING
- **THEN** system deletes the request

### Requirement: Return Confirmation (Organizer)
Organizer SHALL confirm or reject refund requests.

#### Scenario: View return requests (organizer)
- **WHEN** organizer sends GET /organizer/returns
- **THEN** system returns all refund requests for organizer's events

#### Scenario: Approve return (organizer)
- **WHEN** organizer sends POST /returns/:returnId/approve
- **THEN** system changes status to APPROVED
- **AND** refunds money (emulated)
- **AND** tickets become invalid
- **AND** seats are released (SOLD -> AVAILABLE)

#### Scenario: Reject return (organizer)
- **WHEN** organizer sends POST /returns/:returnId/reject
- **THEN** system changes status to REJECTED
- **AND** tickets remain valid
- **AND** seats remain SOLD

### Requirement: Manual Operations (Support)
Support operator SHALL manually cancel or approve returns.

#### Scenario: Manual approve (support)
- **WHEN** support sends POST /support/returns/:returnId/approve
- **THEN** system processes refund as if from organizer

#### Scenario: Manual reject (support)
- **WHEN** support sends POST /support/returns/:returnId/reject
- **THEN** system rejects the return

### Requirement: Return History
The system SHALL maintain history of all returns.

#### Scenario: View return history (buyer)
- **WHEN** buyer sends GET /returns
- **THEN** system returns all return requests by the user

#### Scenario: View return history (organizer)
- **WHEN** organizer sends GET /organizer/returns/history
- **THEN** system returns full return history
