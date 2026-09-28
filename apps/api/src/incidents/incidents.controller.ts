import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import {
  AddTimelineEventDto,
  CreateIncidentDto,
  UpdateIncidentDto,
} from './incidents.dto';
import { IncidentsService } from './incidents.service';

@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  findAll() {
    return this.incidents.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.incidents.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateIncidentDto) {
    return this.incidents.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIncidentDto) {
    return this.incidents.update(id, dto);
  }

  @Post(':id/timeline')
  addEvent(@Param('id') id: string, @Body() dto: AddTimelineEventDto) {
    return this.incidents.addEvent(id, dto);
  }
}
