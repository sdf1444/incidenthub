-- Add without rebuilding existing outbox data; safe to reapply on PostgreSQL.
-- Match ORDER BY independently of status to avoid unnecessary index rebuilds.
CREATE INDEX IF NOT EXISTS idx_outbox_due ON webhook_outbox(next_attempt_at, created_at);
