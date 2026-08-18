import pg from 'pg';
import { HttpError } from '../http/errors';

const { Pool } = pg;

const globalForPg = globalThis as unknown as {
  pgPool?: pg.Pool;
};

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DIRECT_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    ''
  );
}

export function hasDatabaseUrl() {
  return Boolean(getDatabaseUrl());
}

export function getPool(): pg.Pool {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new HttpError(
      500,
      'DATABASE_URL is not configured. Add the Supabase Postgres URI to .env (server-only, not VITE_) and restart the dev server.'
    );
  }

  if (!globalForPg.pgPool) {
    const isSupabase = /supabase\.(co|com)/i.test(connectionString);
    globalForPg.pgPool = new Pool({
      connectionString,
      max: 3,
      ssl: isSupabase ? { rejectUnauthorized: false } : undefined,
      options: '-c statement_timeout=60000',
    });
  }

  return globalForPg.pgPool;
}
