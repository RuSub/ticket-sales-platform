-- Generated tsvector column: title has weight A, description weight B.
ALTER TABLE "events" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('russian', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('russian', coalesce("description", '')), 'B')
) STORED;

-- GIN index for full-text search.
CREATE INDEX "events_search_vector_idx" ON "events" USING GIN ("search_vector");
