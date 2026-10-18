import { Injectable } from '@nestjs/common';
import { prisma } from '../../prisma/prisma.service';

@Injectable()
export class SearchService {
  async search(query?: string, date?: string, city?: string, genre?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where: any = { status: 'APPROVED' };

    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.eventDate = { gte: start, lte: end };
    }

    if (city) {
      where.venueName = { contains: city, mode: 'insensitive' };
    }

    if (genre) {
      where.genre = genre;
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({ where, skip, take: limit, orderBy: { eventDate: 'asc' } }),
      prisma.event.count({ where }),
    ]);

    return { events, total, page, totalPages: Math.ceil(total / limit) };
  }
}
