# Spec Delta

## Purpose

Панель оператора поддержки: просмотр заказов, ручные операции, история действий.

## ADDED Requirements

### Requirement: Order Viewing
Support operator SHALL view orders and help users.

#### Scenario: Search order
- **WHEN** support sends GET /support/orders?query=<email|orderId|ticketId>
- **THEN** system returns found orders

#### Scenario: Order details
- **WHEN** support sends GET /support/orders/:id
- **THEN** system returns full order with: buyer data, ticket list, status history, return requests

### Requirement: Manual Operations
Support operator SHALL manually cancel or confirm orders.

#### Scenario: Manual cancel
- **WHEN** support sends POST /support/orders/:id/cancel
- **THEN** system cancels the order
- **AND** releases seats
- **AND** records action in audit_log

#### Scenario: Manual confirm
- **WHEN** support sends POST /support/orders/:id/confirm
- **THEN** system confirms the order
- **AND** records action in audit_log

### Requirement: Action History
The system SHALL maintain history of actions per order.

#### Scenario: View history
- **WHEN** support sends GET /support/orders/:id/history
- **THEN** system returns chronological list of all actions: { action, userId, timestamp, details }

#### Scenario: Operator action audit
- **WHEN** operator performs any action
- **THEN** system records in audit_log: { action, supportId, targetOrderId, timestamp, ip }
