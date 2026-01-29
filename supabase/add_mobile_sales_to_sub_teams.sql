-- ============================================================================
-- ADD MOBILE SALES DATA TO SUB TEAMS (COMPUTED COLUMNS)
-- ============================================================================
-- This script adds "Virtual Columns" to the sub_teams table.
-- You can select them just like real columns with Supabase:
-- .select('*, mobile_sales_ids(), mobile_sales_members()')
-- ============================================================================

-- 1. IDs Column (computed)
-- Returns: ['uuid-1', 'uuid-2']
DROP FUNCTION IF EXISTS mobile_sales_ids(sub_teams);
DROP FUNCTION IF EXISTS mobile_sales(sub_teams); -- Cleanup old name if it exists

CREATE OR REPLACE FUNCTION mobile_sales_ids(sub_team_row sub_teams)
RETURNS UUID[]
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    ARRAY_AGG(agent_id), 
    '{}'::UUID[]
  )
  FROM leader_teams
  WHERE sub_team_id = sub_team_row.id;
$$;

-- 2. Members Details Column (computed)
-- Returns: [{ "id": "...", "name": "John Doe", "region": "NCR" }]
DROP FUNCTION IF EXISTS mobile_sales_members(sub_teams);

CREATE OR REPLACE FUNCTION mobile_sales_members(sub_team_row sub_teams)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    JSONB_AGG(
      JSONB_BUILD_OBJECT(
        'id', p.id,
        'name', p.full_name,
        'email', p.email,
        'region', p.region,
        'avatar_url', p.avatar_url
      )
    ),
    '[]'::JSONB
  )
  FROM leader_teams lt
  JOIN profiles p ON lt.agent_id = p.id
  WHERE lt.sub_team_id = sub_team_row.id;
$$;

-- Grant access
GRANT EXECUTE ON FUNCTION mobile_sales_ids(sub_teams) TO authenticated;
GRANT EXECUTE ON FUNCTION mobile_sales_members(sub_teams) TO authenticated;
GRANT EXECUTE ON FUNCTION mobile_sales_ids(sub_teams) TO service_role;
GRANT EXECUTE ON FUNCTION mobile_sales_members(sub_teams) TO service_role;
