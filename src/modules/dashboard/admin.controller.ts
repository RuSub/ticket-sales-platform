import { Controller, Get, Post, Patch, Param, Body, UseGuards, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';

@Controller('admin')
export class AdminController {
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('users')
  getUsers(@Query('page') page?: number, @Query('limit') limit?: number) {
    const p = page || 1;
    const l = limit || 20;
    return prisma.user.findMany({
      skip: (p - 1) * l,
      take: l,
      select: { id: true, email: true, role: true, fullName: true, isActive: true, createdAt: true },
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch('users/:id/role')
  changeRole(@Param('id') id: string, @Body('role') role: UserRole, @Req() req: any) {
    return prisma.user.update({ where: { id }, data: { role } });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('users/:id/block')
  block(@Param('id') id: string) {
    return prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('users/:id/unblock')
  unblock(@Param('id') id: string) {
    return prisma.user.update({ where: { id }, data: { isActive: true } });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('events/pending')
  getPendingEvents(@Query('page') page?: number, @Query('limit') limit?: number) {
    const p = page || 1;
    const l = limit || 20;
    return prisma.event.findMany({
      select: { id: true, title: true, description: true, status: true, createdAt: true, eventDate: true,
        organizer: { select: { id: true, email: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('events/:id/approve')
  approveEvent(@Param('id') id: string, @Req() req: any) {
    return prisma.event.update({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED' } });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('events/:id/reject')
  rejectEvent(@Param('id') id: string, @Req() req: any) {
    return prisma.event.update({ where: { id, status: 'PENDING' }, data: { status: 'HIDDEN' } });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('settings/commission')
  getCommission() {
    return prisma.platformSetting.findUnique({ where: { key: 'platform_commission' } });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch('settings/commission')
  updateCommission(@Body('percentage') percentage: number) {
    return prisma.platformSetting.upsert({
      where: { key: 'platform_commission' },
      update: { value: { percentage, currency: 'RUB' } },
      create: { key: 'platform_commission', value: { percentage, currency: 'RUB' } },
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('analytics')
  getAnalytics() {
    return Promise.all([
      prisma.user.count(),
      prisma.event.count(),
      prisma.order.aggregate({ _sum: { totalAmount: true } }),
      prisma.order.count(),
    ]).then(([totalUsers, totalEvents, revenue, totalOrders]) => ({
      totalUsers,
      totalEvents,
      totalRevenue: revenue._sum.totalAmount || 0,
      totalOrders,
    }));
  }
}
