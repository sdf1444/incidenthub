import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';

export class WebhookDeliveryError extends Error {
  constructor(message: string, public readonly retryable: boolean) { super(message); }
}

@Injectable()
export class WebhookService {
  async deliver(url: string, payload: string): Promise<void> {
    const headers: Record<string,string> = {
      'content-type': 'application/json',
      'x-incidenthub-event-id': JSON.parse(payload).id,
    };
    if (process.env.INCIDENT_WEBHOOK_SECRET) {
      headers['x-incidenthub-signature'] = 'sha256=' + createHmac('sha256', process.env.INCIDENT_WEBHOOK_SECRET).update(payload).digest('hex');
    }
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers, body: payload, redirect: 'manual', signal: AbortSignal.timeout(5000) });
    } catch (error) {
      throw new WebhookDeliveryError(`Transport failure: ${error instanceof Error ? error.message : String(error)}`, true);
    }
    // Release response bodies so persistent workers do not exhaust HTTP connections.
    await response.body?.cancel();
    if (!response.ok) {
      const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      throw new WebhookDeliveryError(`HTTP ${response.status}`, retryable);
    }
  }
}
