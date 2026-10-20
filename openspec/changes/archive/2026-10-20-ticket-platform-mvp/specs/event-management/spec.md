# Spec Delta

## Purpose

Создание, редактирование, просмотр и модерация мероприятий, управление схемами залов и категориями мест.

## ADDED Requirements

### Requirement: Event CRUD
The system SHALL support full lifecycle management of events.

#### Scenario: Create event by organizer
- **WHEN** organizer sends POST /events with event data
- **THEN** system creates event with status PENDING
- **AND** returns created event id

#### Scenario: Update event by organizer
- **WHEN** organizer sends PATCH /events/:id
- **AND** is the event owner
- **THEN** system updates event data

#### Scenario: List events for buyer
- **WHEN** buyer sends GET /events
- **THEN** system returns paginated event list

#### Scenario: Get event details
- **WHEN** buyer sends GET /events/:id
- **THEN** system returns full event description

#### Scenario: Delete event by organizer
- **WHEN** organizer sends DELETE /events/:id
- **AND** is the event owner
- **AND** no active orders exist
- **THEN** system deletes the event

### Requirement: Event Status Workflow
Events SHALL have a defined status lifecycle.

#### Scenario: New event status
- **WHEN** a new event is created
- **THEN** status = PENDING

#### Scenario: Approve event by admin
- **WHEN** admin sends POST /admin/events/:id/approve
- **THEN** status changes to APPROVED

#### Scenario: Reject event by admin
- **WHEN** admin sends POST /admin/events/:id/reject
- **THEN** status changes to HIDDEN

#### Scenario: Supported statuses
- **WHEN** system defines event statuses
- **THEN** statuses are: DRAFT, PENDING, APPROVED, CANCELLED, HIDDEN

### Requirement: Venue Layout Templates
The system SHALL support ready-made venue layout templates with configurable zones.

#### Scenario: List venue templates
- **WHEN** organizer sends GET /venue-templates
- **THEN** system returns available templates

#### Scenario: Apply template to event
- **WHEN** organizer creates event with templateId
- **THEN** system initializes venue layout from template

#### Scenario: Customize venue layout
- **WHEN** organizer sends PUT /events/:id/venue-layout
- **THEN** system updates JSONB venue layout field
- **AND** validates layout (coordinates, zones, validity)

### Requirement: Seat Categories and Pricing
Each venue zone SHALL have a category with price.

#### Scenario: Configure categories by organizer
- **WHEN** organizer configures venue layout
- **THEN** each zone has category, price, capacity

#### Scenario: View prices by buyer
- **WHEN** buyer opens event page
- **THEN** sees prices for all categories

### Requirement: Event Moderation
Admin SHALL moderate events before publication.

#### Scenario: Moderation queue for admin
- **WHEN** admin sends GET /admin/events/pending
- **THEN** system returns events with status PENDING

#### Scenario: Bulk moderation by admin
- **WHEN** admin sends POST /admin/events/bulk-modrate
- **THEN** system mass-updates event statuses

### Requirement: Sale Start Time
Organizer SHALL set a sale start time for events.

#### Scenario: Set sale start time
- **WHEN** organizer sets saleStartTime
- **THEN** tickets are available only after saleStartTime

#### Scenario: Pre-sale purchase attempt
- **WHEN** buyer attempts to buy ticket before saleStartTime
- **THEN** system returns error 'Sales not started yet'
