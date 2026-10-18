import { Injectable } from '@nestjs/common';
import { prisma } from '../../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  async log(userId: string | null, action: string, targetType: string | null, targetId: string | null, details: any, ipAddress?: string) {
    return prisma.auditLog.create({
      data: {
        userId,
        action,
        targetType,
        targetId,
        details,
        ipAddress,
      },
    });
  }

  async getHistory(targetType: string, targetId: string) {
    return prisma.auditLog.findMany({
      where: { targetType, targetId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
  }

  async getAll(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true, fullName: true } } },
      }),
      prisma.auditLog.count(),
    ]);
    return { logs, total, page, totalPages: Math.ceil(total / limit) };
  }
}
