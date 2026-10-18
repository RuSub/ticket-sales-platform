import { Controller, Get, Post, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';

@Controller('support')
export class SupportController {
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('orders')
  searchOrders(@Query('query') query?: string) {
    const where: any = {};
    if (query) {
      where.OR = [
        { buyer: { email: { contains: query, mode: 'insensitive' } } },
        { id: query },
      ];
    }
    return prisma.order.findMany({
      where,
      include: { buyer: { select: { id: true, email: true, fullName: true } },
        items: { include: { seat: true, category: true } } },
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('orders/:id')
  getOrderDetails(@Param('id') id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: { buyer: true, items: { include: { seat: true, category: true } } },
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('orders/:id/history')
  getOrderHistory(@Param('id') id: string) {
    return prisma.auditLog.findMany({
      where: { targetType: 'order', targetId: id },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('orders/:id/cancel')
  cancelOrder(@Param('id') id: string, @Req() req: any) {
    return prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('orders/:id/confirm')
  confirmOrder(@Param('id') id: string, @Req() req: any) {
    return prisma.order.update({ where: { id }, data: { status: 'PAID' } });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('returns/:id/approve')
  approveReturn(@Param('id') id: string, @Req() req: any) {
    return { message: 'Return approved by support', returnId: id };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('returns/:id/reject')
  rejectReturn(@Param('id') id: string, @Req() req: any) {
    return { message: 'Return rejected by support', returnId: id };
  }
}
