import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const hubs = pgTable('hubs', {
  id: uuid('id').primaryKey(),
  hubName: text('hub_name').notNull(),
  assignedTeamLeaderId: uuid('assigned_team_leader_id'),
});
