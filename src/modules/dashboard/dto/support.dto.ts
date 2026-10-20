import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../../common/dto/pagination.dto';

export class SupportOrdersQueryDto extends PageQueryDto {
  /** Free-text search: order id or buyer email. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  query?: string;
}
