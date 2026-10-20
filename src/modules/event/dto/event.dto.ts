import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EventGenre } from '@prisma/client';

export class CreateEventDto {
  @IsString()
  @Length(3, 255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsISO8601()
  eventDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  venueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  venueAddress?: string;

  @IsEnum(EventGenre)
  genre: EventGenre;

  @IsOptional()
  @IsISO8601()
  saleStartTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateId?: string;

  @IsOptional()
  @IsObject()
  venueLayout?: Record<string, any>;

  /** Base ticket price used when generating seats from a layout. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice?: number;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @Length(3, 255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsISO8601()
  eventDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  venueName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  venueAddress?: string;

  @IsOptional()
  @IsEnum(EventGenre)
  genre?: EventGenre;

  @IsOptional()
  @IsISO8601()
  saleStartTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  templateId?: string;

  @IsOptional()
  @IsObject()
  venueLayout?: Record<string, any>;
}

export class UpdateVenueLayoutDto {
  @IsObject()
  venueLayout: Record<string, any>;
}

export class CreateSeatCategoryDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  zoneName?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity: number;
}

export class GenerateSeatsDto {
  @IsOptional()
  @IsObject()
  venueLayout?: Record<string, any>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  basePrice?: number;
}
