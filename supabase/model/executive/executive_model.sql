-- Table shape only (DDL). Apply via SQL editor or copy into supabase/migrations/.
-- Query logic lives in src/server/repositories/.

CREATE TABLE executive_model (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
