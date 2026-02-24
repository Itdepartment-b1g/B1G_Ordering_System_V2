-- ============================================================================
-- SECURE FUNCTION TO UPDATE ONLY PRICING PERMISSIONS (V2 - Fixed)
-- ============================================================================
-- Super Admins and Admins can ONLY update the two pricing permission columns:
-- - team_leader_allowed_pricing
-- - mobile_sales_allowed_pricing
--
-- They CANNOT update any other company fields (name, status, etc.)
-- This function enforces this restriction at the database level.
-- ============================================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS update_company_pricing_permissions(JSONB, JSONB);

-- Create secure function to update ONLY pricing columns
CREATE OR REPLACE FUNCTION update_company_pricing_permissions(
    p_team_leader_pricing JSONB,
    p_mobile_sales_pricing JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated privileges
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_company_id UUID;
    v_user_role TEXT;
    v_updated_company RECORD;
BEGIN
    -- 1. Get current user ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'Unauthorized: No user session'
        );
    END IF;

    -- 2. Get user's company_id and role
    SELECT company_id, role 
    INTO v_company_id, v_user_role
    FROM profiles 
    WHERE id = v_user_id;

    IF v_company_id IS NULL THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'User does not belong to any company'
        );
    END IF;

    -- 3. Verify user is super_admin or admin
    IF v_user_role NOT IN ('super_admin', 'admin') THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'Unauthorized: Only Super Admin or Admin can update pricing permissions'
        );
    END IF;

    -- 4. Validate pricing columns (must be array of valid pricing types)
    IF NOT (
        jsonb_typeof(p_team_leader_pricing) = 'array' AND
        jsonb_typeof(p_mobile_sales_pricing) = 'array' AND
        jsonb_array_length(p_team_leader_pricing) > 0 AND
        jsonb_array_length(p_mobile_sales_pricing) > 0
    ) THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'Invalid pricing columns. Must be non-empty arrays.'
        );
    END IF;

    -- 5. Validate that arrays only contain valid pricing column names
    IF NOT (
        p_team_leader_pricing <@ '["selling_price", "dsp_price", "rsp_price"]'::jsonb AND
        p_mobile_sales_pricing <@ '["selling_price", "dsp_price", "rsp_price"]'::jsonb
    ) THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'Pricing columns must only contain: selling_price, dsp_price, or rsp_price'
        );
    END IF;

    -- 6. Update ONLY the two pricing columns for the user's company
    UPDATE companies
    SET 
        team_leader_allowed_pricing = p_team_leader_pricing,
        mobile_sales_allowed_pricing = p_mobile_sales_pricing,
        updated_at = NOW()
    WHERE id = v_company_id
    RETURNING * INTO v_updated_company;

    -- 7. Return success with updated data
    RETURN json_build_object(
        'success', true,
        'message', 'Pricing permissions updated successfully',
        'data', row_to_json(v_updated_company)
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false, 
            'message', 'Database error: ' || SQLERRM
        );
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION update_company_pricing_permissions IS 
'Securely updates ONLY the pricing permission columns for super_admin/admin. Cannot modify other company fields.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_company_pricing_permissions(JSONB, JSONB) TO authenticated;
