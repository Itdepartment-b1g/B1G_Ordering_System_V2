-- Add tax_status column to clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS tax_status text DEFAULT 'Tax Exempt';

-- Update existing records if needed (optional, depends on if we want to backfill)
-- For now, we will default all existing to Tax Exempt unless they have a COR?
-- Let's stick to the default constraint for now.

COMMENT ON COLUMN public.clients.tax_status IS 'Tax status of the client: "Tax on Sales" or "Tax Exempt"';
