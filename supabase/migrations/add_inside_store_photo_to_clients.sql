-- Add inside_store_photo_url to clients table (optional photo taken inside the store when adding client)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS inside_store_photo_url TEXT;
COMMENT ON COLUMN clients.inside_store_photo_url IS 'Optional URL to photo taken inside the store at registration (stored in client-photos bucket)';
