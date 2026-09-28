/// <reference types="jest" />

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';

describe('IncidentHub API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns incidents', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/incidents')
      .expect(200);

    expect(response.body.length).toBeGreaterThan(0);
  });

  it('creates and updates an incident', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/incidents')
      .send({
        title: 'Payments unavailable',
        description: 'Payment requests are failing',
        severity: 'critical',
        owner: 'Payments',
      })
      .expect(201);

    expect(created.body.status).toBe('open');

    const updated = await request(app.getHttpServer())
      .patch(`/api/incidents/${created.body.id}`)
      .send({ status: 'investigating' })
      .expect(200);

    expect(updated.body.status).toBe('investigating');
  });

  it('validates payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/incidents')
      .send({ title: '' })
      .expect(400);
  });
});
