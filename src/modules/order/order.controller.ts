import { Controller, Get, Post, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('orders')
export class OrderController {
  constructor(private orderService: OrderService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Req() req: any, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.orderService.findByBuyer(req.user.userId, page, limit);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.orderService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: any, @Body('cartId') cartId: string, @Body('agencyId') agencyId?: string) {
    return this.orderService.createFromCart(req.user.userId, cartId, agencyId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: any) {
    return this.orderService.cancel(id, req.user.userId, 'BUYER');
  }

  // Support manual operations
  @Roles(UserRole.SUPPORT, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/cancel-support')
  cancelSupport(@Param('id') id: string, @Req() req: any) {
    return this.orderService.cancel(id, req.user.userId, 'SUPPORT');
  }
}
