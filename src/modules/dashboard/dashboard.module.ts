import { Module } from '@nestjs/common';
import { OrganizerController } from './organizer.controller';
import { AgencyController } from './agency.controller';
import { AdminController } from './admin.controller';
import { SupportController } from './support.controller';

@Module({
  controllers: [OrganizerController, AgencyController, AdminController, SupportController],
})
export class DashboardModule {}
