# Spec Delta

## Purpose

Панель агентства: просмотр назначенных мероприятий, продажа билетов, статистика продаж и комиссий.

## ADDED Requirements

### Requirement: Assigned Events
Agency SHALL view assigned events.

#### Scenario: List assigned events
- **WHEN** agency sends GET /agency/events
- **THEN** system returns all events assigned to the agency

#### Scenario: Event details
- **WHEN** agency sends GET /agency/events/:eventId
- **THEN** system returns full event information

### Requirement: Ticket Sales
Agency SHALL sell tickets through the platform.

#### Scenario: Purchase tickets as agency
- **WHEN** agency sends POST /agency/orders with seatIds
- **THEN** system creates order with agencyId
- **AND** applies agency commission

#### Scenario: Track sales
- **WHEN** agency sells tickets
- **THEN** system updates agency sales statistics

### Requirement: Sales Statistics
Agency SHALL view own sales statistics.

#### Scenario: Overall statistics
- **WHEN** agency sends GET /agency/stats
- **THEN** system returns: totalTicketsSold, totalRevenue, totalCommission, salesByEvent, salesByDate

#### Scenario: Real-time updates
- **WHEN** agency connects to WebSocket /ws/agency/stats
- **THEN** system sends updates on each sale
