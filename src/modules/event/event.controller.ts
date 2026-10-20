import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EventService } from './event.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PageQueryDto } from '../../common/dto/pagination.dto';
import {
  CreateEventDto,
  CreateSeatCategoryDto,
  GenerateSeatsDto,
  UpdateEventDto,
  UpdateVenueLayoutDto,
} from './dto/event.dto';

@Controller('events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get()
  findAll(@Query() query: PageQueryDto) {
    return this.eventService.findAll(query.page, query.limit);
  }

  // Static routes MUST be declared before ':id', otherwise Express matches
  // "templates"/"pending" as an event id.
  @Get('templates')
  getTemplates() {
    return this.eventService.getTemplates();
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('pending')
  getPending(@Query() query: PageQueryDto) {
    return this.eventService.getPendingForModeration(query.page, query.limit);
  }

  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post()
  create(@Req() req: any, @Body() dto: CreateEventDto) {
    return this.eventService.create(dto, req.user.userId);
  }

  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id/venue-layout')
  updateLayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body() dto: UpdateVenueLayoutDto,
  ) {
    return this.eventService.updateVenueLayout(id, req.user.userId, dto.venueLayout);
  }

  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/categories')
  createCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body() dto: CreateSeatCategoryDto,
  ) {
    return this.eventService.createCategory(id, req.user.userId, dto);
  }

  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/generate-seats')
  generateSeats(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body() dto: GenerateSeatsDto,
  ) {
    return this.eventService.generateSeats(id, req.user.userId, {
      layout: dto.venueLayout,
      basePrice: dto.basePrice,
    });
  }

  @Get(':id/categories')
  getCategories(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventService.getCategories(id);
  }

  @Get(':id/sale-status')
  checkSaleStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventService.isSaleAvailable(id);
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.eventService.approve(id, req.user.userId);
  }

  @Roles(UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post(':id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.eventService.reject(id, req.user.userId);
  }

  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Req() req: any, @Body() dto: UpdateEventDto) {
    return this.eventService.update(id, dto, req.user.userId);
  }

  @Roles(UserRole.ORGANIZER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.eventService.delete(id, req.user.userId);
  }

  // Keep the catch-all ':id' last.
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventService.findById(id);
  }
}
