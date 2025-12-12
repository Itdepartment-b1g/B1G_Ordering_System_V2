-- ============================================================================
-- ENSURE create_user_profile FUNCTION EXISTS
-- Run this script if users are being created in auth but not in profiles
-- ============================================================================

-- Drop the function if it exists (to recreate with latest version)
DROP FUNCTION IF EXISTS public.create_user_profile(uuid, text, text, text, text, text, text, text, uuid);

-- Create a SECURITY DEFINER function to insert profiles (bypasses RLS)
CREATE OR REPLACE FUNCTION public.create_user_profile(
    p_user_id uuid,
    p_full_name text,
    p_email text,
    p_role text,
    p_phone text DEFAULT NULL,
    p_region text DEFAULT NULL,
    p_city text DEFAULT NULL,
    p_status text DEFAULT 'active',
    p_company_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        full_name,
        email,
        role,
        phone,
        region,
        city,
        status,
        company_id,
        created_at,
        updated_at
    ) VALUES (
        p_user_id,
        p_full_name,
        p_email,
        p_role::text,
        p_phone,
        p_region,
        p_city,
        p_status,
        p_company_id,
        now(),
        now()
    );
EXCEPTION
    WHEN unique_violation THEN
        -- Profile already exists, update it instead
        UPDATE public.profiles
        SET
            full_name = p_full_name,
            email = p_email,
            role = p_role::text,
            phone = p_phone,
            region = p_region,
            city = p_city,
            status = p_status,
            company_id = COALESCE(p_company_id, company_id),
            updated_at = now()
        WHERE id = p_user_id;
END;
$$;

-- Grant execute permission to service_role and authenticated users
GRANT EXECUTE ON FUNCTION public.create_user_profile TO service_role;
GRANT EXECUTE ON FUNCTION public.create_user_profile TO authenticated;

-- Verify the function was created
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'create_user_profile';

