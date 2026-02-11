-- Allow duplicate request_numbers to support multi-item requests (Request Number acts as Group ID)
ALTER TABLE stock_requests 
DROP CONSTRAINT IF EXISTS stock_requests_request_number_key;

-- Add index for better performance when querying by request_number
CREATE INDEX IF NOT EXISTS idx_stock_requests_request_number ON stock_requests(request_number);

-- Optional: Ensure uniqueness of variant per request (to avoid duplicate items in same request)
-- ALTER TABLE stock_requests ADD CONSTRAINT stock_requests_request_number_variant_key UNIQUE (request_number, variant_id);
