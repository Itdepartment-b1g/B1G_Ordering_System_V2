import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const variants = pgTable('variants', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull(),
  brandId: uuid('brand_id'),
  name: text('name').notNull(),
  variantType: text('variant_type').notNull(),
  isActive: boolean('is_active'),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
