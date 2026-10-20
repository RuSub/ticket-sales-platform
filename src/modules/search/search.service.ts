import { BadRequestException, Injectable } from '@nestjs/common';
import { EventGenre, EventStatus, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';

const FTS_MIN_QUERY_LENGTH = 3;

@Injectable()
export class SearchService {
  async search(
    query?: string,
    date?: string,
    city?: string,
    genre?: string,
    page = 1,
    limit = 20,
  ) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (safePage - 1) * safeLimit;

    const term = query?.trim();
    const conditions: Prisma.Sql[] = [
      Prisma.sql`"status" = ${EventStatus.APPROVED}::"EventStatus"`,
    ];
    let orderBy: Prisma.Sql;

    if (term && term.length >= FTS_MIN_QUERY_LENGTH) {
      const tsQuery = Prisma.sql`websearch_to_tsquery('russian', ${term})`;
      conditions.push(Prisma.sql`"search_vector" @@ ${tsQuery}`);
      orderBy = Prisma.sql`ts_rank("search_vector", ${tsQuery}) DESC, "event_date" ASC`;
    } else {
      if (term) {
        // Too short for meaningful FTS lexemes: keep substring matching.
        const like = `%${term}%`;
        conditions.push(
          Prisma.sql`("title" ILIKE ${like} OR "description" ILIKE ${like} OR "venue_name" ILIKE ${like})`,
        );
      }
      orderBy = Prisma.sql`"event_date" ASC`;
    }

    if (date) {
      const parsed = new Date(date);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid date filter');
      }
      const start = new Date(parsed);
      start.setHours(0, 0, 0, 0);
      const end = new Date(parsed);
      end.setHours(23, 59, 59, 999);
      conditions.push(Prisma.sql`"event_date" >= ${start} AND "event_date" <= ${end}`);
    }

    if (city?.trim()) {
      conditions.push(Prisma.sql`"venue_name" ILIKE ${`%${city.trim()}%`}`);
    }

    if (genre) {
      if (!Object.values(EventGenre).includes(genre as EventGenre)) {
        throw new BadRequestException(`Unknown genre: ${genre}`);
      }
      conditions.push(Prisma.sql`"genre" = ${genre}::"EventGenre"`);
    }

    const where = Prisma.join(conditions, ' AND ');

    const countRows = await prisma.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`SELECT count(*)::int AS "count" FROM "events" WHERE ${where}`,
    );
    const total = countRows[0]?.count ?? 0;

    if (total === 0) {
      return { events: [], total: 0, page: safePage, totalPages: 0 };
    }

    const rows = await prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "events" WHERE ${where} ORDER BY ${orderBy} LIMIT ${safeLimit} OFFSET ${skip}`,
    );

    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      return { events: [], total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
    }

    const events = await prisma.event.findMany({ where: { id: { in: ids } } });
    const byId = new Map(events.map((event) => [event.id, event]));
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((event): event is (typeof events)[number] => Boolean(event));

    return {
      events: ordered,
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  }
}
