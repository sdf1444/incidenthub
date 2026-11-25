import { Module } from '@nestjs/common';

import { DatabaseModule } from './database/database.module';
import { HealthController } from './common/health.controller';
import { DashboardModule } from './dashboard/dashboard.module';
import { IncidentsModule } from './incidents/incidents.module';

@Module({
  imports: [DatabaseModule, IncidentsModule, DashboardModule],
  controllers: [HealthController],
})
export class AppModule {}
