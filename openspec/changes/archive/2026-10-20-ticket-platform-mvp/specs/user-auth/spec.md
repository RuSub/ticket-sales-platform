# Spec Delta

## Purpose

Аутентификация пользователей через JWT + OAuth2, авторизация через RBAC, управление пользователями и ролями платформы.

## ADDED Requirements

### Requirement: JWT Authentication
The system SHALL authenticate users using JWT tokens with access token (15 min TTL) and refresh token (7 day TTL).

#### Scenario: Successful registration
- **WHEN** user sends POST /auth/register with email and password
- **THEN** system creates user with default role BUYER
- **AND** returns accessToken and refreshToken

#### Scenario: Successful login
- **WHEN** user sends POST /auth/login with email and password
- **THEN** system returns accessToken (15 min TTL) and refreshToken (7 day TTL)

#### Scenario: Token refresh
- **WHEN** user sends POST /auth/refresh with valid refreshToken
- **THEN** system returns new accessToken

#### Scenario: Invalid token rejection
- **WHEN** request contains invalid or expired token
- **THEN** system returns 401 Unauthorized

### Requirement: OAuth2 Authentication
The system SHALL support OAuth2 for login via external providers.

#### Scenario: OAuth2 authorization redirect
- **WHEN** user navigates to /auth/oauth2/:provider
- **THEN** system redirects to provider authorization page

#### Scenario: OAuth2 callback
- **WHEN** provider returns user data via callback
- **THEN** system creates or finds user by email
- **AND** returns accessToken

### Requirement: RBAC Authorization
The system SHALL control access based on roles.

#### Scenario: Role-based access denial
- **WHEN** user with role BUYER attempts to access /organizer/*
- **THEN** system returns 403 Forbidden

#### Scenario: Admin access granted
- **WHEN** user with role ADMIN attempts to access /admin/*
- **THEN** system grants access

#### Scenario: Supported roles
- **WHEN** system defines roles
- **THEN** roles are: BUYER, ORGANIZER, AGENCY, ADMIN, SUPPORT

### Requirement: User Management
The system SHALL support CRUD operations for users.

#### Scenario: Get profile
- **WHEN** authenticated user sends GET /users/me
- **THEN** system returns profile data

#### Scenario: Update profile
- **WHEN** authenticated user sends PATCH /users/me
- **THEN** system updates data and returns updated profile

#### Scenario: Admin user list
- **WHEN** user with role ADMIN sends GET /admin/users
- **THEN** system returns paginated user list

#### Scenario: Role change by admin
- **WHEN** user with role ADMIN sends PATCH /admin/users/:id/role
- **THEN** system updates user role

### Requirement: Action Audit Logging
The system SHALL log key user actions for ADMIN and SUPPORT roles.

#### Scenario: Login audit log
- **WHEN** user logs in
- **THEN** system records audit_log event: { action: 'login', userId, timestamp, ip }

#### Scenario: Admin action audit log
- **WHEN** user with role ADMIN changes user role
- **THEN** system records audit_log event: { action: 'role_change', adminId, targetUserId, newRole, timestamp }
