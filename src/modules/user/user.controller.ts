import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe() {
    return { message: 'Get current user' };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@Body() data: any) {
    return { message: 'Update user', data };
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  findAll(@Body('page') page?: number, @Body('limit') limit?: number) {
    return this.userService.findAll(page, limit);
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id/role')
  changeRole(@Param('id') id: string, @Body('role') role: UserRole) {
    return this.userService.changeRole(id, role);
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/block')
  block(@Param('id') id: string) {
    return this.userService.block(id);
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/unblock')
  unblock(@Param('id') id: string) {
    return this.userService.unblock(id);
  }
}
