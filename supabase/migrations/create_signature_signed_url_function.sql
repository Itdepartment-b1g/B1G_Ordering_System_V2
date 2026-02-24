-- Create function to generate signed URLs for remittance signatures
-- This allows managers to view their team's signatures securely

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_remittance_signature_url(uuid);

-- Create function to generate signed URL for a remittance signature
CREATE OR REPLACE FUNCTION get_remittance_signature_url(remittance_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    signature_path text;
    signed_url text;
    user_role text;
    user_id uuid;
    is_authorized boolean := false;
    remittance_record record;
BEGIN
    -- Get current user info
    user_id := auth.uid();
    SELECT role INTO user_role FROM profiles WHERE id = user_id;

    -- Get remittance details
    SELECT * INTO remittance_record 
    FROM remittances_log 
    WHERE id = remittance_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Authorization logic
    IF user_role = 'super_admin' OR user_role = 'admin' THEN
        -- Admins can view all signatures
        is_authorized := true;
    ELSIF user_role = 'manager' THEN
        -- Managers can view signatures from their team hierarchy
        -- Check if the agent is in their direct or indirect team
        is_authorized := EXISTS (
            -- Direct reports
            SELECT 1 FROM leader_teams lt
            WHERE lt.leader_id = user_id 
            AND lt.agent_id = remittance_record.agent_id

            UNION

            -- Indirect reports (sub-team)
            SELECT 1 FROM leader_teams lt1
            INNER JOIN leader_teams lt2 ON lt2.leader_id = lt1.agent_id
            WHERE lt1.leader_id = user_id 
            AND lt2.agent_id = remittance_record.agent_id
        );
    ELSIF user_role = 'team_leader' THEN
        -- Team leaders can view signatures from their direct reports
        is_authorized := EXISTS (
            SELECT 1 FROM leader_teams lt
            WHERE lt.leader_id = user_id 
            AND lt.agent_id = remittance_record.agent_id
        );
    ELSIF user_role = 'mobile_sales' OR user_role = 'sales_agent' THEN
        -- Agents can only view their own signatures
        is_authorized := (remittance_record.agent_id = user_id);
    END IF;

    -- If not authorized, return NULL
    IF NOT is_authorized THEN
        RETURN NULL;
    END IF;

    -- Get signature path from remittance
    signature_path := remittance_record.signature_path;

    IF signature_path IS NULL THEN
        RETURN NULL;
    END IF;

    -- Generate signed URL (valid for 1 hour)
    -- Note: This uses Supabase's storage.get_presigned_url which is available in newer versions
    -- If not available, you'll need to use the client-side approach
    SELECT storage.presigned_url('remittance-signatures', signature_path, 3600)
    INTO signed_url;

    RETURN signed_url;
EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'Error generating signed URL: %', SQLERRM;
        RETURN NULL;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_remittance_signature_url(uuid) TO authenticated;

-- Add comment
COMMENT ON FUNCTION get_remittance_signature_url IS 'Generates a signed URL for viewing remittance signatures with proper authorization checks';
