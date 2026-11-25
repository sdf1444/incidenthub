import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { WebhookDeliveryError, WebhookService } from './webhook.service';

export type OutboxRow = {
  id: string; destination_url: string; payload: string; attempts: number;
};

export const MAX_ATTEMPTS = 8;
export const retryDelayMs = (attempt: number) => Math.min(300_000, 1000 * 2 ** Math.max(0, Math.min(attempt - 1, 9)));

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  constructor(private readonly db: DatabaseService, private readonly webhook: WebhookService) {}

  // Claim a batch using row locks. A lease permits recovery after worker crashes.
  async claim(batchSize = 1): Promise<{ rows: OutboxRow[]; token: string }> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("Invalid batch size");
    const token = randomUUID();
    const rows = await this.db.transaction(async conn => {
      const selected = await conn.query<OutboxRow>(
        `SELECT id, destination_url, payload::text AS payload, attempts FROM webhook_outbox
         WHERE status IN ('pending', 'processing') AND next_attempt_at <= NOW()
         ORDER BY next_attempt_at, created_at LIMIT $1 FOR UPDATE SKIP LOCKED`, [batchSize]);
      const claimed: OutboxRow[] = [];
      for (const row of selected) {
        // Select expired final leases with SKIP LOCKED too: a sweeping UPDATE could
        // block competing claimers on the processing-index range.
        if (row.attempts >= MAX_ATTEMPTS) {
          await conn.query(
            `UPDATE webhook_outbox SET status='dead', lease_token=NULL,
             last_error='Attempt limit reached; last delivery outcome may be unknown' WHERE id=$1`, [row.id]);
          continue;
        }
        await conn.query(
          `UPDATE webhook_outbox SET status='processing', attempts=attempts+1, lease_token=$1, next_attempt_at=NOW() + INTERVAL '60 seconds'
           WHERE id=$2`, [token, row.id]);
        claimed.push({ ...row, attempts: row.attempts + 1 });
      }
      return claimed;
    });
    return { rows, token };
  }

  async runOnce(): Promise<number> {
    // Claim only the event we can send now; queued batch rows could lose their leases.
    const { rows, token } = await this.claim(1);
    for (const row of rows) {
      const attempt = row.attempts;
      try {
        await this.webhook.deliver(row.destination_url, row.payload);
        await this.db.query(
          `UPDATE webhook_outbox SET status='delivered', attempts=$1, delivered_at=NOW(), lease_token=NULL, last_error=NULL
           WHERE id=$2 AND lease_token=$3 AND status='processing'`, [attempt, row.id, token]);
      } catch (error) {
        const retryable = !(error instanceof WebhookDeliveryError) || error.retryable;
        const dead = !retryable || attempt >= MAX_ATTEMPTS;
        const message = error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000);
        await this.db.query(
          `UPDATE webhook_outbox SET status=$1, attempts=$2, lease_token=NULL, last_error=$3,
           next_attempt_at=NOW() + ($4::text || ' milliseconds')::interval
           WHERE id=$5 AND lease_token=$6 AND status='processing'`,
          [dead ? 'dead' : 'pending', attempt, message, retryDelayMs(attempt), row.id, token]);
        this.logger.warn(`Webhook event ${row.id} attempt ${attempt}: ${message}${dead ? ' (dead letter)' : ''}`);
      }
    }
    return rows.length;
  }
}
