import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PageQueryDto } from '../../common/dto/pagination.dto';
import { CreateOrderDto } from './dto/order.dto';
import { QRCodeService } from '../../common/qr/qr.service';

@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly qrCodeService: QRCodeService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Req() req: any, @Query() query: PageQueryDto) {
    return this.orderService.findByBuyer(req.user.userId, query.page, query.limit);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: any, @Body() dto: CreateOrderDto) {
    return this.orderService.createFromCart(req.user.userId, dto.cartId, dto.agencyId);
  }

  @Roles(UserRole.SUPPORT, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/cancel-support')
  cancelSupport(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.orderService.cancel(id, req.user.userId, req.user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.orderService.cancel(id, req.user.userId, req.user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/ticket')
  async ticket(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const order = await this.orderService.findById(id, req.user.userId, req.user.role);
    const ticketId = order.ticketId ?? order.id;
    const pdf = await this.qrCodeService.generateTicketPDF(
      ticketId,
      order.event,
      order.items.map((item) => item.seat),
      order.buyer,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${ticketId}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.orderService.findById(id, req.user.userId, req.user.role);
  }
}
