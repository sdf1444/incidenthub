# Migration from MySQL to PostgreSQL

This document outlines the changes made to migrate the IncidentHub application from MySQL 8.0 to PostgreSQL 17.

## Overview
The application has been successfully migrated to use PostgreSQL as the primary database. All MySQL-specific code and configurations have been updated to PostgreSQL equivalents.

## Changed Files

### 1. Docker Configuration
**File**: `docker-compose.yml`
- Replaced MySQL 8.0 image with PostgreSQL 17
- Updated database environment variables:
  - `MYSQL_DATABASE` → `POSTGRES_DB`
  - `MYSQL_USER` → `POSTGRES_USER`
  - `MYSQL_PASSWORD` → `POSTGRES_PASSWORD`
  - Removed `MYSQL_ROOT_PASSWORD` (not needed for PostgreSQL)
- Updated port from 3306 to 5432
- Changed volume name from `mysql_data` to `postgres_data`
- Updated healthcheck command from `mysqladmin ping` to `pg_isready`
- Updated all service DB_PORT environment variables from 3306 to 5432

### 2. Dependencies
**File**: `apps/api/package.json`
- Removed: `mysql2@^3.12.0`
- Added: `pg@^8.11.3`

### 3. Database Service
**File**: `apps/api/src/database/database.service.ts`
- Replaced MySQL connection pool (`mysql2/promise`) with PostgreSQL pool (`pg`)
- Updated connection configuration:
  - Removed MySQL-specific options (timezone, decimalNumbers, etc.)
  - Added PostgreSQL pool options (max connection limit)
- Changed query return type handling:
  - MySQL: `[rows]` destructuring pattern
  - PostgreSQL: `.rows` property access
- Updated type imports from `RowDataPacket` to `Record<string, unknown>`
- Changed transaction method signatures:
  - MySQL: `PoolConnection.beginTransaction()`, `commit()`, `rollback()`
  - PostgreSQL: `PoolClient.query('BEGIN')`, `COMMIT`, `ROLLBACK`

### 4. Incidents Service
**File**: `apps/api/src/incidents/incidents.service.ts`
- Removed imports: `RowDataPacket` from mysql2, `PoolConnection` from mysql2/promise
- Updated to use PostgreSQL's `PoolClient` type
- Changed SQL parameter placeholders from `?` to `$1`, `$2`, etc.
- Updated query methods:
  - MySQL: `.execute()` and `.query()` with different return patterns
  - PostgreSQL: `.query()` with `.rows` property access
- Updated array queries:
  - MySQL: `IN (?, ?, ...)` with separate parameters
  - PostgreSQL: `= ANY($1)` with array parameter
- Updated timestamp function: `CURRENT_TIMESTAMP(3)` → `CURRENT_TIMESTAMP`
- Fixed dynamic SQL generation for PostgreSQL parameter numbering

### 5. Outbox Service
**File**: `apps/api/src/integrations/outbox.service.ts`
- Changed connection type from `PoolConnection` to `PoolClient`
- Updated SQL parameter placeholders from `?` to `$1`, `$2`, `$3`, `$4`
- Changed method call from `.execute()` to `.query()`
- Updated timestamp function: `CURRENT_TIMESTAMP(3)` → `CURRENT_TIMESTAMP`

