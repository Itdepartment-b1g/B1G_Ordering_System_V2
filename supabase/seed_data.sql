-- ============================================================================
-- SEED DATA FOR MULTI-TENANT B2B SYSTEM
-- Run this script in Supabase SQL Editor AFTER running create_companies_and_profiles_tables.sql
-- ============================================================================

-- Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- STEP 1: CREATE COMPANIES
-- ============================================================================

-- Insert B1G Corporation
INSERT INTO companies (
    company_name,
    company_email,
    super_admin_name,
    super_admin_email,
    role,
    status
) VALUES (
    'B1G Corporation',
    'info@b1gcorp.com',
    'B1G Super Admin',
    'superadmin@b1gcorp.com',
    'Super Admin',
    'active'
) ON CONFLICT DO NOTHING;

-- Insert Hermanos Vape
INSERT INTO companies (
    company_name,
    company_email,
    super_admin_name,
    super_admin_email,
    role,
    status
) VALUES (
    'Hermanos Vape',
    'info@hermanosvape.com',
    'Hermanos Super Admin',
    'superadmin@hermanosvape.com',
    'Super Admin',
    'active'
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- STEP 2: CREATE SUPER ADMIN AUTH USERS AND PROFILES FOR EACH COMPANY
-- ============================================================================

-- Create Super Admin for B1G Corporation
DO $$
DECLARE
    v_super_admin_id UUID;
    v_b1g_company_id UUID;
    v_instance_id UUID;
    v_encrypted_password TEXT;
BEGIN
    -- Get B1G Corporation company ID
    SELECT id INTO v_b1g_company_id
    FROM companies
    WHERE company_name = 'B1G Corporation';

    IF v_b1g_company_id IS NULL THEN
        RAISE EXCEPTION 'B1G Corporation not found.';
    END IF;

    -- Check if auth user already exists
    SELECT id INTO v_super_admin_id
    FROM auth.users
    WHERE email = 'superadmin@b1gcorp.com';

    -- If user doesn't exist, create it
    IF v_super_admin_id IS NULL THEN
        v_super_admin_id := uuid_generate_v4();
        
        SELECT id INTO v_instance_id
        FROM auth.instances
        LIMIT 1;
        
        IF v_instance_id IS NULL THEN
            v_instance_id := '00000000-0000-0000-0000-000000000000'::UUID;
        END IF;

        v_encrypted_password := crypt('tempPassword123!', gen_salt('bf'));

        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            is_super_admin, created_at, updated_at
        ) VALUES (
            v_instance_id, v_super_admin_id, 'authenticated', 'authenticated',
            'superadmin@b1gcorp.com', v_encrypted_password,
            NOW(), '{"provider":"email","providers":["email"]}', '{}',
            false, NOW(), NOW()
        );

        RAISE NOTICE 'B1G Corporation Super Admin auth user created with ID: %', v_super_admin_id;
    END IF;

    -- Create or update Super Admin profile
    INSERT INTO profiles (
        id, company_id, email, full_name, role, status
    ) VALUES (
        v_super_admin_id, v_b1g_company_id, 'superadmin@b1gcorp.com',
        'B1G Super Admin', 'super_admin', 'active'
    )
    ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        status = EXCLUDED.status;

    RAISE NOTICE 'B1G Corporation Super Admin profile created/updated';
END $$;

-- Create Super Admin for Hermanos Vape
DO $$
DECLARE
    v_super_admin_id UUID;
    v_hermanos_company_id UUID;
    v_instance_id UUID;
    v_encrypted_password TEXT;
BEGIN
    -- Get Hermanos Vape company ID
    SELECT id INTO v_hermanos_company_id
    FROM companies
    WHERE company_name = 'Hermanos Vape';

    IF v_hermanos_company_id IS NULL THEN
        RAISE EXCEPTION 'Hermanos Vape not found.';
    END IF;

    -- Check if auth user already exists
    SELECT id INTO v_super_admin_id
    FROM auth.users
    WHERE email = 'superadmin@hermanosvape.com';

    -- If user doesn't exist, create it
    IF v_super_admin_id IS NULL THEN
        v_super_admin_id := uuid_generate_v4();
        
        SELECT id INTO v_instance_id
        FROM auth.instances
        LIMIT 1;
        
        IF v_instance_id IS NULL THEN
            v_instance_id := '00000000-0000-0000-0000-000000000000'::UUID;
        END IF;

        v_encrypted_password := crypt('tempPassword123!', gen_salt('bf'));

        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
            is_super_admin, created_at, updated_at
        ) VALUES (
            v_instance_id, v_super_admin_id, 'authenticated', 'authenticated',
            'superadmin@hermanosvape.com', v_encrypted_password,
            NOW(), '{"provider":"email","providers":["email"]}', '{}',
            false, NOW(), NOW()
        );

        RAISE NOTICE 'Hermanos Vape Super Admin auth user created with ID: %', v_super_admin_id;
    END IF;

    -- Create or update Super Admin profile
    INSERT INTO profiles (
        id, company_id, email, full_name, role, status
    ) VALUES (
        v_super_admin_id, v_hermanos_company_id, 'superadmin@hermanosvape.com',
        'Hermanos Super Admin', 'super_admin', 'active'
    )
    ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        status = EXCLUDED.status;

    RAISE NOTICE 'Hermanos Vape Super Admin profile created/updated';
