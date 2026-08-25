import { numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const clientOrders = pgTable('client_orders', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull(),
  orderNumber: text('order_number').notNull(),
  agentId: uuid('agent_id').notNull(),
  clientId: uuid('client_id').notNull(),
  totalAmount: numeric('total_amount'),
  status: text('status'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
