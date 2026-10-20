import { IsEnum } from 'class-validator';
import { UserRole } from '@prisma/client';

export class ChangeRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
