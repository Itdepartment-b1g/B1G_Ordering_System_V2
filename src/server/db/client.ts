import { drizzle } from 'drizzle-orm/node-postgres';
import { getPool } from './pool';
import * as schema from './schema/executive';

const globalForDrizzle = globalThis as unknown as {
  drizzleDb?: ReturnType<typeof drizzle<typeof schema>>;
};

export function getDb() {
  if (!globalForDrizzle.drizzleDb) {
    globalForDrizzle.drizzleDb = drizzle(getPool(), { schema });
  }
  return globalForDrizzle.drizzleDb;
}
