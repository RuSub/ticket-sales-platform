import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { EventService } from './event.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('events')
export class EventController {
  constructor(private eventService: EventService) {}

  @Get()
  findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.eventService.findAll(page, limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventService.findById(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req: any, @Body() data: any) {
    return this.eventService.create(data, req.user.userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Req() req: any, @Body() data: any) {
    return this.eventService.update(id, data, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.eventService.delete(id, req.user.userId);
  }

  // Admin moderation
  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('pending')
  getPending(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.eventService.getPendingForModeration(page, limit);
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: any) {
    return this.eventService.approve(id, req.user.userId);
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/reject')
  reject(@Param('id') id: string, @Req() req: any) {
    return this.eventService.reject(id, req.user.userId);
  }

  // Venue templates
  @Get('templates')
  getTemplates() {
    return this.eventService.getTemplates();
  }

  // Venue layout
  @UseGuards(JwtAuthGuard)
  @Patch(':id/venue-layout')
  updateLayout(@Param('id') id: string, @Req() req: any, @Body() layout: any) {
    return this.eventService.updateVenueLayout(id, req.user.userId, layout);
  }

  // Seat categories
  @UseGuards(JwtAuthGuard)
  @Post(':id/categories')
  createCategory(@Param('id') id: string, @Req() req: any, @Body() data: any) {
    return this.eventService.createCategory(id, req.user.userId, data);
  }

  @Get(':id/categories')
  getCategories(@Param('id') id: string) {
    return this.eventService.getCategories(id);
  }

  // Sale availability check
  @Get(':id/sale-status')
  checkSaleStatus(@Param('id') id: string) {
    return this.eventService.isSaleAvailable(id);
  }
}
