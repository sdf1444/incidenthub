import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { Incident } from '../incidents/incident.types';

export type OutboxEvent = { id: string; type: string; occurredAt: string; incident: Incident };

@Injectable()
export class OutboxService {
  // No destination configured means delivery is explicitly disabled, not silently retried.
  async enqueue(conn: PoolClient, type: string, incident: Incident): Promise<void> {
    const destination = process.env.INCIDENT_WEBHOOK_URL;
    if (!destination) return;
    const event: OutboxEvent = { id: randomUUID(), type, occurredAt: new Date().toISOString(), incident };
    await conn.query(
      `INSERT INTO webhook_outbox (id, event_type, destination_url, payload, status, attempts, next_attempt_at)
       VALUES ($1, $2, $3, $4, 'pending', 0, CURRENT_TIMESTAMP)`,
      [event.id, type, destination, JSON.stringify(event)]);
  }
}
