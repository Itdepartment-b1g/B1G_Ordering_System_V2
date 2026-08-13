import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: uuid('id').primaryKey(),
  companyName: text('company_name').notNull(),
  companyEmail: text('company_email').notNull(),
  superAdminName: text('super_admin_name').notNull(),
  superAdminEmail: text('super_admin_email').notNull(),
  role: text('role'),
  status: text('status'),
  companyAccountType: text('company_account_type'),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});
