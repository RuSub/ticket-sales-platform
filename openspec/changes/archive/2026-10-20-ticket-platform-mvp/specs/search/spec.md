# Spec Delta

## Purpose

Полнотекстовый поиск мероприятий по названию, дате, месту, жанру.

## ADDED Requirements

### Requirement: Event Search
The system SHALL support event search with filters.

#### Scenario: Text search
- **WHEN** user sends GET /events/search?q=<query>
- **THEN** system searches by event title and description
- **AND** returns results ordered by relevance

#### Scenario: Date filter
- **WHEN** user sends GET /events/search?date=2026-11-01
- **THEN** system filters events by date
- **AND** returns events on the specified date

#### Scenario: City filter
- **WHEN** user sends GET /events/search?city=Moscow
- **THEN** system filters events by city/venue

#### Scenario: Genre filter
- **WHEN** user sends GET /events/search?genre=concert
- **THEN** system filters events by genre
- **AND** supports: concert, theater, sport, conference, festival, other

#### Scenario: Combined filters
- **WHEN** user sends GET /events/search?q=rock&date=2026-11-01&genre=concert
- **THEN** system applies all filters simultaneously

#### Scenario: Pagination
- **WHEN** user sends GET /events/search?page=1&limit=20
- **THEN** system returns paginated results
- **AND** includes totalCount for navigation

### Requirement: Full-Text Search
The system SHALL use PostgreSQL Full-Text Search.

#### Scenario: Indexing
- **WHEN** event is created or updated
- **THEN** system updates tsvector index for search

#### Scenario: Ranking
- **WHEN** search results are returned
- **THEN** they are ranked by tsrank (title weight > description weight)

### Requirement: Only Published Events
Search SHALL return only published events.

#### Scenario: Status filter
- **WHEN** user searches for events
- **THEN** system returns only events with status APPROVED
