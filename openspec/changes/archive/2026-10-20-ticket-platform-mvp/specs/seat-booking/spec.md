# Spec Delta

## Purpose

Выбор мест, корзина, резервирование с таймаутом, real-time обновление статусов через WebSocket.

## ADDED Requirements

### Requirement: Real-time Seat Status Updates
The system SHALL update seat statuses in real-time via WebSocket.

#### Scenario: Subscribe to seat updates
- **WHEN** user connects to WebSocket /ws/events/:eventId
- **THEN** system sends initial state of all seats for that event

#### Scenario: Push status update
- **WHEN** seat status changes (reservation, purchase, release)
- **THEN** system sends seat_status_updated event to all subscribers
- **AND** event contains { eventId, seatId, oldStatus, newStatus, timestamp }

#### Scenario: Update latency < 1 second
- **WHEN** seat status changes
- **THEN** all connected clients receive update within 1 second

#### Scenario: Supported seat statuses
- **WHEN** system defines seat statuses
- **THEN** statuses are: AVAILABLE, RESERVED, SOLD, BLOCKED

### Requirement: Seat Selection
Users SHALL be able to select one or more seats.

#### Scenario: Get available seats
- **WHEN** user sends GET /events/:eventId/available-seats
- **THEN** system returns all seats with status AVAILABLE

#### Scenario: Add seats to cart
- **WHEN** user sends POST /cart with seatIds
- **THEN** system creates cart reservation
- **AND** reserves seats for 10 minutes

#### Scenario: Seat availability check on selection
- **WHEN** user selects a seat that is already reserved
- **THEN** system returns error 'Seat is no longer available'

### Requirement: Cart Management
The system SHALL manage buyer cart reservations.

#### Scenario: View cart
- **WHEN** buyer sends GET /cart
- **THEN** system returns list of reserved seats with timeouts

#### Scenario: Remove from cart
- **WHEN** buyer sends DELETE /cart/:reservationId
- **THEN** system immediately releases the seat

#### Scenario: Reservation timeout expiry
- **WHEN** 10 minutes pass since reservation
- **THEN** system automatically releases the seat
- **AND** sends seat_status_updated with status AVAILABLE

### Requirement: Reservation with Distributed Locks
Reservations SHALL use distributed locks to prevent double-selling.

#### Scenario: Acquire Redis lock
- **WHEN** user begins booking
- **THEN** system acquires lock in Redis for 10 minutes
- **AND** lock key: reservation:{eventId}:{seatId}

#### Scenario: Release lock on payment
- **WHEN** order is paid or cancelled
- **THEN** system releases Redis lock

#### Scenario: Lock expiry on timeout
- **WHEN** 10 minutes pass without payment
- **THEN** Redis auto-removes key (TTL)
- **AND** seat becomes AVAILABLE

#### Scenario: Concurrent booking
- **WHEN** two users attempt to book the same seat simultaneously
- **THEN** only one acquires the lock
- **AND** the other receives error 'Seat unavailable'

### Requirement: Interactive Venue Layout
Users SHALL see venue layout with available seats.

#### Scenario: Get venue layout
- **WHEN** user opens event page
- **THEN** system returns JSON layout with coordinates and statuses of all seats

#### Scenario: Status color visualization
- **WHEN** client receives venue layout
- **THEN** seats display by status color:
  - AVAILABLE: green
  - RESERVED: yellow
  - SOLD: gray
  - BLOCKED: red
