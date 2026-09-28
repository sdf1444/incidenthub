import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { Incident } from './incident.types';
import {
  AddTimelineEventDto,
  CreateIncidentDto,
  UpdateIncidentDto,
} from './incidents.dto';

@Injectable()
export class IncidentsService {
  private readonly incidents = new Map<string, Incident>();

  constructor() {
    this.seed();
  }

  private seed(): void {
    const now = new Date().toISOString();
    const id = randomUUID();

    this.incidents.set(id, {
      id,
      title: 'Checkout latency spike',
      description: 'Elevated response times on checkout API.',
      severity: 'high',
      status: 'investigating',
      owner: 'Platform team',
      createdAt: now,
      updatedAt: now,
      timeline: [
        {
          id: randomUUID(),
          message: 'Incident created',
          createdAt: now,
        },
      ],
    });
  }

  findAll() {
    return [...this.incidents.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  findOne(id: string) {
    const item = this.incidents.get(id);

    if (!item) {
      throw new NotFoundException('Incident not found');
    }

    return item;
  }

  create(dto: CreateIncidentDto) {
    const now = new Date().toISOString();
    const incident: Incident = {
      id: randomUUID(),
      ...dto,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      timeline: [
        {
          id: randomUUID(),
          message: 'Incident created',
          createdAt: now,
        },
      ],
    };

    this.incidents.set(incident.id, incident);
    return incident;
  }

  update(id: string, dto: UpdateIncidentDto) {
    const current = this.findOne(id);
    const now = new Date().toISOString();
    const changes = Object.entries(dto).map(
      ([key, value]) => `${key} changed to ${value}`,
    );

    const updated = {
      ...current,
      ...dto,
      updatedAt: now,
      timeline: [
        ...current.timeline,
        ...changes.map((message) => ({
          id: randomUUID(),
          message,
          createdAt: now,
        })),
      ],
    };

    this.incidents.set(id, updated);
    return updated;
  }

  addEvent(id: string, dto: AddTimelineEventDto) {
    const current = this.findOne(id);
    const now = new Date().toISOString();

    const updated = {
      ...current,
      updatedAt: now,
      timeline: [
        ...current.timeline,
        {
          id: randomUUID(),
          message: dto.message,
          createdAt: now,
        },
      ],
    };

    this.incidents.set(id, updated);
    return updated;
  }
}
