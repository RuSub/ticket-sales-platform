# Spec Delta

## Purpose

Панель администратора: управление пользователями, модерация мероприятий, настройка комиссии платформы.

## ADDED Requirements

### Requirement: User Management
Admin SHALL manage users and roles.

#### Scenario: User list
- **WHEN** admin sends GET /admin/users
- **THEN** system returns paginated user list with: id, email, role, createdAt, status

#### Scenario: Block user
- **WHEN** admin sends POST /admin/users/:id/block
- **THEN** system blocks the user
- **AND** revokes all active tokens

#### Scenario: Unblock user
- **WHEN** admin sends POST /admin/users/:id/unblock
- **THEN** system unblocks the user

### Requirement: Event Moderation
Admin SHALL moderate events.

#### Scenario: Moderation queue
- **WHEN** admin sends GET /admin/events/pending
- **THEN** system returns events with status PENDING including: id, title, organizer, createdAt, description

#### Scenario: Approve event
- **WHEN** admin sends POST /admin/events/:id/approve
- **THEN** status changes to APPROVED

#### Scenario: Reject event
- **WHEN** admin sends POST /admin/events/:id/reject
- **THEN** status changes to HIDDEN

### Requirement: Platform Commission Settings
Admin SHALL configure platform commission percentage.

#### Scenario: Get current commission
- **WHEN** admin sends GET /admin/settings/commission
- **THEN** system returns current commission percentage

#### Scenario: Change commission
- **WHEN** admin sends PATCH /admin/settings/commission
- **THEN** system updates commission percentage
- **AND** commission applies to all new organizer orders

### Requirement: Global Analytics
Admin SHALL view global platform analytics.

#### Scenario: Overall analytics
- **WHEN** admin sends GET /admin/analytics
- **THEN** system returns: totalUsers (by roles), totalEvents (by status), totalRevenue, totalOrders, activeUsers (last 7 days), revenueByPeriod
