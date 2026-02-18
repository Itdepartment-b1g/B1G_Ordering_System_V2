-- ============================================================================
-- FIX CLIENT BRANDS PERMISSIONS AND MISSING TABLE
-- ============================================================================
-- This migration fixes the "Could not find the table 'public.client_brands' in the schema cache" error
-- observed by mobile_sales agents. It ensures the table exists, permissions are granted,
-- and RLS policies are in place.
-- ============================================================================

-- 1. Ensure the table exists (Idempotent)
CREATE TABLE IF NOT EXISTS public.client_brands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(client_id, brand_id)
);

-- 2. Enable RLS
ALTER TABLE public.client_brands ENABLE ROW LEVEL SECURITY;

-- 3. Grant Permissions to authenticated role (CRITICAL FIX for Schema Cache error)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_brands TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_brands TO service_role;

-- 4. Drop existing policies to avoid conflicts on re-run
DROP POLICY IF EXISTS "Users can view client brands" ON public.client_brands;
DROP POLICY IF EXISTS "Users can manage client brands" ON public.client_brands;
DROP POLICY IF EXISTS "Users can insert client brands" ON public.client_brands;
DROP POLICY IF EXISTS "Users can delete client brands" ON public.client_brands;

-- 5. Create RLS Policies

-- Policy: View client brands
-- Logic: If you can see the client (which handles company isolation), you can see their brands.
CREATE POLICY "Users can view client brands" ON public.client_brands
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_brands.client_id
        -- Implicitly relies on clients RLS or specific logic. 
        -- For robust safety, ensuring company match is good practice:
        AND c.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
    OR 
    -- Allow super admins to see everything
    EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
    )
);

-- Policy: Insert client brands
-- Logic: Agents can add brands to their OWN clients. Admins/Leaders can add to any client in company.
CREATE POLICY "Users can insert client brands" ON public.client_brands
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_id -- match the new row's client_id
        AND (
            -- 1. Agent owns the client
            c.agent_id = auth.uid()
            OR
            -- 2. User is an Admin/Manager/Leader in the same company
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.company_id = c.company_id
                AND p.role IN ('super_admin', 'admin', 'manager', 'team_leader', 'executive')
            )
        )
    )
);

-- Policy: Delete client brands
-- Logic: Same as Insert
CREATE POLICY "Users can delete client brands" ON public.client_brands
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.id = client_id
        AND (
            -- 1. Agent owns the client
            c.agent_id = auth.uid()
            OR
            -- 2. User is an Admin/Manager/Leader in the same company
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.company_id = c.company_id
                AND p.role IN ('super_admin', 'admin', 'manager', 'team_leader', 'executive')
            )
        )
    )
);

-- Verify grants
DO $$
BEGIN
    RAISE NOTICE 'Client Brands permissions fixed.';
END $$;
