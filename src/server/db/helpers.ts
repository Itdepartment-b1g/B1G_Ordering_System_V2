import { and, gte, lte, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

export function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toNumber(value: string | number | bigint | null | undefined): number {
  if (value == null) return 0;
  return Number(value) || 0;
}

export function dateRange(column: PgColumn, from?: string, to?: string): SQL[] {
  const parts: SQL[] = [];
  if (from) parts.push(gte(column, new Date(from)));
  if (to) parts.push(lte(column, new Date(to)));
  return parts;
}

export function andAll(...parts: Array<SQL | undefined>) {
  const defined = parts.filter(Boolean) as SQL[];
  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];
  return and(...defined);
}
