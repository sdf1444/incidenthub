import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}
  @Get()
  async health() {
    try { await this.db.ping(); return { status: 'ok', service: 'incidenthub-api', database: 'connected' }; }
    catch { throw new ServiceUnavailableException('Database unavailable'); }
  }
}
