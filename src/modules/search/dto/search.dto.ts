import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { EventGenre } from '@prisma/client';
import { PageQueryDto } from '../../../common/dto/pagination.dto';

export class SearchQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  query?: string;

  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  city?: string;

  @IsOptional()
  @IsEnum(EventGenre)
  genre?: EventGenre;
}
