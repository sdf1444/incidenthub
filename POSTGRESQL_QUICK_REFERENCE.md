# PostgreSQL Quick Reference for IncidentHub Development

## Connection Strings

```
Local development:    postgresql://incidenthub:incidenthub@localhost:5432/incidenthub
Docker Compose:       postgresql://incidenthub:incidenthub@db:5432/incidenthub
```

## Common PostgreSQL Commands

### Connect to database
```bash
psql postgresql://incidenthub:incidenthub@localhost:5432/incidenthub
```

### View schema
```sql
\d                  -- List all tables
\d+ table_name      -- Detailed table info
\di                 -- List indexes
\dv                 -- List views
```

### Database operations
```sql
CREATE DATABASE incidenthub;
DROP DATABASE incidenthub;
CREATE USER incidenthub WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE incidenthub TO incidenthub;
```

## SQL Syntax Differences

### Parameterized Queries
```typescript
// Position-based parameters (required in node-postgres)
db.query('SELECT * FROM incidents WHERE id = $1 AND status = $2', [id, status])

// NOT supported (use $1, $2, etc.)
db.query('SELECT * FROM incidents WHERE id = ? AND status = ?', [id, status])  // ❌ WRONG
```

### Arrays
```sql
-- MySQL
WHERE incident_id IN (?, ?, ?)

-- PostgreSQL
WHERE incident_id = ANY($1)        -- Pass array
-- Or
WHERE incident_id IN (UNNEST($1))  -- Alternative
```

### Timestamps
```sql
-- MySQL
NOW()           -- Returns DATETIME
CURRENT_TIMESTAMP(3)

-- PostgreSQL
NOW()           -- Returns TIMESTAMP WITH TIME ZONE
CURRENT_TIMESTAMP

-- Getting just the date
CURRENT_DATE
```

### Intervals and Date Math
```sql
-- MySQL
DATE_ADD(NOW(), INTERVAL 60 SECOND)
DATE_SUB(NOW(), INTERVAL 1 DAY)

-- PostgreSQL
NOW() + INTERVAL '60 seconds'
NOW() - INTERVAL '1 day'
NOW() + INTERVAL '1 hour 30 minutes'
```

### Type Casting
```sql
-- MySQL
CAST(payload AS CHAR)

-- PostgreSQL
payload::text
(payload::json)->>'key'      -- JSON arrow operators
(payload::jsonb)->>'key'     -- JSONB arrow operators
```

### Enums
```sql
-- MySQL
ENUM('low', 'medium', 'high', 'critical')

-- PostgreSQL
VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical'))
-- Or create a proper enum type
CREATE TYPE severity_enum AS ENUM ('low', 'medium', 'high', 'critical');
```

### UPSERT
```sql
-- MySQL
INSERT INTO table (id, name) VALUES (1, 'test')
ON DUPLICATE KEY UPDATE name='test';

-- PostgreSQL
INSERT INTO table (id, name) VALUES (1, 'test')
ON CONFLICT (id) DO UPDATE SET name='test';
```

## Code Examples

### Reading Query Results
```typescript
// MySQL (node-mysql2)
const [rows] = await pool.query(sql, params);

// PostgreSQL (node-postgres)
const result = await pool.query(sql, params);
const rows = result.rows;
```

### Transactions
```typescript
// PostgreSQL
await client.query('BEGIN');
try {
  await client.query('INSERT INTO incidents (...) VALUES (...)');
  await client.query('INSERT INTO incident_timeline (...) VALUES (...)');
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
}
```

### JSON Operations
```typescript
// JSONB queries
const result = await db.query(
  `SELECT payload FROM webhook_outbox 
   WHERE (payload->>'incident'::text)->>'id'::text = $1`,
  [incidentId]
);

// Parsing JSON
const payload = JSON.parse(result.rows[0].payload);
```

## Performance Tips

1. **Use JSONB instead of JSON** - Better performance with indexing
   ```sql
   ALTER TABLE webhook_outbox ALTER COLUMN payload TYPE jsonb USING payload::jsonb;
   CREATE INDEX idx_payload_id ON webhook_outbox USING gin ((payload->>'incident'));
   ```

2. **Index frequently queried columns**
   ```sql
   CREATE INDEX idx_incidents_status ON incidents(status);
   CREATE INDEX idx_outbox_status_time ON webhook_outbox(status, next_attempt_at);
   ```

3. **Use EXPLAIN to analyze queries**
   ```sql
   EXPLAIN ANALYZE SELECT * FROM incidents WHERE status = 'open';
   ```

4. **Connection pooling** - The `pg` library with options
   ```typescript
   new Pool({
     max: 10,              // Max connections
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   })
   ```

## Debugging

### View active connections
```sql
SELECT * FROM pg_stat_activity;
```

### Kill a connection
```sql
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid();
```

### View query locks
```sql
SELECT * FROM pg_locks;
```

### Check table sizes
```sql
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
WHERE schemaname='public';
```

## Common Issues

### "FATAL: role 'postgres' does not exist"
```bash
# Fix: Connect to correct user
psql -U incidenthub -d incidenthub
```

### "Error: connect ECONNREFUSED 127.0.0.1:5432"
```bash
# PostgreSQL is not running
docker-compose up -d db
# Wait for healthcheck to pass
docker-compose ps
```

### "ERROR: relation 'incidents' does not exist"
```bash
# Apply schema
docker-compose exec db psql -U incidenthub -d incidenthub < database/init/001_schema.sql
```

### Parameter index out of range
```typescript
// Error: bind message supplies 2 parameters, but prepared statement "stmt" requires 3
// Check that you have $1, $2, $3 and three parameters
db.query('SELECT * FROM table WHERE a=$1 AND b=$2 AND c=$3', [val1, val2, val3])
```

## Resources

- **PostgreSQL Docs**: https://www.postgresql.org/docs/current/
- **node-postgres**: https://node-postgres.com/
- **psql Reference**: https://www.postgresql.org/docs/current/app-psql.html
- **TypeScript Types**: https://www.npmjs.com/package/@types/pg
