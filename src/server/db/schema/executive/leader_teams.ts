import { pgTable, uuid } from 'drizzle-orm/pg-core';

export const leaderTeams = pgTable('leader_teams', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull(),
  leaderId: uuid('leader_id').notNull(),
  agentId: uuid('agent_id').notNull(),
});
