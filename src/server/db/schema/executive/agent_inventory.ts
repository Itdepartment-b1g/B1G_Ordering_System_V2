import { integer, pgTable, uuid } from 'drizzle-orm/pg-core';

export const agentInventory = pgTable('agent_inventory', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull(),
  agentId: uuid('agent_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  stock: integer('stock'),
});
