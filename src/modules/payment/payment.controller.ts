import { Controller, Post, Param, Body, UseGuards, Req } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('payments')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':orderId/charge')
  charge(@Param('orderId') orderId: string, @Req() req: any, @Body('paymentMethod') paymentMethod: string) {
    return this.paymentService.charge(orderId, paymentMethod, req.user.userId);
  }
}
