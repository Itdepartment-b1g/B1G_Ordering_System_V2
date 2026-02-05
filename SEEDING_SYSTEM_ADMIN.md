# Seeding the System Administrator (Dev)

## What you get

The **Login** page now has a dev-only button: **Seed System Admin (dev)**.

It creates (or fixes) this user:
- **Email**: `itdepartment.b1g@gmail.com`
- **Password**: `tempPassword123!`
- **Role**: `system_administrator`
- **company_id**: `NULL`

## How it works

- Frontend calls Supabase Edge Function: `seed-system-admin`
- The Edge Function uses **service role** to:
  - Create the auth user if it doesn't exist
  - Upsert the `profiles` row as `system_administrator`

## Required secrets / env vars

### 1) Supabase Edge Function secret

Set an Edge Function secret named `SEED_TOKEN` in your Supabase project.

### 2) Frontend env var

Add this to your local `.env`:

```bash
VITE_SEED_TOKEN=your_same_seed_token_value
```

## Files

- `supabase/functions/seed-system-admin/index.ts`
- `src/features/auth/LoginPage.tsx`

