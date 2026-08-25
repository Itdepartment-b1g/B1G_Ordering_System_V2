import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { pgTable, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { getDb } from '../../db/client';
import { hasDatabaseUrl } from '../../db/pool';
import { getSupabaseAdmin } from '../../db/supabaseAdmin';
import { toNumber } from '../../db/helpers';
import { clientOrders } from '../../db/schema/executive';

const kaProfiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id'),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  region: text('region'),
  city: text('city'),
  role: text('role').notNull(),
  status: text('status'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});

const KA_ROLE_WHITELIST = [
  'sales_head',
  'sales_admin',
  'sales_director',
  'key_account_manager',
  'key_account_accounting',
] as const;

export type KAUserDto = {
  id: string;
  name: string;
  email: string;
  phone: string;
  region: string;
  cities: string[];
  status: 'active' | 'inactive';
  role: string;
  totalSales: number;
  ordersCount: number;
};

export type KAUsersResult = {
  users: KAUserDto[];
};

function parseCities(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return String(raw)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

async function listUsersSupabase(userId: string, companyId: string): Promise<KAUsersResult> {
  const sb = getSupabaseAdmin();

  const [profilesResult, ordersResult] = await Promise.all([
    sb
      .from('profiles')
      .select('id, full_name, email, phone, region, city, status, role')
      .eq('company_id', companyId)
      .neq('id', userId)
      .neq('role', 'warehouse')
      .order('created_at', { ascending: false }),
    sb
      .from('client_orders')
      .select('agent_id, total_amount')
      .eq('company_id', companyId)
      .eq('status', 'approved'),
  ]);

  if (profilesResult.error) throw profilesResult.error;

  const salesByAgent: Record<string, { totalSales: number; ordersCount: number }> = {};
  for (const order of ordersResult.data || []) {
    if (!order.agent_id) continue;
    if (!salesByAgent[order.agent_id]) salesByAgent[order.agent_id] = { totalSales: 0, ordersCount: 0 };
    salesByAgent[order.agent_id].totalSales += toNumber(order.total_amount);
    salesByAgent[order.agent_id].ordersCount += 1;
  }

  const users: KAUserDto[] = (profilesResult.data || [])
    .filter((p: any) => p.role && (KA_ROLE_WHITELIST as readonly string[]).includes(p.role))
    .map((p: any) => ({
      id: p.id,
      name: p.full_name || '',
      email: p.email || '',
      phone: p.phone || '',
      region: p.region || '',
      cities: parseCities(p.city),
      status: (p.status || 'active') as 'active' | 'inactive',
      role: p.role,
      totalSales: salesByAgent[p.id]?.totalSales || 0,
      ordersCount: salesByAgent[p.id]?.ordersCount || 0,
    }));

  return { users };
}

async function listUsersDrizzle(userId: string, companyId: string): Promise<KAUsersResult> {
  const db = getDb();

  const [profileRows, orderRows] = await Promise.all([
    db
      .select({
        id: kaProfiles.id,
        fullName: kaProfiles.fullName,
        email: kaProfiles.email,
        phone: kaProfiles.phone,
        region: kaProfiles.region,
        city: kaProfiles.city,
        status: kaProfiles.status,
        role: kaProfiles.role,
      })
      .from(kaProfiles)
      .where(
        and(
          eq(kaProfiles.companyId, companyId),
          ne(kaProfiles.id, userId),
          ne(kaProfiles.role, 'warehouse'),
          inArray(kaProfiles.role, [...KA_ROLE_WHITELIST])
        )
      )
      .orderBy(desc(kaProfiles.createdAt)),
    db
      .select({
        agentId: clientOrders.agentId,
        totalSales: sql<string>`coalesce(sum(${clientOrders.totalAmount}), 0)`,
        ordersCount: count(),
      })
      .from(clientOrders)
      .where(and(eq(clientOrders.companyId, companyId), eq(clientOrders.status, 'approved')))
      .groupBy(clientOrders.agentId),
  ]);

  const salesByAgent = new Map(
    orderRows.map((r) => [r.agentId, { totalSales: toNumber(r.totalSales), ordersCount: toNumber(r.ordersCount) }])
  );

  const users: KAUserDto[] = profileRows.map((p) => ({
    id: p.id,
    name: p.fullName || '',
    email: p.email || '',
    phone: p.phone || '',
    region: p.region || '',
    cities: parseCities(p.city),
    status: (p.status || 'active') as 'active' | 'inactive',
    role: p.role,
    totalSales: salesByAgent.get(p.id)?.totalSales || 0,
    ordersCount: salesByAgent.get(p.id)?.ordersCount || 0,
  }));

  return { users };
}

export async function listKAUsers(userId: string, companyId: string): Promise<KAUsersResult> {
  if (!hasDatabaseUrl()) return listUsersSupabase(userId, companyId);
  return listUsersDrizzle(userId, companyId);
}
