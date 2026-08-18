import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const clients = pgTable('clients', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull(),
  agentId: uuid('agent_id').notNull(),
  name: text('name').notNull(),
  status: text('status'),
});
