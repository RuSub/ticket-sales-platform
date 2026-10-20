import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { PUBLIC_USER_SELECT } from '../auth/auth.service';

@Injectable()
export class UserService {
  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  }

  async findById(id: string) {
    const user = await prisma.user.findUnique({ where: { id }, select: PUBLIC_USER_SELECT });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll(page = 1, limit = 20) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        select: PUBLIC_USER_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count(),
    ]);

    return { users, total, page: safePage, totalPages: Math.ceil(total / safeLimit) };
  }

  async update(id: string, data: { fullName?: string; phone?: string }) {
    return prisma.user.update({
      where: { id },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
      },
      select: PUBLIC_USER_SELECT,
    });
  }

  async block(id: string) {
    return prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: PUBLIC_USER_SELECT,
    });
  }

  async unblock(id: string) {
    return prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: PUBLIC_USER_SELECT,
    });
  }

  async changeRole(id: string, role: UserRole) {
    return prisma.user.update({
      where: { id },
      data: { role },
      select: PUBLIC_USER_SELECT,
    });
  }
}
