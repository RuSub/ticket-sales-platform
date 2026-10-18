import { Controller, Get, Post, Delete, Param, Body, UseGuards, Req } from '@nestjs/common';
import { ReturnService } from './return.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('returns')
export class ReturnController {
  constructor(private returnService: ReturnService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Req() req: any) {
    return this.returnService.findByBuyer(req.user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.returnService.findById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: any, @Body('orderId') orderId: string, @Body('reason') reason?: string) {
    return this.returnService.create(orderId, req.user.userId, reason, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  cancel(@Param('id') id: string, @Req() req: any) {
    return this.returnService.cancel(id, req.user.userId);
  }

  // Organizer approve/reject
  @Roles(UserRole.ORGANIZER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: any) {
    return this.returnService.approve(id, req.user.userId, 'ORGANIZER');
  }

  @Roles(UserRole.ORGANIZER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/reject')
  reject(@Param('id') id: string, @Req() req: any) {
    return this.returnService.reject(id, req.user.userId, 'ORGANIZER');
  }

  // Support operations
  @Roles(UserRole.SUPPORT, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/approve-support')
  approveSupport(@Param('id') id: string, @Req() req: any) {
    return this.returnService.approve(id, req.user.userId, 'SUPPORT');
  }

  @Roles(UserRole.SUPPORT, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/reject-support')
  rejectSupport(@Param('id') id: string, @Req() req: any) {
    return this.returnService.reject(id, req.user.userId, 'SUPPORT');
  }

  // Bulk operations
  @Roles(UserRole.ORGANIZER, UserRole.SUPPORT, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('bulk-action')
  bulkAction(@Req() req: any, @Body('returnIds') returnIds: string[], @Body('action') action: 'approve' | 'reject') {
    return this.returnService.bulkAction(returnIds, action, req.user.userId, req.user.role);
  }

  // Organizer pending returns
  @Roles(UserRole.ORGANIZER)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('organizer/pending')
  getPendingForOrganizer(@Req() req: any) {
    return { message: 'Get pending returns for organizer' };
  }
}
