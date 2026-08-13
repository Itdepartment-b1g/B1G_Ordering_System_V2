import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const brands = pgTable('brands', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull(),
  name: text('name').notNull(),
  isActive: boolean('is_active'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
