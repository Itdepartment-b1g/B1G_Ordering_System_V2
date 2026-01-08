-- ============================================================================
-- CREATE SUB TEAMS VIEW (VISIBLE IN DASHBOARD)
-- ============================================================================
-- Since "Computed Columns" are invisible in the Table Editor, we create a VIEW 
-- to allow you to easily browse sub-teams with their members.
-- ============================================================================

CREATE OR REPLACE VIEW sub_teams_overview AS
SELECT 
    st.id,
    st.name AS team_name,
    st.leader_id,
    l.full_name AS leader_name,
    st.manager_id,
    m.full_name AS manager_name,
    st.company_id,
    -- Use the computed functions we created (or inline logic)
    mobile_sales_ids(st) AS member_ids,
    mobile_sales_members(st) AS members_details,
    st.created_at,
    st.updated_at
FROM sub_teams st
LEFT JOIN profiles l ON st.leader_id = l.id
LEFT JOIN profiles m ON st.manager_id = m.id;

-- Grant permissions
GRANT SELECT ON sub_teams_overview TO authenticated;
GRANT SELECT ON sub_teams_overview TO service_role;

-- Usage:
-- You will see "sub_teams_overview" in your Supabase Table Editor sidebar.
