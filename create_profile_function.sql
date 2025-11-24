-- Check for existing triggers on auth.users
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
AND event_object_table = 'users';

-- Check for existing profile creation function
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name LIKE '%profile%';

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
END;
$$;

-- Grant execute permission to service_role
GRANT EXECUTE ON FUNCTION public.create_user_profile TO service_role;
GRANT EXECUTE ON FUNCTION public.create_user_profile TO authenticated;
