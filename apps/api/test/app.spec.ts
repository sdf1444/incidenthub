/// <reference types="jest" />
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { IncidentsService } from '../src/incidents/incidents.service';
import { DatabaseService } from '../src/database/database.service';
import { OutboxService } from '../src/integrations/outbox.service';
import { randomUUID } from 'crypto';

class FakeIncidents {
  items: any[] = [];
  async findAll() { return this.items; }
  async findOne(id: string) { return this.items.find((item) => item.id === id); }
  async create(dto: any) {
    const now = new Date().toISOString();
    const item = { id: randomUUID(), ...dto, status: 'open', createdAt: now, updatedAt: now, timeline: [] };
    this.items.push(item); return item;
  }
  async update(id: string, dto: any) { const item = await this.findOne(id); Object.assign(item, dto); return item; }
  async addEvent(id: string, dto: any) { const item = await this.findOne(id); item.timeline.push(dto); return item; }
}

describe('IncidentHub API controller contracts', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IncidentsService).useValue(new FakeIncidents())
      .overrideProvider(DatabaseService).useValue({ ping: async () => undefined })
      .overrideProvider(OutboxService).useValue({ enqueue: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  it('health is available', async () => { await request(app.getHttpServer()).get('/api/health').expect(200); });
  it('creates, lists and updates an incident', async () => {
    const created = await request(app.getHttpServer()).post('/api/incidents')
      .send({ title: 'Payments unavailable', description: 'Payment requests failing', severity: 'critical', owner: 'Payments' }).expect(201);
    expect(created.body.status).toBe('open');
    const list = await request(app.getHttpServer()).get('/api/incidents').expect(200);
    expect(list.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: created.body.id })]));
    const updated = await request(app.getHttpServer()).patch(`/api/incidents/${created.body.id}`)
      .send({ status: 'investigating' }).expect(200);
    expect(updated.body.status).toBe('investigating');
  });
  it('rejects null updates and oversized owners before they reach SQL', async () => {
    await request(app.getHttpServer()).patch('/api/incidents/test').send({ status: null }).expect(400);
    await request(app.getHttpServer()).patch('/api/incidents/test').send({ owner: 'x'.repeat(256) }).expect(400);
  });
  it('rejects invalid payloads', async () => {
    await request(app.getHttpServer()).post('/api/incidents').send({ title: '' }).expect(400);
    await request(app.getHttpServer()).post('/api/incidents')
      .send({ title: 'Valid', description: 'Valid', severity: 'not-a-severity', owner: 'Team' }).expect(400);
  });
});
