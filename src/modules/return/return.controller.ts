import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReturnService } from './return.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { ReturnStatus, UserRole } from '@prisma/client';
import { BulkReturnDto, CreateReturnDto } from './dto/return.dto';

@Controller('returns')
export class ReturnController {
  constructor(private readonly returnService: ReturnService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Req() req: any) {
    return this.returnService.findByBuyer(req.user.userId);
  }

  // Must be declared before ':id'.
  @Roles(UserRole.ORGANIZER, UserRole.SUPPORT, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('organizer/pending')
  getPendingForOrganizer(@Req() req: any) {
    return this.returnService.findByOrganizer(req.user.userId, ReturnStatus.PENDING);
  }

  @Roles(UserRole.ORGANIZER, UserRole.SUPPORT, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('bulk-action')
  bulkAction(@Req() req: any, @Body() dto: BulkReturnDto) {
    return this.returnService.bulkAction(dto.returnIds, dto.action, req.user.userId, req.user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: any, @Body() dto: CreateReturnDto) {
    return this.returnService.create(
      dto.orderId,
      req.user.userId,
      dto.reason,
      req.user.userId,
      req.user.role,
    );
  }

  @Roles(UserRole.ORGANIZER, UserRole.SUPPORT, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.returnService.approve(id, req.user.userId, req.user.role);
  }

  @Roles(UserRole.ORGANIZER, UserRole.SUPPORT, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.returnService.reject(id, req.user.userId, req.user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.returnService.cancel(id, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.returnService.findById(id, req.user.userId, req.user.role);
  }
}
