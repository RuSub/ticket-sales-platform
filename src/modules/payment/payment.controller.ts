import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChargePaymentDto } from './dto/payment.dto';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':orderId/charge')
  charge(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Req() req: any,
    @Body() dto: ChargePaymentDto,
  ) {
    return this.paymentService.charge(orderId, dto.paymentMethod, req.user.userId, req.user.role);
  }
}
