import { IsOptional, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  cartId: string;

  @IsOptional()
  @IsUUID()
  agencyId?: string;
}
