import { Injectable } from '@nestjs/common';
import { prisma } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class UserService {
  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      prisma.user.findMany({ skip, take: limit, select: { id: true, email: true, role: true, fullName: true, isActive: true, createdAt: true } }),
      prisma.user.count(),
    ]);
    return { users, total, page, totalPages: Math.ceil(total / limit) };
  }

  async update(id: string, data: { fullName?: string; phone?: string }) {
    return prisma.user.update({ where: { id }, data });
  }

  async block(id: string) {
    return prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  async unblock(id: string) {
    return prisma.user.update({ where: { id }, data: { isActive: true } });
  }

  async changeRole(id: string, role: UserRole) {
    return prisma.user.update({ where: { id }, data: { role } });
  }
}
