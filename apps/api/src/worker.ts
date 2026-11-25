import 'reflect-metadata';
import { DatabaseService } from './database/database.service';
import { WebhookService } from './integrations/webhook.service';
import { OutboxWorker } from './integrations/outbox.worker';

async function main(): Promise<void> {
  const db = new DatabaseService();
  const worker = new OutboxWorker(db, new WebhookService());
  const interval = Number(process.env.OUTBOX_POLL_MS ?? 2000);
  if (!Number.isFinite(interval) || interval < 500 || interval > 60_000) {
    await db.onModuleDestroy();
    throw new Error('OUTBOX_POLL_MS must be between 500 and 60000');
  }
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  try {
    while (!stopped) {
      try { await worker.runOnce(); }
      catch (error) { console.error('Outbox worker iteration failed:', error); }
      if (!stopped) await new Promise(resolve => setTimeout(resolve, interval));
    }
  } finally { await db.onModuleDestroy(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
