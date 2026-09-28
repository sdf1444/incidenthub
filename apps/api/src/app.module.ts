import { Module } from '@nestjs/common';

import { HealthController } from './common/health.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { IncidentsModule } from './incidents/incidents.module';

@Module({
  imports: [IncidentsModule, DashboardModule],
  controllers: [HealthController],
})
export class AppModule {}
