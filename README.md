# IncidentHub

A full-stack incident-management portfolio application. It is intentionally domain-neutral: the project demonstrates engineering skills without mirroring a particular employer's business.

## Stack
- **Backend: 100% NestJS + TypeScript** — Nest controllers, modules, injectable services, DTO validation and global pipes. No Express application code or Express router layer.
- React 19 + TypeScript + Vite
- Jest + Nest testing utilities + Supertest
- Docker / Docker Compose
- In-memory persistence for a zero-setup demo

> Nest's default HTTP platform runs on Express internally via `@nestjs/platform-express`; application/backend code is entirely NestJS. If by “100% NestJS” you mean no Express dependency at all, use Nest's Fastify adapter instead.

## Features
- Report incidents with server-side validation
- Severity, status and ownership
- Controlled status updates
- Automatic audit/timeline entries on state changes
- Add manual timeline events through the API
- Dashboard summary endpoint
- Responsive React operations dashboard
- Health endpoint
- API integration tests

## API
- `GET /api/health`
- `GET /api/incidents`
- `GET /api/incidents/:id`
- `POST /api/incidents`
- `PATCH /api/incidents/:id`
- `POST /api/incidents/:id/timeline`
- `GET /api/dashboard/summary`

## Run locally
Requires Node 22+.

```bash
npm install
npm run dev
```

Frontend: http://localhost:5173
API: http://localhost:3001/api

## Test and build
```bash
npm test
npm run build
```

## Docker
```bash
docker compose up --build
```

## Sensible next steps
The in-memory repository is deliberate so the project runs without infrastructure. A production evolution would add PostgreSQL with Prisma/TypeORM, authentication and RBAC, optimistic concurrency, pagination/filtering, OpenAPI, structured logging/metrics, and AWS deployment.

## Interview explanation
A useful design point is that status changes go through the NestJS service rather than being treated as arbitrary frontend state. This keeps incident lifecycle behaviour and audit events in one backend boundary. The React client is therefore a consumer of the domain API rather than the owner of business rules.
