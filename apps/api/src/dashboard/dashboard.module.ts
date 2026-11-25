import { Module } from '@nestjs/common';

import { IncidentsModule } from '../incidents/incidents.module';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [IncidentsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
