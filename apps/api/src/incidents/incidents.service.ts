import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { OutboxService } from '../integrations/outbox.service';
import { Incident, IncidentStatus, Severity, TimelineEvent } from './incident.types';
import { AddTimelineEventDto, CreateIncidentDto, UpdateIncidentDto } from './incidents.dto';

type IncidentRow = { id: string; title: string; description: string; severity: Severity; status: IncidentStatus; owner: string; created_at: Date; updated_at: Date };
type TimelineRow = { id: string; incident_id: string; message: string; created_at: Date };
const iso = (date: Date | string) => new Date(date).toISOString();

@Injectable()
export class IncidentsService {
  constructor(private readonly db: DatabaseService, private readonly outbox: OutboxService) {}

  private async hydrate(rows: IncidentRow[]): Promise<Incident[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const events = await this.db.query<TimelineRow>(
      `SELECT id, incident_id, message, created_at FROM incident_timeline WHERE incident_id = ANY($1) ORDER BY created_at ASC, id ASC`, [ids]);
    const byIncident = new Map<string, TimelineEvent[]>();
    for (const event of events) {
      const list = byIncident.get(event.incident_id) ?? [];
      list.push({ id: event.id, message: event.message, createdAt: iso(event.created_at) });
      byIncident.set(event.incident_id, list);
    }
    return rows.map((row) => ({ id: row.id, title: row.title, description: row.description,
      severity: row.severity, status: row.status, owner: row.owner,
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), timeline: byIncident.get(row.id) ?? [] }));
  }

  // Build the immutable event snapshot on the same connection, before commit.
  private async snapshot(conn: PoolClient, id: string): Promise<Incident> {
    const rows = await conn.query<IncidentRow>('SELECT * FROM incidents WHERE id = $1', [id]);
    const events = await conn.query<TimelineRow>(
      'SELECT * FROM incident_timeline WHERE incident_id = $1 ORDER BY created_at ASC, id ASC', [id]);
    const row = rows.rows[0];
    return { id: row.id, title: row.title, description: row.description,
      severity: row.severity, status: row.status, owner: row.owner,
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
      timeline: events.rows.map(e => ({ id: e.id, message: e.message, createdAt: iso(e.created_at) })) };
  }

  async findAll(): Promise<Incident[]> {
    const rows = await this.db.query<IncidentRow>('SELECT * FROM incidents ORDER BY created_at DESC, id DESC');
    return this.hydrate(rows);
  }
  async findOne(id: string): Promise<Incident> {
    const rows = await this.db.query<IncidentRow>('SELECT * FROM incidents WHERE id = $1', [id]);
    if (!rows.length) throw new NotFoundException('Incident not found');
    return (await this.hydrate(rows))[0];
  }
  async create(dto: CreateIncidentDto): Promise<Incident> {
    const id = randomUUID(); const eventId = randomUUID();
    await this.db.transaction(async (conn) => {
      await conn.query('INSERT INTO incidents (id,title,description,severity,status,owner) VALUES ($1,$2,$3,$4,$5,$6)',
        [id,dto.title,dto.description,dto.severity,'open',dto.owner]);
      await conn.query('INSERT INTO incident_timeline (id,incident_id,message) VALUES ($1,$2,$3)', [eventId,id,'Incident created']);
      await this.outbox.enqueue(conn, 'incident.created', await this.snapshot(conn, id));
    });
    const incident = await this.findOne(id);
    return incident;
  }
  async update(id: string, dto: UpdateIncidentDto): Promise<Incident> {
    const keys = (['status','severity','owner'] as const).filter((key) => dto[key] !== undefined);
    if (!keys.length) return this.findOne(id);
    await this.db.transaction(async (conn) => {
      const rows = await conn.query<IncidentRow>('SELECT * FROM incidents WHERE id = $1 FOR UPDATE', [id]);
      if (!rows.rows.length) throw new NotFoundException('Incident not found');
      const changes = keys.filter((key) => rows.rows[0][key] !== dto[key]);
      if (!changes.length) return;
      const setClauses = changes.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
      const params = [...changes.map((key) => dto[key]!), id];
      await conn.query(`UPDATE incidents SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = $${changes.length + 1}`, params);
      for (const key of changes) await conn.query(
        'INSERT INTO incident_timeline (id,incident_id,message) VALUES ($1,$2,$3)',
        [randomUUID(),id,`${key} changed to ${dto[key]}`]);
      await this.outbox.enqueue(conn, 'incident.updated', await this.snapshot(conn, id));
    });
    const incident = await this.findOne(id);
    return incident;
  }
  async addEvent(id: string, dto: AddTimelineEventDto): Promise<Incident> {
    await this.db.transaction(async (conn) => {
      const rows = await conn.query<IncidentRow>('SELECT id FROM incidents WHERE id = $1 FOR UPDATE', [id]);
      if (!rows.rows.length) throw new NotFoundException('Incident not found');
      await conn.query('INSERT INTO incident_timeline (id,incident_id,message) VALUES ($1,$2,$3)', [randomUUID(),id,dto.message]);
      await conn.query('UPDATE incidents SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
      await this.outbox.enqueue(conn, 'incident.timeline_added', await this.snapshot(conn, id));
    });
    const incident = await this.findOne(id);
    return incident;
  }
}
