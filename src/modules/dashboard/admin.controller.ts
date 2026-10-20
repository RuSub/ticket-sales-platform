import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import { UserRole } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { EventService } from '../event/event.service';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { PageQueryDto } from '../../common/dto/pagination.dto';
import { ChangeRoleDto } from '../user/dto/user.dto';
import { PUBLIC_USER_SELECT } from '../auth/auth.service';

class CommissionDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  percentage: number;
}

@Controller('admin')
@Roles(UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly eventService: EventService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('users')
  async getUsers(@Query() query: PageQueryDto) {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: PUBLIC_USER_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count(),
    ]);
    return { users, total, page: query.page, totalPages: Math.ceil(total / query.limit) };
  }

  @Patch('users/:id/role')
  async changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
    @Req() req: any,
  ) {
    // Guard against an admin locking themselves out of the admin panel.
    if (id === req.user.userId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role: dto.role },
      select: PUBLIC_USER_SELECT,
    });

    await this.auditLogService.log(req.user.userId, 'role_change', 'user', id, {
      newRole: dto.role,
    });
    return user;
  }

  @Post('users/:id/block')
  async block(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    if (id === req.user.userId) {
      throw new ForbiddenException('You cannot block your own account');
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: PUBLIC_USER_SELECT,
    });

    await this.auditLogService.log(req.user.userId, 'user_blocked', 'user', id, {
      isActive: false,
    });
    return user;
  }

  @Post('users/:id/unblock')
  async unblock(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const user = await prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: PUBLIC_USER_SELECT,
    });

    await this.auditLogService.log(req.user.userId, 'user_unblocked', 'user', id, {
      isActive: true,
    });
    return user;
  }

  @Get('events/pending')
  getPendingEvents(@Query() query: PageQueryDto) {
    return this.eventService.getPendingForModeration(query.page, query.limit);
  }

  @Post('events/:id/approve')
  approveEvent(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.eventService.approve(id, req.user.userId);
  }

  @Post('events/:id/reject')
  rejectEvent(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.eventService.reject(id, req.user.userId);
  }

  @Get('settings/commission')
  getCommission() {
    return prisma.platformSetting.findUnique({ where: { key: 'platform_commission' } });
  }

  @Patch('settings/commission')
  async updateCommission(@Body() dto: CommissionDto, @Req() req: any) {
    const setting = await prisma.platformSetting.upsert({
      where: { key: 'platform_commission' },
      update: { value: { percentage: dto.percentage, currency: 'RUB' } },
      create: { key: 'platform_commission', value: { percentage: dto.percentage, currency: 'RUB' } },
    });

    await this.auditLogService.log(req.user.userId, 'commission_updated', 'platform_setting', setting.id, {
      percentage: dto.percentage,
    });
    return setting;
  }

  @Get('analytics')
  async getAnalytics() {
    const [totalUsers, totalEvents, totalOrders, paidOrders] = await Promise.all([
      prisma.user.count(),
      prisma.event.count(),
      prisma.order.count(),
      prisma.order.aggregate({
        where: { status: 'PAID' },
        _sum: { totalAmount: true, platformCommission: true },
        _count: { _all: true },
      }),
    ]);

    return {
      totalUsers,
      totalEvents,
      totalOrders,
      paidOrders: paidOrders._count._all,
      totalRevenue: paidOrders._sum.totalAmount ?? 0,
      platformCommission: paidOrders._sum.platformCommission ?? 0,
    };
  }
}
