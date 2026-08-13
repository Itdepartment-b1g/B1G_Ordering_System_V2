-- Existing table (reference shape for executive reads).
-- Already applied via supabase/migrations. Query logic: src/server/repositories.

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name TEXT NOT NULL,
    company_email TEXT NOT NULL,
    super_admin_name TEXT NOT NULL,
    super_admin_email TEXT NOT NULL,
    role TEXT DEFAULT 'Super Admin',
    status TEXT DEFAULT 'active',
    company_account_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
