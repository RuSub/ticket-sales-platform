# Spec Delta

## Purpose

Панель организатора: мониторинг продаж в реальном времени, управление возвратами, статистика агентств.

## ADDED Requirements

### Requirement: Sales Monitoring
Organizer SHALL view real-time sales data.

#### Scenario: Dashboard view
- **WHEN** organizer sends GET /organizer/events/:eventId/dashboard
- **THEN** system returns: totalSeats, availableSeats, reservedSeats, soldSeats, totalRevenue, projectedRevenue

#### Scenario: Real-time updates
- **WHEN** organizer connects to WebSocket /ws/organizer/:eventId
- **THEN** system sends updates on every sale change
- **AND** data updates within 1 second

### Requirement: Event Statistics
Organizer SHALL view detailed statistics.

#### Scenario: Overall statistics
- **WHEN** organizer sends GET /organizer/stats
- **THEN** system returns: events by status, total revenue, average check, view-to-sale conversion

#### Scenario: Per-event statistics
- **WHEN** organizer sends GET /organizer/events/:eventId/stats
- **THEN** system returns: sales by category, daily sales trend, fill rate

### Requirement: Agency Management
Organizer SHALL assign agencies and view their statistics.

#### Scenario: Assign agency to event
- **WHEN** organizer sends POST /organizer/events/:eventId/agencies
- **THEN** system links agency to event

#### Scenario: Agency statistics
- **WHEN** organizer sends GET /organizer/events/:eventId/agencies/stats
- **THEN** system returns sales and commissions per agency

### Requirement: Return Management
Organizer SHALL manage return requests.

#### Scenario: View pending returns
- **WHEN** organizer sends GET /organizer/returns/pending
- **THEN** system returns all pending return requests

#### Scenario: Bulk operations
- **WHEN** organizer sends POST /organizer/returns/bulk-action
- **THEN** system bulk-approves or bulk-rejects returns
