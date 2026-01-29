-- ============================================================================
-- FIX: Add RLS policy to allow users to view their own company
-- ============================================================================
-- Currently, only system_administrator can view companies table
-- This adds a policy so users can view their own company information

-- Add policy for users to view their own company
DROP POLICY IF EXISTS "Users can view their own company" ON companies;

CREATE POLICY "Users can view their own company"
    ON companies FOR SELECT
    USING (
        id IN (
            SELECT company_id 
            FROM profiles 
            WHERE id = auth.uid()
        )
    );

-- Verify the policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'companies'
ORDER BY policyname;

