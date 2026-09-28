import { Controller, Get } from '@nestjs/common';

import { IncidentsService } from '../incidents/incidents.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get('summary')
  summary() {
    const all = this.incidents.findAll();

    return {
      total: all.length,
      open: all.filter((incident) => incident.status !== 'resolved').length,
      critical: all.filter(
        (incident) =>
          incident.severity === 'critical' && incident.status !== 'resolved',
      ).length,
      resolved: all.filter((incident) => incident.status === 'resolved').length,
    };
  }
}