END $$;

-- ============================================================================
-- STEP 3: CREATE SYSTEM ADMINISTRATOR AUTH USER AND PROFILE
-- ============================================================================

DO $$
DECLARE
    v_system_admin_id UUID;
    v_b1g_company_id UUID;
    v_instance_id UUID;
    v_encrypted_password TEXT;
BEGIN
    -- Get B1G Corporation company ID
    SELECT id INTO v_b1g_company_id
    FROM companies
    WHERE company_name = 'B1G Corporation';

    IF v_b1g_company_id IS NULL THEN
        RAISE EXCEPTION 'B1G Corporation not found. Please run the companies insert statements first.';
    END IF;

    -- Check if auth user already exists
    SELECT id INTO v_system_admin_id
    FROM auth.users
    WHERE email = 'itdepartment.b1g@gmail.com';

    -- If user doesn't exist, create it
    IF v_system_admin_id IS NULL THEN
        -- Generate new UUID for the user
        v_system_admin_id := uuid_generate_v4();
        
        -- Get instance_id (usually the first one or a default)
        SELECT id INTO v_instance_id
        FROM auth.instances
        LIMIT 1;
        
        -- If no instance exists, use a default UUID (this should exist in Supabase)
        IF v_instance_id IS NULL THEN
            v_instance_id := '00000000-0000-0000-0000-000000000000'::UUID;
        END IF;

        -- Hash the password using bcrypt
        -- Password: tempPassword123!
        v_encrypted_password := crypt('tempPassword123!', gen_salt('bf'));

        -- Insert into auth.users
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            invited_at,
            confirmation_token,
            confirmation_sent_at,
            recovery_token,
            recovery_sent_at,
            email_change_token_new,
            email_change,
            email_change_sent_at,
            last_sign_in_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            created_at,
            updated_at,
            phone,
            phone_confirmed_at,
            phone_change,
            phone_change_token,
            phone_change_sent_at,
            email_change_token_current,
            email_change_confirm_status,
            banned_until,
            reauthentication_token,
            reauthentication_sent_at,
            is_sso_user,
            deleted_at
        ) VALUES (
            v_instance_id,
            v_system_admin_id,
            'authenticated',
            'authenticated',
            'itdepartment.b1g@gmail.com',
            v_encrypted_password,
            NOW(), -- Email confirmed immediately
            NULL,
            '',
            NULL,
            '',
            NULL,
            '',
            '',
            NULL,
            NULL,
            '{"provider":"email","providers":["email"]}',
            '{}',
            false,
            NOW(),
            NOW(),
            NULL,
            NULL,
            '',
            '',
            NULL,
            '',
            0,
            NULL,
            '',
            NULL,
            false,
            NULL
        );

        RAISE NOTICE 'System Administrator auth user created with ID: %', v_system_admin_id;
    ELSE
        RAISE NOTICE 'System Administrator auth user already exists with ID: %', v_system_admin_id;
    END IF;

    -- Create or update System Administrator profile
    INSERT INTO profiles (
        id,
        company_id,
        email,
        full_name,
        role,
        status
    ) VALUES (
        v_system_admin_id,
        v_b1g_company_id,
        'itdepartment.b1g@gmail.com',
        'It Department',
        'system_administrator',
        'active'
    )
    ON CONFLICT (id) DO UPDATE
    SET
        company_id = EXCLUDED.company_id,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        status = EXCLUDED.status;

    RAISE NOTICE 'System Administrator profile created/updated successfully for user: %', 'itdepartment.b1g@gmail.com';
    RAISE NOTICE 'Login credentials - Email: itdepartment.b1g@gmail.com, Password: tempPassword123!';
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify companies were created
SELECT 
    id,
    company_name,
    company_email,
    status,
    created_at
FROM companies
ORDER BY created_at;

-- Verify all profiles were created
SELECT 
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.status,
    c.company_name
FROM profiles p
JOIN companies c ON p.company_id = c.id
ORDER BY p.role, c.company_name;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- This script automatically creates the System Administrator auth user
-- If you encounter permission errors, you may need to:
-- 1. Run this as a superuser, OR
-- 2. Use Supabase Dashboard > Authentication > Users to create the user manually
--    Then comment out the auth.users INSERT section and uncomment the profile-only section
-- ============================================================================

