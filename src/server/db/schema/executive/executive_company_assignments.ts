import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

export const executiveCompanyAssignments = pgTable('executive_company_assignments', {
  id: uuid('id').primaryKey(),
  executiveId: uuid('executive_id').notNull(),
  companyId: uuid('company_id').notNull(),
  assignedBy: uuid('assigned_by'),
  createdAt: timestamp('created_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});
