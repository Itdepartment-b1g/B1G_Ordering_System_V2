-- Allow executives to read leader_teams for their assigned companies
-- (required for team-total inventory on the executive dashboard)

DROP POLICY IF EXISTS "Executives can view leader_teams from assigned companies" ON leader_teams;
CREATE POLICY "Executives can view leader_teams from assigned companies"
    ON leader_teams FOR SELECT
    USING (
        is_executive()
        AND company_id = ANY(get_my_executive_company_ids())
    );
