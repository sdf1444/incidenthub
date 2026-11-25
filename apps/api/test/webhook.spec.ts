/// <reference types="jest" />
import { createHmac } from 'crypto';
import { WebhookDeliveryError, WebhookService } from '../src/integrations/webhook.service';

describe('Webhook delivery', () => {
  const oldSecret = process.env.INCIDENT_WEBHOOK_SECRET;
  afterEach(() => {
    if (oldSecret === undefined) delete process.env.INCIDENT_WEBHOOK_SECRET;
    else process.env.INCIDENT_WEBHOOK_SECRET = oldSecret;
    jest.restoreAllMocks();
  });
  it('signs stable event payload and sends idempotency identifier', async () => {
    process.env.INCIDENT_WEBHOOK_SECRET = 'test-secret';
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
    const body = JSON.stringify({ id: 'event-1', type: 'incident.created' });
    await new WebhookService().deliver('https://example.test/webhook', body);
    const [, options] = fetchMock.mock.calls[0];
    const headers = options?.headers as Record<string,string>;
    expect(headers['x-incidenthub-event-id']).toBe('event-1');
    expect(headers['x-incidenthub-signature']).toBe('sha256=' + createHmac('sha256', 'test-secret').update(body).digest('hex'));
  });
  it('does not follow redirects and releases response bodies', async () => {
    const cancel = jest.fn().mockResolvedValue(undefined);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 302, body: { cancel } } as unknown as Response);
    await expect(new WebhookService().deliver('https://example.test', '{"id":"x"}')).rejects.toMatchObject({ retryable: false });
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual');
    expect(cancel).toHaveBeenCalled();
  });
  it('classifies transport failures as retryable', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Connection refused'));
    await expect(new WebhookService().deliver('https://example.test', '{"id":"x"}')).rejects.toMatchObject({ retryable: true });
  });
  it('retries 5xx but dead-letters permanent 4xx', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 } as Response);
    await expect(new WebhookService().deliver('https://example.test', '{"id":"x"}')).rejects.toMatchObject({ retryable: true });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 } as Response);
    await expect(new WebhookService().deliver('https://example.test', '{"id":"x"}')).rejects.toMatchObject({ retryable: false });
  });
});
