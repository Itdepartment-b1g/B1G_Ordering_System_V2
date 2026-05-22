import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CREATABLE_ROLES = [
    'sales_admin',
    'sales_director',
    'key_account_manager',
    'key_account_accounting',
] as const

const CREATOR_ROLES = ['sales_admin', 'sales_head'] as const

function roleLabel(role: string): string {
    switch (role) {
        case 'sales_admin': return 'Sales Admin'
        case 'sales_director': return 'Sales Director'
        case 'key_account_manager': return 'Key Account Manager'
        case 'key_account_accounting': return 'Key Account Accounting'
        default: return role
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const {
            full_name,
            email,
            password = 'tempPassword123!',
            role,
            company_id,
            created_by,
            phone = null,
            region = null,
            city = null,
        } = await req.json()

        if (!full_name || !email || !role || !company_id) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: full_name, email, role, company_id' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        if (!CREATABLE_ROLES.includes(role)) {
            return new Response(
                JSON.stringify({
                    error: `Invalid role. Must be one of: ${CREATABLE_ROLES.join(', ')}`,
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const { data: creator, error: creatorError } = await supabaseClient
            .from('profiles')
            .select('role, company_id')
            .eq('id', created_by)
            .single()

        if (creatorError || !creator) {
            return new Response(
                JSON.stringify({ error: 'Could not verify creator permissions' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
            )
        }

        if (!CREATOR_ROLES.includes(creator.role as typeof CREATOR_ROLES[number])) {
            return new Response(
                JSON.stringify({ error: 'Only Sales Head or Sales Admin can create Key Account users' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
            )
        }

        if (creator.company_id !== company_id) {
            return new Response(
                JSON.stringify({ error: 'Cannot create users for a different company' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
            )
        }

        const { data: existingUsers } = await supabaseClient.auth.admin.listUsers()
        const existingUser = existingUsers?.users?.find(u => u.email === email)

        if (existingUser) {
            return new Response(
                JSON.stringify({ error: 'A user with this email already exists' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name, role }
        })

        const userId = authData?.user?.id

        if (authError || !userId) {
            return new Response(
                JSON.stringify({ error: `Failed to create auth user: ${authError?.message || 'Unknown error'}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const { error: profileError } = await supabaseClient.rpc('create_user_profile', {
            p_user_id: userId,
            p_full_name: full_name,
            p_email: email,
            p_role: role,
            p_phone: phone || null,
            p_region: region || null,
            p_city: city || null,
            p_status: 'active',
            p_company_id: company_id,
        })

        if (profileError) {
            await supabaseClient.auth.admin.deleteUser(userId)
            return new Response(
                JSON.stringify({ error: `Failed to create profile: ${profileError.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        await supabaseClient
            .from('audit_logs')
            .insert({
                user_id: created_by,
                operation: 'INSERT',
                table_name: 'profiles',
                record_id: userId,
                new_data: { full_name, email, role, company_id, phone, region, city },
                created_at: new Date().toISOString()
            })

        return new Response(
            JSON.stringify({
                success: true,
                userId,
                message: `${roleLabel(role)} created successfully`,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
