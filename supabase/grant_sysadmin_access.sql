-- ============================================================================
-- IMPROVED: GRANT SYSTEM ADMINISTRATORS SELECT ACCESS TO ALL TABLES
-- This uses the built-in is_system_administrator() SECURITY DEFINER function
-- to avoid RLS recursion and permission issues.
-- ============================================================================

DO $$
DECLARE
    t_name TEXT;
    tables TEXT[] := ARRAY[
        'brands', 'variants', 'main_inventory', 'agent_inventory', 'suppliers',
        'purchase_orders', 'purchase_order_items', 'clients', 'client_orders',
        'client_order_items', 'remittances_log', 'inventory_transactions', 'financial_transactions',
        'notifications', 'leader_teams', 'stock_requests', 'stock_request_items'
    ];
BEGIN
    -- Ensure the helper function exists and is robust
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_system_administrator') THEN
        CREATE OR REPLACE FUNCTION public.is_system_administrator()
        RETURNS BOOLEAN AS $func$
        BEGIN
            RETURN EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                AND role = 'system_administrator'
                AND status = 'active'
            );
        END;
        $func$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
    END IF;

    FOREACH t_name IN ARRAY tables LOOP
        -- Drop existing policy if it exists
        EXECUTE format('DROP POLICY IF EXISTS "System administrators can view all %I" ON %I', t_name, t_name);
        
        -- Create the new improved policy
        EXECUTE format('
            CREATE POLICY "System administrators can view all %I"
                ON %I FOR SELECT
                USING (public.is_system_administrator());
        ', t_name, t_name);
    END LOOP;
END $$;
