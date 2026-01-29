-- Add has_forge column to clients table
-- This column tracks whether a client has the Forge brand/product

-- Add the column (default to false for existing records)
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS has_forge BOOLEAN DEFAULT FALSE NOT NULL;

-- Add a comment to the column for documentation
COMMENT ON COLUMN clients.has_forge IS 'Indicates whether the client has Forge brand products';

-- Create an index for faster queries filtering by has_forge
CREATE INDEX IF NOT EXISTS idx_clients_has_forge ON clients(has_forge);

-- Update existing clients to false if null (safety check)
UPDATE clients SET has_forge = FALSE WHERE has_forge IS NULL;

-- Verify the changes
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'has_forge';

-- Sample query to see the new column
SELECT 
  id,
  name,
  company,
  has_forge,
  created_at
FROM clients
LIMIT 5;

