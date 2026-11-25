import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { OutboxService } from '../integrations/outbox.service';
@Module({ controllers: [IncidentsController], providers: [IncidentsService, OutboxService], exports: [IncidentsService] })
export class IncidentsModule {}
