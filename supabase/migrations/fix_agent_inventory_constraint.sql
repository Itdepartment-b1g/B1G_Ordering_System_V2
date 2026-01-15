-- Add unique constraint to agent_inventory to support ON CONFLICT upserts
-- required by leader_accept_and_distribute_stock function

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'agent_inventory_agent_id_variant_id_key'
    ) THEN
        ALTER TABLE agent_inventory
        ADD CONSTRAINT agent_inventory_agent_id_variant_id_key UNIQUE (agent_id, variant_id);
    END IF;
END $$;
