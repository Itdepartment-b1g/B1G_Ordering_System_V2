-- ============================================================================
-- ADD BRANDS FIELD TO CLIENTS TABLE
-- ============================================================================
-- This migration adds a brands field to track which products/brands
-- each client is holding. Stored as JSONB array of brand IDs.
-- ============================================================================

-- Add brands column to clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS brand_ids UUID[] DEFAULT ARRAY[]::UUID[];

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_clients_brand_ids ON clients USING GIN (brand_ids);

-- Add comment
COMMENT ON COLUMN clients.brand_ids IS 'Array of brand IDs that the client is holding. Populated from the brands table based on company_id.';
