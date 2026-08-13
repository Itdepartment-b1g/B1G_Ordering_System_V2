import { integer, numeric, pgTable, uuid } from 'drizzle-orm/pg-core';

export const clientOrderItems = pgTable('client_order_items', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull(),
  clientOrderId: uuid('client_order_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  quantity: integer('quantity').notNull(),
  totalPrice: numeric('total_price'),
});
