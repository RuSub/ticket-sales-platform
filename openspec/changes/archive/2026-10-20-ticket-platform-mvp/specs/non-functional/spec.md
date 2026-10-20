# Spec Delta

## Purpose

Нефункциональные требования: производительность, надёжность, безопасность, масштабируемость.

## ADDED Requirements

### Requirement: Response Latency
The system SHALL meet defined latency targets.

#### Scenario: Event page response
- **WHEN** user requests GET /events/:id
- **THEN** response is returned within 300ms (p95)

#### Scenario: Seat reservation
- **WHEN** user creates a reservation
- **THEN** operation completes within 500ms (p95)

#### Scenario: Payment processing
- **WHEN** payment is initiated
- **THEN** result is returned within 2 seconds (async)

#### Scenario: Seat status update latency
- **WHEN** seat status changes
- **THEN** all WebSocket clients receive update within 1 second

### Requirement: Throughput
The system SHALL handle peak load.

#### Scenario: Peak load
- **WHEN** system experiences peak load (sale start)
- **THEN** system processes up to 10,000 requests/second

#### Scenario: Concurrent users
- **WHEN** 100,000 users have open sessions
- **THEN** system maintains all connections

### Requirement: Horizontal Scaling
The system SHALL scale horizontally without downtime.

#### Scenario: Add node without downtime
- **WHEN** new node is added to cluster
- **THEN** system continues operating without interruption

#### Scenario: Stateless services
- **WHEN** requests are distributed across nodes
- **THEN** any node can handle any request

### Requirement: Availability
The system SHALL maintain 99.95% uptime.

#### Scenario: Yearly uptime
- **WHEN** system operates for a year
- **THEN** uptime >= 99.95% (max ~4.3 hours downtime)

### Requirement: Consistency
The system SHALL maintain strict consistency for tickets and eventual for stats.

#### Scenario: Strict ticket consistency
- **WHEN** two users simultaneously book the same seat
- **THEN** only one succeeds
- **AND** no seat is sold twice

#### Scenario: Eventual stats consistency
- **WHEN** a sale occurs
- **THEN** statistics update within 5 seconds

### Requirement: Fault Tolerance
The system SHALL survive node failures without data loss.

#### Scenario: Node failure
- **WHEN** a node fails
- **THEN** system continues on remaining nodes
- **AND** data is not lost

#### Scenario: Automatic recovery
- **WHEN** a node recovers
- **THEN** system automatically replicates to it

### Requirement: Token Security
The system SHALL protect authentication tokens.

#### Scenario: Token anomaly detection
- **WHEN** token is intercepted
- **THEN** system detects anomalous usage (IP mismatch, device fingerprint)

#### Scenario: Token expiry
- **WHEN** accessToken expires
- **THEN** system requires refresh via refreshToken

### Requirement: Attack Protection
The system SHALL protect against common attacks.

#### Scenario: XSS protection
- **WHEN** request contains XSS payload
- **THEN** system escapes output and rejects dangerous data

#### Scenario: CSRF protection
- **WHEN** request arrives without valid CSRF token
- **THEN** system rejects the request

#### Scenario: SQL injection prevention
- **WHEN** request contains SQL injection
- **THEN** system uses parameterized queries
- **AND** rejects the malicious input

### Requirement: Encryption
The system SHALL encrypt data in transit and at rest.

#### Scenario: TLS for transit
- **WHEN** data is transmitted between client and server
- **THEN** connection uses TLS 1.2+

#### Scenario: Encryption at rest
- **WHEN** data is stored in database
- **THEN** sensitive fields (password, payment info) are encrypted

### Requirement: Logging and Monitoring
The system SHALL provide structured logging, metrics, and tracing.

#### Scenario: Structured logging
- **WHEN** any key action occurs
- **THEN** system records structured log: { timestamp, level, userId, action, details }

#### Scenario: Performance metrics
- **WHEN** request is processed
- **THEN** system records metric: { endpoint, duration, status, userId }

#### Scenario: Request tracing
- **WHEN** request passes through multiple modules
- **THEN** system adds traceId for cross-module tracing

#### Scenario: Latency alerts
- **WHEN** p95 latency exceeds 300ms for 5 minutes
- **THEN** system generates alert in Grafana
