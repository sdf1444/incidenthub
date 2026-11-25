/// <reference types="jest" />
import { OutboxWorker, retryDelayMs, MAX_ATTEMPTS } from '../src/integrations/outbox.worker';
import { WebhookDeliveryError } from '../src/integrations/webhook.service';

describe('outbox worker', () => {
  const row = { id: 'e1', destination_url: 'https://example.test', payload: '{"id":"e1"}', attempts: 1 };
  const make = (deliver: jest.Mock) => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const worker = new OutboxWorker(db as any, { deliver } as any);
    jest.spyOn(worker, 'claim').mockResolvedValue({ rows: [row] as any, token: 'lease' });
    return { worker, db };
  };
  it('marks delivered after successful HTTP response', async () => {
    const { worker, db } = make(jest.fn().mockResolvedValue(undefined));
    expect(await worker.runOnce()).toBe(1);
    expect(db.query.mock.calls[0][1]).toEqual([1, 'e1', 'lease']);
    expect(db.query.mock.calls[0][0]).toContain("status='delivered'");
  });
  it('requeues retryable failures with exponential backoff', async () => {
    const { worker, db } = make(jest.fn().mockRejectedValue(new WebhookDeliveryError('HTTP 503', true)));
    await worker.runOnce();
    expect(db.query.mock.calls[0][1][0]).toBe('pending');
    expect(db.query.mock.calls[0][1][3]).toBe(1000000);
  });
  it('dead-letters permanent errors', async () => {
    const { worker, db } = make(jest.fn().mockRejectedValue(new WebhookDeliveryError('HTTP 400', false)));
    await worker.runOnce();
    expect(db.query.mock.calls[0][1][0]).toBe('dead');
  });
  it('dead-letters the final retryable attempt', async () => {
    const { worker, db } = make(jest.fn().mockRejectedValue(new WebhookDeliveryError('HTTP 503', true)));
    jest.mocked(worker.claim).mockResolvedValue({ rows: [{ ...row, attempts: 8 }] as any, token: 'lease' });
    await worker.runOnce();
    expect(db.query.mock.calls[0][1][0]).toBe('dead');
  });
  it('caps retries', () => {
    expect(retryDelayMs(1)).toBe(1000);
    expect(retryDelayMs(10)).toBe(300000);
    expect(MAX_ATTEMPTS).toBe(8);
  });
});
