CREATE TABLE IF NOT EXISTS webhook_outbox (
  id CHAR(36) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  destination_url VARCHAR(2048) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','delivered','dead')),
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token CHAR(36) NULL,
  last_error VARCHAR(1000) NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_claim ON webhook_outbox(status, next_attempt_at, created_at);
