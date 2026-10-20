import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChargePaymentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  paymentMethod: string;
}
