import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class AssignAgencyDto {
  @IsUUID()
  agencyId: string;
}

export class CreateAgencyOrderDto {
  @IsUUID()
  eventId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  seatIds: string[];
}
