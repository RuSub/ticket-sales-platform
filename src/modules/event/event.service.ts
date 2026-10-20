import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventStatus, Prisma } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CreateEventDto, CreateSeatCategoryDto, GenerateSeatsDto, UpdateEventDto } from './dto/event.dto';

type LayoutZone = { name?: unknown; rows?: unknown; multiplier?: unknown };

@Injectable()
export class EventService {
  constructor(private readonly auditLogService: AuditLogService) {}

  async findAll(page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        where: { status: EventStatus.APPROVED },
        orderBy: { eventDate: 'asc' },
        select: {
          id: true,
          title: true,
          description: true,
          eventDate: true,
          venueName: true,
          venueAddress: true,
          genre: true,
          status: true,
          saleStartTime: true,
          organizer: { select: { id: true, fullName: true } },
          _count: { select: { seats: true } },
        },
      }),
      prisma.event.count({ where: { status: EventStatus.APPROVED } }),
    ]);

    return { events, total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
  }

  async findById(id: string) {
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        organizer: { select: { id: true, fullName: true } },
        categories: true,
        seats: { include: { category: true } },
        template: { select: { id: true, name: true } },
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async create(dto: CreateEventDto, organizerId: string) {
    const event = await prisma.event.create({
      data: {
        organizerId,
        title: dto.title,
        description: dto.description,
        eventDate: new Date(dto.eventDate),
        venueName: dto.venueName,
        venueAddress: dto.venueAddress,
        genre: dto.genre,
        status: EventStatus.PENDING,
        saleStartTime: dto.saleStartTime ? new Date(dto.saleStartTime) : null,
        templateId: dto.templateId,
        venueLayout: (dto.venueLayout as Prisma.InputJsonValue) ?? undefined,
      },
    });

    // Seats are generated right away so the event can be sold once approved.
    if (dto.venueLayout || dto.templateId) {
      try {
        await this.generateSeats(event.id, organizerId, {
          layout: dto.venueLayout,
          basePrice: dto.basePrice,
        });
      } catch (error) {
        await prisma.event.delete({ where: { id: event.id } }).catch(() => undefined);
        throw error;
      }
    }

    await this.auditLogService.log(organizerId, 'event_created', 'event', event.id, {
      title: event.title,
    });
    return event;
  }

  async update(id: string, dto: UpdateEventDto, organizerId: string) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('Not your event');
    }

    // Explicit allow-list: status/organizerId can never be changed from here.
    const data: Prisma.EventUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.eventDate !== undefined) data.eventDate = new Date(dto.eventDate);
    if (dto.venueName !== undefined) data.venueName = dto.venueName;
    if (dto.venueAddress !== undefined) data.venueAddress = dto.venueAddress;
    if (dto.genre !== undefined) data.genre = dto.genre;
    if (dto.saleStartTime !== undefined) data.saleStartTime = new Date(dto.saleStartTime);
    if (dto.templateId !== undefined) data.template = { connect: { id: dto.templateId } };
    if (dto.venueLayout !== undefined) data.venueLayout = dto.venueLayout as Prisma.InputJsonValue;

    return prisma.event.update({ where: { id }, data });
  }

  async delete(id: string, organizerId: string) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('Not your event');
    }

    const orders = await prisma.order.count({ where: { eventId: id } });
    if (orders > 0) {
      throw new BadRequestException('Cannot delete an event that has orders');
    }
    const reservations = await prisma.reservation.count({
      where: { eventId: id, status: 'ACTIVE' },
    });
    if (reservations > 0) {
      throw new BadRequestException('Cannot delete an event with active reservations');
    }

    return prisma.event.delete({ where: { id } });
  }

  async approve(id: string, adminId: string) {
    const result = await prisma.event.updateMany({
      where: { id, status: EventStatus.PENDING },
      data: { status: EventStatus.APPROVED },
    });
    if (result.count === 0) {
      throw new BadRequestException('Event is not pending moderation');
    }

    const event = await prisma.event.findUniqueOrThrow({ where: { id } });
    await this.auditLogService.log(adminId, 'event_approved', 'event', id, { title: event.title });
    return event;
  }

  async reject(id: string, adminId: string) {
    const result = await prisma.event.updateMany({
      where: { id, status: EventStatus.PENDING },
      data: { status: EventStatus.HIDDEN },
    });
    if (result.count === 0) {
      throw new BadRequestException('Event is not pending moderation');
    }

    const event = await prisma.event.findUniqueOrThrow({ where: { id } });
    await this.auditLogService.log(adminId, 'event_rejected', 'event', id, { title: event.title });
    return event;
  }

  async getPendingForModeration(page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        where: { status: EventStatus.PENDING },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          organizer: { select: { id: true, fullName: true } },
          createdAt: true,
          eventDate: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.event.count({ where: { status: EventStatus.PENDING } }),
    ]);

    return { events, total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
  }

  async getTemplates() {
    return prisma.venueTemplate.findMany({ select: { id: true, name: true, layoutSchema: true } });
  }

  async updateVenueLayout(eventId: string, organizerId: string, layout: Record<string, any>) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('Not your event');
    }

    this.buildLayout(layout, 1);

    return prisma.event.update({
      where: { id: eventId },
      data: { venueLayout: layout as Prisma.InputJsonValue },
    });
  }

  async createCategory(eventId: string, organizerId: string, dto: CreateSeatCategoryDto) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.organizerId !== organizerId) {
      throw new ForbiddenException('Not your event');
    }

    return prisma.seatCategory.create({
      data: {
        eventId,
        name: dto.name,
        zoneName: dto.zoneName,
        price: dto.price,
        capacity: dto.capacity,
      },
    });
  }

  async getCategories(eventId: string) {
    return prisma.seatCategory.findMany({ where: { eventId }, orderBy: { name: 'asc' } });
  }

  /**
   * Builds seats from the event's venue layout / template. Idempotent: an event
   * that already has seats is left untouched.
   */
  async generateSeats(
    eventId: string,
    organizerId: string | null,
    opts: { layout?: Record<string, any>; basePrice?: number } = {},
  ) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { template: true, _count: { select: { seats: true } } },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (organizerId && event.organizerId !== organizerId) {
      throw new ForbiddenException('Not your event');
    }
    if (event._count.seats > 0) {
      return { created: 0, skipped: true, reason: 'Seats already generated' };
    }

    const layout = (opts.layout ?? event.venueLayout ?? event.template?.layoutSchema) as
      | Record<string, any>
      | null;
    if (!layout) {
      throw new BadRequestException('No venue layout or template available to generate seats');
    }

    if (opts.layout) {
      await prisma.event.update({
        where: { id: eventId },
        data: { venueLayout: layout as Prisma.InputJsonValue },
      });
    }

    const basePrice = opts.basePrice ?? (Number(layout.basePrice) || 1000);
    const { rows, seatsPerRow, rowCategory } = this.buildLayout(layout, basePrice);
    const zoneNames = [...new Set([...rowCategory.values()].map((value) => value.name))];

    const result = await prisma.$transaction(async (tx) => {
      const categoryIds = new Map<string, string>();

      for (const name of zoneNames) {
        const rowsInZone = [...rowCategory.values()].filter((value) => value.name === name).length;
        const price = [...rowCategory.values()].find((value) => value.name === name)?.price ?? basePrice;
        const category = await tx.seatCategory.create({
          data: { eventId, name, zoneName: name, price, capacity: rowsInZone * seatsPerRow },
        });
        categoryIds.set(name, category.id);
      }

      const seatsData: Prisma.SeatCreateManyInput[] = [];
      for (let row = 1; row <= rows; row += 1) {
        const categoryId = categoryIds.get(rowCategory.get(row)?.name ?? '') as string;
        for (let seatNumber = 1; seatNumber <= seatsPerRow; seatNumber += 1) {
          seatsData.push({ eventId, rowNumber: row, seatNumber, categoryId });
        }
      }

      await tx.seat.createMany({ data: seatsData });
      return { created: seatsData.length, categories: zoneNames.length, skipped: false };
    });

    await this.auditLogService.log(organizerId, 'seats_generated', 'event', eventId, result);
    return result;
  }

  async isSaleAvailable(eventId: string): Promise<boolean> {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.status !== EventStatus.APPROVED) {
      throw new BadRequestException('Event is not available for sale');
    }
    if (event.saleStartTime && new Date() < event.saleStartTime) {
      throw new BadRequestException('Sales have not started yet');
    }
    return true;
  }

  private buildLayout(layout: Record<string, any>, basePrice: number) {
    const rows = Number(layout?.rows);
    const seatsPerRow = Number(layout?.seatsPerRow);

    if (!Number.isInteger(rows) || rows < 1 || rows > 200) {
      throw new BadRequestException('venueLayout.rows must be an integer between 1 and 200');
    }
    if (!Number.isInteger(seatsPerRow) || seatsPerRow < 1 || seatsPerRow > 500) {
      throw new BadRequestException('venueLayout.seatsPerRow must be an integer between 1 and 500');
    }

    const zones = Array.isArray(layout?.zones) ? (layout.zones as LayoutZone[]) : [];
    const rowCategory = new Map<number, { name: string; price: number }>();

    for (let row = 1; row <= rows; row += 1) {
      const zone = zones.find((candidate) => {
        const range = candidate?.rows;
        return (
          Array.isArray(range) &&
          range.length >= 2 &&
          row >= Number(range[0]) &&
          row <= Number(range[1])
        );
      });

      const rawName = zone?.name;
      const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim() : 'Standard';
      const multiplier = Number(zone?.multiplier);
      const factor = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;

      rowCategory.set(row, { name, price: Number((basePrice * factor).toFixed(2)) });
    }

    return { rows, seatsPerRow, rowCategory };
  }
}
