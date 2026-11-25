# IncidentHub — full-stack incident-management portfolio project

Personal project demonstrating a React/TypeScript frontend, NestJS/TypeScript REST API, **persistent PostgreSQL** storage, a signed outgoing webhook integration, Jest/Supertest tests, Docker Compose, and an **AWS ECS deployment template**.

## Local quick start

Requires Docker Compose. Copy `.env.example` to `.env` and set local-only passwords and optional webhook configuration. Then:

```bash
docker compose up --build
```

Open http://localhost:5173 (frontend), http://localhost:3001/api/health (API health), and http://localhost:3001/api/incidents (API).

PostgreSQL schema is created automatically from all three scripts in `database/init/` **only when the database volume is first initialized**. If upgrading an existing Compose volume, apply the schema manually or recreate the volume **only if you accept losing its data**. Never use `docker compose down -v` on valuable data.

For local development outside Docker, start PostgreSQL using `docker compose up -d db`, run `npm ci`, then `npm run dev` from the root. The API defaults to localhost DB credentials shown in `.env.example`/Compose; adjust DB environment variables as necessary. Start delivery separately with `npm run worker` after `npm run build`. These Node commands do not automatically load `.env`; export the required variables first. Compose reads `.env` for interpolation.

## API endpoints

- `GET /api/health` — checks DB connectivity (503 if unavailable)
- `GET /api/incidents`, `GET /api/incidents/:id`
- `POST /api/incidents` — validated incident creation
- `PATCH /api/incidents/:id` — validated updates
- `POST /api/incidents/:id/timeline` — append a timeline message
- `GET /api/dashboard/summary` — counts by incident state

Writes to incident rows and timeline rows are wrapped in PostgreSQL transactions. Incident updates lock the row with `SELECT ... FOR UPDATE`; this prevents concurrent updates from interleaving their timeline changes. The service does **not** enforce a legal status-transition graph or idempotency keys.

## Webhook integration

Set `INCIDENT_WEBHOOK_URL` to an operator-controlled HTTPS webhook receiver. On incident creation, update, or timeline append, the API durably queues a JSON payload with `id`, `type`, `occurredAt`, and `incident`. Set `INCIDENT_WEBHOOK_SECRET` to sign the exact JSON body with HMAC SHA-256 in the `x-incidenthub-signature` header (`sha256=<hex>`). Verify the signature on the receiving system before trusting payloads.

The API commits incident changes and the event atomically. A separate worker delivers the stored payload with a five-second request timeout. An enqueue failure rolls back the incident transaction; a later delivery failure leaves the incident committed and schedules a retry or retains a dead letter. See the outbox section below for delivery semantics.

## Testing

```bash
npm ci
npm test                    # controller, webhook and worker tests; PostgreSQL integration skipped
RUN_POSTGRES_TESTS=1 npm test  # isolated PostgreSQL test DB, all migrations, no running worker
npm run build
npm run test:process        # same isolated DB; starts compiled API + worker and failing receiver
```

GitHub Actions CI starts PostgreSQL, initializes schema, builds both applications and runs all tests. The workflow itself has not been executed on GitHub; local verification is recorded in `AUDIT_AND_VERIFICATION.md`. Integration tests use a local HTTP receiver and intentionally fail if the outbox is not empty; use an isolated test database.

## AWS

See `deploy/aws/README.md` for prerequisites and the ECS Fargate task definition template. `.github/workflows/deploy-api.yml` can build and deploy the API to a pre-existing AWS ECS service after configuration. **No AWS resources are created by this repository, and no deployment has been performed.**

## Scope and limitations

This is a personal portfolio project, not a production incident-response system. It does not currently provide authentication, authorization, tenant isolation, audit actor identities, a transition state machine, unlimited webhook retries, full frontend test coverage, or a production deployment. The frontend displays incident counts computed from its list, rather than consuming the dashboard summary endpoint.

## Durable transactional outbox (webhook integration)

When `INCIDENT_WEBHOOK_URL` is configured on the **API**, each incident mutation inserts an immutable event snapshot into `webhook_outbox` **in the same MySQL transaction** as the incident and timeline changes. A separate `outbox-worker` service claims due events with `FOR UPDATE SKIP LOCKED`, posts the original JSON, and records success. It retries timeouts, network errors, HTTP 408/425/429 and 5xx with exponential backoff (5-minute ceiling). With the eight-attempt limit, actual scheduled delays are 1, 2, 4, 8, 16, 32 and 64 seconds; permanent HTTP 4xx and exhausted attempts enter `dead`. Each worker claims one event immediately before sending, using a 60-second lease. Claims reserve an attempt inside the transaction, so a crashed worker's rows become eligible again until eight reservations have been used. An expired final lease enters `dead` with an unknown delivery outcome. Crashes can therefore consume attempts without completing HTTP requests. This is **at-least-once delivery**, not exactly-once: receivers must deduplicate using the stable `x-incidenthub-event-id` header. HMAC-SHA256 signs the original JSON body when `INCIDENT_WEBHOOK_SECRET` is set.

**Existing MySQL volume:** Docker's `/docker-entrypoint-initdb.d` runs only for a newly initialized database. Apply the additive migration before starting the upgraded API/worker:

```sh
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"' < database/init/002_outbox.sql
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"' < database/init/003_outbox_claim_index.sql
```

For a fresh database volume, all three SQL scripts run automatically. Do not delete existing volumes merely to apply the migration. `docker compose up --build` starts the API and worker. Set `INCIDENT_WEBHOOK_URL` in the API environment; the worker uses the destination stored with each event. If URL is empty, no events are enqueued. Inspect failures with `SELECT id,event_type,status,attempts,last_error FROM webhook_outbox ORDER BY created_at DESC;`. A dead-letter replay requires an explicit operator decision; after fixing the root cause, set `status='pending', attempts=0, next_attempt_at=NOW(3), lease_token=NULL` for a chosen ID.

**Limitations:** no hosted AWS deployment is claimed here. Local test results are in `AUDIT_AND_VERIFICATION.md`. Lease recovery can redeliver an event if a worker crashes after HTTP success but before recording success; consumers must be idempotent. There is no per-incident event-order guarantee. The 60s lease exceeds the 5s request timeout for ordinary operation, but a severely stalled process could still cause overlapping attempts. For production, restrict destination URLs to an administrator-approved allowlist and protect secrets/DB access.


The delivery contract permits duplicates and bounded retries; it does not guarantee eventual receipt by an unavailable receiver. Dead letters need operator review. Redirect responses are treated as permanent failures and are not followed. Events and destinations already queued are unchanged when the API URL configuration changes. The signing secret is read by the worker at delivery time, so coordinate secret rotation with the receiver.

Replay only a selected dead event after resolving the cause:

```sql
UPDATE webhook_outbox
SET status='pending', attempts=0, next_attempt_at=NOW(3), lease_token=NULL,
    delivered_at=NULL, last_error=NULL
WHERE id='REPLACE_WITH_EVENT_ID' AND status='dead';
```

For throughput, run multiple workers; each process sends one event per polling iteration. Delivered and dead records are retained indefinitely in this demo; establish an archival policy before sustained use. Protect the unauthenticated API behind a private network for demonstrations with nonpublic data.

The process smoke check reserves local API port 3101 and requires no other worker against its isolated database. It starts the compiled API and worker, returns HTTP 503 on the first webhook and HTTP 200 on the retry, verifies the stable ID/body and persisted delivery status, then removes its own test rows and stops both child processes.
