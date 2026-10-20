import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { OrderService } from '../order/order.service';
import { ReturnService } from '../return/return.service';
import { SupportOrdersQueryDto } from './dto/support.dto';

@Controller('support')
@Roles(UserRole.SUPPORT, UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
export class SupportController {
  constructor(
    private readonly orderService: OrderService,
    private readonly returnService: ReturnService,
  ) {}

  @Get('orders')
  async searchOrders(@Query() query: SupportOrdersQueryDto) {
    const where: Prisma.OrderWhereInput = {};
    if (query.query?.trim()) {
      const value = query.query.trim();
      where.OR = [
        { id: value },
        { buyer: { email: { contains: value, mode: 'insensitive' } } },
      ];
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          buyer: { select: { id: true, email: true, fullName: true } },
          event: { select: { id: true, title: true, eventDate: true } },
          items: { include: { seat: true, category: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.order.count({ where }),
    ]);

    return { orders, total, page: query.page, totalPages: Math.ceil(total / query.limit) };
  }

  @Get('orders/:id')
  getOrderDetails(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.orderService.findById(id, req.user.userId, req.user.role);
  }

  @Get('orders/:id/history')
  getOrderHistory(@Param('id', ParseUUIDPipe) id: string) {
    return prisma.auditLog.findMany({
      where: { targetType: 'order', targetId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
  }

  @Post('orders/:id/cancel')
  cancelOrder(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.orderService.cancel(id, req.user.userId, 'SUPPORT');
  }

  @Post('orders/:id/confirm')
  confirmOrder(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.orderService.confirmBySupport(id, req.user.userId);
  }

  @Post('returns/:id/approve')
  approveReturn(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.returnService.approve(id, req.user.userId, 'SUPPORT');
  }

  @Post('returns/:id/reject')
  rejectReturn(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.returnService.reject(id, req.user.userId, 'SUPPORT');
  }
}
