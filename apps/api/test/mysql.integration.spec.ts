/// <reference types="jest" />
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { createHmac } from 'crypto';
import { DatabaseService } from '../src/database/database.service';
import { IncidentsService } from '../src/incidents/incidents.service';
import { OutboxService } from '../src/integrations/outbox.service';
import { OutboxWorker } from '../src/integrations/outbox.worker';
import { WebhookService } from '../src/integrations/webhook.service';

const postgresTest = process.env.RUN_POSTGRES_TESTS === '1' ? describe : describe.skip;
postgresTest('PostgreSQL outbox integration (isolated test database only)', () => {
  let db: DatabaseService;
  let service: IncidentsService;
  let server: Server;
  let receiverStatus = 200;
  const received: { body: string; id: string; signature: string }[] = [];
  const incidents: string[] = [];
  const oldUrl = process.env.INCIDENT_WEBHOOK_URL;
  const oldSecret = process.env.INCIDENT_WEBHOOK_SECRET;
  const create = async () => {
    const incident = await service.create({ title: 'Integration test', description: 'Test snapshot', severity: 'high', owner: 'QA' });
    incidents.push(incident.id);
    return incident;
  };
  const events = () => db.query<any[]>('SELECT *, payload::text AS body FROM webhook_outbox ORDER BY created_at, id');
  const worker = () => new OutboxWorker(db, new WebhookService());
  beforeAll(async () => {
    db = new DatabaseService();
    service = new IncidentsService(db, new OutboxService());
    const rows = await events();
    if (rows.length) throw new Error('Integration tests require a dedicated test database with an empty outbox and no running worker');
    server = createServer((req, res) => {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        received.push({ body, id: String(req.headers['x-incidenthub-event-id']), signature: String(req.headers['x-incidenthub-signature']) });
        res.writeHead(receiverStatus); res.end('test receiver');
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    process.env.INCIDENT_WEBHOOK_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    process.env.INCIDENT_WEBHOOK_SECRET = 'integration-secret';
  });
  beforeEach(() => { receiverStatus = 200; received.length = 0; });
  afterEach(async () => {
    for (const id of incidents.splice(0)) {
      await db.query("DELETE FROM webhook_outbox WHERE (payload->>'incident'::text)->>'id'::text = $1", [id]);
      await db.query('DELETE FROM incidents WHERE id = $1', [id]);
    }
  });
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (db) await db.onModuleDestroy();
    if (oldUrl === undefined) delete process.env.INCIDENT_WEBHOOK_URL; else process.env.INCIDENT_WEBHOOK_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.INCIDENT_WEBHOOK_SECRET; else process.env.INCIDENT_WEBHOOK_SECRET = oldSecret;
  });
  it('persists incident/timeline and captures immutable snapshots for all mutations', async () => {
    const incident = await create();
    const another = new IncidentsService(db, new OutboxService());
    expect((await another.findOne(incident.id)).timeline[0].message).toBe('Incident created');
    await another.update(incident.id, { status: 'investigating' });
    await another.addEvent(incident.id, { message: 'Investigating dependency' });
    const rows = await events();
    expect(rows).toHaveLength(3);
    const snapshots = rows.map(row => JSON.parse(row.body));
    expect(snapshots.find(e => e.type === 'incident.created').incident.status).toBe('open');
    expect(snapshots.find(e => e.type === 'incident.updated').incident.status).toBe('investigating');
    expect(snapshots.find(e => e.type === 'incident.timeline_added').incident.timeline).toHaveLength(3);
    await another.update(incident.id, { status: 'investigating' });
    expect(await events()).toHaveLength(3);
  });
  it('rolls incident, timeline and outbox back if enqueue fails after inserting', async () => {
    const outbox = new OutboxService();
    const enqueue = outbox.enqueue.bind(outbox);
    const spy = jest.spyOn(outbox, 'enqueue').mockImplementation(async (conn, type, incident) => {
      incidents.push(incident.id);
      await enqueue(conn, type, incident);
      throw new Error('Simulated enqueue failure');
    });
    await expect(new IncidentsService(db, outbox).create({ title: 'Rollback', description: 'Rollback', severity: 'low', owner: 'QA' })).rejects.toThrow('Simulated enqueue failure');
    spy.mockRestore();
    expect(await db.query<any[]>('SELECT id FROM incidents WHERE id=$1', [incidents[0]])).toHaveLength(0);
    expect(await db.query<any[]>('SELECT id FROM incident_timeline WHERE incident_id=$1', [incidents[0]])).toHaveLength(0);
    expect(await events()).toHaveLength(0);
  });
  it('retries a real HTTP 503, preserves ID/body/signature, and then delivers', async () => {
    await create();
    const initial = (await events())[0];
    receiverStatus = 503;
    await worker().runOnce();
    let row = (await events())[0];
    expect(row.status).toBe('pending'); expect(row.attempts).toBe(1);
    expect(row.next_attempt_at.getTime()).toBeGreaterThan(Date.now() - 100);
    await db.query('UPDATE webhook_outbox SET next_attempt_at=NOW() WHERE id=$1', [row.id]);
    receiverStatus = 200;
    await worker().runOnce();
    row = (await events())[0];
    expect(row.status).toBe('delivered'); expect(row.attempts).toBe(2);
    expect(received).toHaveLength(2);
    expect(received[0]).toEqual(received[1]);
    expect(received[0].body).toBe(initial.body);
    expect(received[0].id).toBe(initial.id);
    expect(received[0].signature).toBe('sha256=' + createHmac('sha256', 'integration-secret').update(initial.body).digest('hex'));
  });
  it('dead-letters HTTP 400 and permits explicit replay with the same event ID', async () => {
    await create(); receiverStatus = 400;
    await worker().runOnce();
    const dead = (await events())[0];
    expect(dead.status).toBe('dead');
    expect(await worker().runOnce()).toBe(0);
    await db.query("UPDATE webhook_outbox SET status='pending', attempts=0, next_attempt_at=NOW(), lease_token=NULL WHERE id=$1 AND status='dead'", [dead.id]);
    receiverStatus = 200; await worker().runOnce();
    expect((await events())[0].status).toBe('delivered');
    expect(received[1].id).toBe(dead.id);
  });
  it('dead-letters after eight retryable delivery attempts', async () => {
    await create(); receiverStatus = 503;
    for (let attempt = 1; attempt <= 8; attempt++) {
      await worker().runOnce();
      const row = (await events())[0];
      expect(row.attempts).toBe(attempt);
      expect(row.status).toBe(attempt === 8 ? 'dead' : 'pending');
      await db.query('UPDATE webhook_outbox SET next_attempt_at=NOW() WHERE id=$1', [row.id]);
    }
    expect(await worker().runOnce()).toBe(0); expect(received).toHaveLength(8);
  });
  it('separates concurrent claims and fences stale lease acknowledgements', async () => {
    await create(); await create();
    const [a, b] = await Promise.all([worker().claim(), worker().claim()]);
    expect(a.rows).toHaveLength(1); expect(b.rows).toHaveLength(1);
    expect(a.rows[0].id).not.toBe(b.rows[0].id);
    expect(await worker().runOnce()).toBe(0);
    await db.query('UPDATE webhook_outbox SET next_attempt_at=(NOW() - INTERVAL \'1 second\') WHERE id=$1', [a.rows[0].id]);
    const recovered = await worker().claim();
    expect(recovered.rows[0].id).toBe(a.rows[0].id);
    expect(recovered.rows[0].attempts).toBe(2);
    await db.query("UPDATE webhook_outbox SET status='delivered' WHERE id=$1 AND lease_token=$2 AND status='processing'", [a.rows[0].id, a.token]);
    const row = (await events()).find(e => e.id === a.rows[0].id);
    expect(row.status).toBe('processing'); expect(row.lease_token).toBe(recovered.token);
  });
  it('recovers a crashed claim and bounds repeated crashes at eight reservations', async () => {
    await create();
    const first = await worker().claim();
    expect(first.rows[0].attempts).toBe(1);
    await db.query('UPDATE webhook_outbox SET next_attempt_at=(NOW() - INTERVAL \'1 second\') WHERE id=$1', [first.rows[0].id]);
    await worker().runOnce();
    expect((await events())[0].status).toBe('delivered');
    await create();
    const active = (await events()).find(e => e.status === 'pending');
    await db.query("UPDATE webhook_outbox SET status='processing', attempts=8, next_attempt_at=(NOW() - INTERVAL '1 second'), lease_token='crashed' WHERE id=$1", [active.id]);
    expect(await worker().runOnce()).toBe(0);
    const exhausted = (await events()).find(e => e.id === active.id);
    expect(exhausted.status).toBe('dead'); expect(exhausted.lease_token).toBeNull();
  });
});
