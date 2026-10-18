import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { prisma } from '../../prisma/prisma.service';
import { EventStatus, EventGenre } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';

@Injectable()
export class EventService {
  constructor(private auditLogService: AuditLogService) {}

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        skip,
        take: limit,
        where: { status: 'APPROVED' },
        orderBy: { eventDate: 'asc' },
        select: {
          id: true, title: true, description: true, eventDate: true,
          venueName: true, venueAddress: true, genre: true, status: true,
          saleStartTime: true, organizer: { select: { id: true, fullName: true } },
          _count: { select: { seats: true } },
        },
      }),
      prisma.event.count({ where: { status: 'APPROVED' } }),
    ]);
    return { events, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string) {
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        organizer: { select: { id: true, email: true, fullName: true } },
        categories: true,
        seats: { include: { category: true } },
        template: { select: { id: true, name: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async create(data: any, organizerId: string) {
    const event = await prisma.event.create({
      data: {
        organizerId,
        title: data.title,
        description: data.description,
        eventDate: new Date(data.eventDate),
        venueName: data.venueName,
        venueAddress: data.venueAddress,
        genre: data.genre as EventGenre,
        status: 'PENDING' as EventStatus,
        saleStartTime: data.saleStartTime ? new Date(data.saleStartTime) : null,
        templateId: data.templateId,
        venueLayout: data.venueLayout,
      },
    });
    await this.auditLogService.log(organizerId, 'event_created', 'event', event.id, { title: event.title });
    return event;
  }

  async update(id: string, data: any, organizerId: string) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Not your event');

    return prisma.event.update({ where: { id }, data });
  }

  async delete(id: string, organizerId: string) {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Not your event');

    const activeOrders = await prisma.order.count({
      where: { eventId: id, status: { in: ['PAID', 'PENDING_PAYMENT'] } },
    });
    if (activeOrders > 0) {
      throw new BadRequestException('Cannot delete event with active orders');
    }

    return prisma.event.delete({ where: { id } });
  }

  // Status workflow
  async approve(id: string, adminId: string) {
    const event = await prisma.event.update({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED' },
    });
    await this.auditLogService.log(adminId, 'event_approved', 'event', id, { title: event.title });
    return event;
  }

  async reject(id: string, adminId: string) {
    const event = await prisma.event.update({
      where: { id, status: 'PENDING' },
      data: { status: 'HIDDEN' },
    });
    await this.auditLogService.log(adminId, 'event_rejected', 'event', id, { title: event.title });
    return event;
  }

  async getPendingForModeration(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [events, total] = await Promise.all([
      prisma.event.findMany({
        skip, take: limit, where: { status: 'PENDING' },
        select: { id: true, title: true, description: true, status: true,
          organizer: { select: { id: true, email: true, fullName: true } },
          createdAt: true, eventDate: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.event.count({ where: { status: 'PENDING' } }),
    ]);
    return { events, total, page, totalPages: Math.ceil(total / limit) };
  }

  // Venue templates
  async getTemplates() {
    return prisma.venueTemplate.findMany({ select: { id: true, name: true, layoutSchema: true } });
  }

  // Venue layout
  async updateVenueLayout(eventId: string, organizerId: string, layout: any) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Not your event');

    // Validate layout
    if (!layout.rows || !layout.seatsPerRow) {
      throw new BadRequestException('Invalid venue layout: missing rows or seatsPerRow');
    }

    return prisma.event.update({
      where: { id: eventId },
      data: { venueLayout: layout },
    });
  }

  // Seat categories
  async createCategory(eventId: string, organizerId: string, data: any) {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.organizerId !== organizerId) throw new ForbiddenException('Not your event');

    return prisma.seatCategory.create({
      data: {
        eventId,
        name: data.name,
        zoneName: data.zoneName,
        price: parseFloat(data.price),
        capacity: data.capacity,
      },
    });
  }

  async getCategories(eventId: string) {
    return prisma.seatCategory.findMany({ where: { eventId } });
  }

  // Sale time restriction
  async isSaleAvailable(eventId: string): Promise<boolean> {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.status !== 'APPROVED') throw new BadRequestException('Event is not available');
    if (event.saleStartTime && new Date() < event.saleStartTime) {
      throw new BadRequestException('Sales not started yet');
    }
    return true;
  }
}
