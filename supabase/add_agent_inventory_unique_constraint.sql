-- ============================================================================
-- ADD UNIQUE CONSTRAINT TO AGENT INVENTORY
-- ============================================================================
-- This constraint ensures an agent can only have one record per variant
-- per company. Required for the return inventory UPSERT logic.
-- ============================================================================

-- Add unique constraint if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'agent_inventory_unique_constraint'
    ) THEN
        ALTER TABLE agent_inventory 
        ADD CONSTRAINT agent_inventory_unique_constraint 
        UNIQUE (agent_id, variant_id, company_id);
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON CONSTRAINT agent_inventory_unique_constraint ON agent_inventory IS 
'Ensures each agent has only one inventory record per variant per company';

