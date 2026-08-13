import { integer, numeric, pgTable, uuid } from 'drizzle-orm/pg-core';

export const mainInventory = pgTable('main_inventory', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull(),
  variantId: uuid('variant_id').notNull(),
  stock: integer('stock'),
  allocatedStock: integer('allocated_stock'),
  unitPrice: numeric('unit_price'),
  sellingPrice: numeric('selling_price'),
  dspPrice: numeric('dsp_price'),
  rspPrice: numeric('rsp_price'),
  reorderLevel: integer('reorder_level'),
});
