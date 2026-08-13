import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id'),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role').notNull(),
  status: text('status'),
});
