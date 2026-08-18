-- Table shape only (DDL). Apply via SQL editor or copy into supabase/migrations/.
-- Query logic lives in src/server/repositories/.

CREATE TABLE executive_model_version (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    executive_model_id UUID NOT NULL REFERENCES executive_model(id),
    version TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
