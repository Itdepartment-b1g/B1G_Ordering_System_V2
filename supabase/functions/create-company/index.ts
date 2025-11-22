import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            // Supabase API URL - env var automatically populated by Supabase
            Deno.env.get('SUPABASE_URL') ?? '',
            // Supabase Service Role Key - env var automatically populated by Supabase
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { 
            company_name, 
            company_email, 
            super_admin_name, 
            super_admin_email, 
            super_admin_password 
        } = await req.json()

        if (!company_name || !company_email || !super_admin_name || !super_admin_email || !super_admin_password) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 1. Create Company
        const { data: company, error: companyError } = await supabaseClient
            .from('companies')
            .insert({
                company_name: company_name,
                company_email: company_email,
                super_admin_name: super_admin_name,
                super_admin_email: super_admin_email,
                role: 'Super Admin',
                status: 'active'
            })
            .select()
            .single()

        if (companyError) {
            // If company creation fails, return error
            return new Response(
                JSON.stringify({ error: `Failed to create company: ${companyError.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 2. Create Auth User
        const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
            email: super_admin_email,
            password: super_admin_password,
            email_confirm: true,
            user_metadata: { full_name: super_admin_name, role: 'super_admin' }
        })

        let userId = authData?.user?.id

        if (authError) {
            // If user creation fails, delete the company and return error
            await supabaseClient.from('companies').delete().eq('id', company.id)
            
            // If user already exists, try to find them
            if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
                const { data: users } = await supabaseClient.auth.admin.listUsers()
                const existing = users?.users?.find(u => u.email === super_admin_email)
                if (existing) {
                    userId = existing.id
                } else {
                    return new Response(
                        JSON.stringify({ error: `User exists but could not be found: ${authError.message}` }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
                    )
                }
            } else {
                return new Response(
                    JSON.stringify({ error: `Failed to create auth user: ${authError.message}` }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
                )
            }
        }

        if (!userId) {
            // Clean up company if we don't have a user ID
            await supabaseClient.from('companies').delete().eq('id', company.id)
            return new Response(
                JSON.stringify({ error: 'Failed to obtain User ID' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 3. Create Profile
        const { error: profileError } = await supabaseClient
            .from('profiles')
            .insert({
                id: userId,
                email: super_admin_email,
                full_name: super_admin_name,
                role: 'super_admin',
                company_id: company.id,
                status: 'active'
            })

        if (profileError) {
            // Clean up: delete auth user and company
            await supabaseClient.auth.admin.deleteUser(userId)
            await supabaseClient.from('companies').delete().eq('id', company.id)
            return new Response(
                JSON.stringify({ error: `Failed to create profile: ${profileError.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        return new Response(
            JSON.stringify({ success: true, company, userId }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
