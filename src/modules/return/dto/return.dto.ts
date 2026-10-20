import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateReturnDto {
  @IsUUID()
  orderId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class BulkReturnDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  @Type(() => String)
  returnIds: string[];

  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';
}