### 6. Outbox Worker
**File**: `apps/api/src/integrations/outbox.worker.ts`
- Removed MySQL import: `RowDataPacket`
- Removed index hint: `FORCE INDEX (idx_outbox_due)` (PostgreSQL doesn't require this)
- Changed transaction handling from MySQL patterns to PostgreSQL patterns
- Updated SQL parameter placeholders from `?` to `$1`, `$2`, etc.
- Updated method calls from `.execute()` to `.query()`
- Updated date functions:
  - `DATE_ADD(NOW(3), INTERVAL 60 SECOND)` → `NOW() + INTERVAL '60 seconds'`
  - `DATE_SUB(NOW(3), INTERVAL 1 SECOND)` → `NOW() - INTERVAL '1 second'`
- Updated timestamp function: `NOW(3)` → `NOW()`
- Fixed interval math for retry delay: `DATE_ADD(NOW(3), INTERVAL ? MICROSECOND)` → `NOW() + ($4::text || ' milliseconds')::interval`

### 7. Database Schema
**File**: `database/init/001_schema.sql`
- Replaced MySQL ENUM types with VARCHAR with CHECK constraints
- Changed timestamp precision:
  - `DATETIME(3)` → `TIMESTAMP WITH TIME ZONE`
- Updated timestamp defaults:
  - `CURRENT_TIMESTAMP(3)` → `CURRENT_TIMESTAMP`
- Removed `ON UPDATE CURRENT_TIMESTAMP(3)` (MySQL-specific)
- Changed index syntax from MySQL inline to PostgreSQL separate CREATE INDEX
- Updated SQL formatting for PostgreSQL compatibility

### 8. Outbox Schema
**File**: `database/init/002_outbox.sql`
- Replaced ENUM types with VARCHAR with CHECK constraints
- Changed JSON type to JSONB (better performance in PostgreSQL)
- Removed `INT UNSIGNED` → changed to `INT`
- Changed timestamp precision: `DATETIME(3)` → `TIMESTAMP WITH TIME ZONE`
- Updated timestamp defaults: `CURRENT_TIMESTAMP(3)` → `CURRENT_TIMESTAMP`
- Changed index syntax to PostgreSQL format

### 9. Outbox Index
**File**: `database/init/003_outbox_claim_index.sql`
- Completely rewritten from MySQL prepared statement pattern to PostgreSQL
- Changed from dynamic index creation using IF statements to simple `CREATE INDEX IF NOT EXISTS`
- Simplified from 11 lines of complex MySQL logic to 3 lines of clear PostgreSQL SQL

### 10. Integration Tests
**File**: `apps/api/test/mysql.integration.spec.ts`
- Updated test environment variable: `RUN_MYSQL_TESTS` → `RUN_POSTGRES_TESTS`
- Updated test suite name: "MySQL 8 outbox integration" → "PostgreSQL outbox integration"
- Updated JSON query pattern:
  - `JSON_UNQUOTE(JSON_EXTRACT(payload, '$.incident.id'))` → `(payload->>'incident'::text)->>'id'::text`
- Updated SQL parameter placeholders from `?` to `$1`, `$2`, etc.
- Updated date functions to PostgreSQL equivalents
- Updated timestamp queries: `NOW(3)` → `NOW()`
- Updated interval syntax to PostgreSQL format

## SQL Migration Guide

### Key SQL Syntax Changes

| MySQL | PostgreSQL |
|-------|-----------|
| `ENUM('value1', 'value2')` | `VARCHAR CHECK (column IN ('value1', 'value2'))` |
| `DATETIME(3)` | `TIMESTAMP WITH TIME ZONE` |
| `CURRENT_TIMESTAMP(3)` | `CURRENT_TIMESTAMP` |
| `DATE_ADD(date, INTERVAL n SECOND)` | `date + INTERVAL 'n seconds'` |
| `DATE_SUB(date, INTERVAL n SECOND)` | `date - INTERVAL 'n seconds'` |
| `JSON` | `JSONB` (recommended for better performance) |
| `INT UNSIGNED` | `INT` or `BIGINT` |
| `INDEX idx_name (col1, col2)` | `CREATE INDEX idx_name ON table(col1, col2)` |
| `FORCE INDEX (idx_name)` | Not needed; PostgreSQL query planner handles it |
| `JSON_EXTRACT(col, '$.key')` | `col->'key'` or `col->>'key'` |
| `CAST(col AS CHAR)` | `col::text` |
| `?` parameter placeholder | `$1`, `$2`, etc. |

### Parameter Binding Changes

**MySQL**: 
```typescript
db.query("SELECT * FROM table WHERE id = ? AND status = ?", [id, status])
```

**PostgreSQL**:
```typescript
db.query("SELECT * FROM table WHERE id = $1 AND status = $2", [id, status])
```

### Connection Pool Differences

**MySQL**:
```typescript
const [rows] = await pool.query(sql, params);
```

**PostgreSQL**:
```typescript
const result = await pool.query(sql, params);
const rows = result.rows;
```

## Running the Application

### With Docker Compose
```bash
npm install
docker-compose up --build
```

The application will now use PostgreSQL instead of MySQL.

### Running Integration Tests
To run the PostgreSQL integration tests:
```bash
RUN_POSTGRES_TESTS=1 npm test -- mysql.integration.spec.ts
```

## Verification Checklist

- [x] Docker Compose uses PostgreSQL 17
- [x] All environment variables updated for PostgreSQL
- [x] Database schema compatible with PostgreSQL
- [x] All SQL queries use PostgreSQL syntax
- [x] Parameter placeholders updated ($1, $2, etc.)
- [x] Dependencies updated (pg instead of mysql2)
- [x] Transaction handling compatible with PostgreSQL
- [x] Index creation using PostgreSQL syntax
- [x] Integration tests updated for PostgreSQL
- [x] Timestamp and date functions updated
- [x] JSON handling updated to JSONB

## Performance Considerations

1. **JSONB vs JSON**: PostgreSQL JSONB provides better performance with indexing capabilities
2. **Interval syntax**: PostgreSQL's interval syntax is more flexible but requires proper formatting
3. **Index hints**: PostgreSQL's query planner is very efficient; FORCE INDEX hints are not needed
4. **Connection pooling**: The `pg` library's connection pool works similarly to mysql2

## Rollback Instructions

If you need to roll back to MySQL, reverse the changes in this document and restore from the git history before this migration.

## Support

For issues related to this migration, check the PostgreSQL and node-postgres documentation:
- https://www.postgresql.org/docs/
- https://node-postgres.com/
