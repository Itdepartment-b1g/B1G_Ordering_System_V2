import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Creates a new blank companies row (warehouse inventory tenant), a warehouse login,
 * and client-company assignments — same idea as adding a company + an executive,
 * but the warehouse user uses Main Inventory on the new company to load stock.
 */
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: Invalid token' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        const { data: callerProfile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single()

        if (profileError || !callerProfile) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: Could not verify user role' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        if (callerProfile.role !== 'system_administrator') {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: Only system administrators can create warehouse accounts' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
            )
        }

        const {
            company_name,
            company_email,
            full_name,
            email,
            password,
            phone,
            client_company_ids,
        } = await req.json()

        if (!company_name || !company_email || !full_name || !email || !password) {
            return new Response(
                JSON.stringify({
                    error:
                        'Missing required fields: company_name, company_email, full_name, email, password',
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        if (!client_company_ids || !Array.isArray(client_company_ids) || client_company_ids.length === 0) {
            return new Response(
                JSON.stringify({ error: 'At least one client company must be assigned' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email) || !emailRegex.test(company_email)) {
            return new Response(
                JSON.stringify({ error: 'Invalid email format' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const uniqueClientIds = [...new Set(client_company_ids as string[])]

        const { data: clientRows, error: clientVerifyErr } = await supabaseClient
            .from('companies')
            .select('id')
            .in('id', uniqueClientIds)

        if (clientVerifyErr) {
            return new Response(
                JSON.stringify({ error: `Error verifying client companies: ${clientVerifyErr.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        if (!clientRows || clientRows.length !== uniqueClientIds.length) {
            return new Response(
                JSON.stringify({ error: 'One or more client company IDs are invalid' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 1) New blank warehouse company (same core fields as create-company)
        const { data: company, error: companyError } = await supabaseClient
            .from('companies')
            .insert({
                company_name: String(company_name).trim(),
                company_email: String(company_email).trim(),
                super_admin_name: String(full_name).trim(),
                super_admin_email: String(email).trim(),
                role: 'Super Admin',
                status: 'active',
            })
            .select()
            .single()

        if (companyError || !company) {
            return new Response(
                JSON.stringify({ error: `Failed to create warehouse company: ${companyError?.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const inventoryCompanyId = company.id as string

        if (uniqueClientIds.includes(inventoryCompanyId)) {
            await supabaseClient.from('companies').delete().eq('id', inventoryCompanyId)
            return new Response(
                JSON.stringify({
                    error: 'Client list cannot include the new warehouse company. Remove it from client companies.',
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 2) Warehouse auth user (this login manages stock on inventoryCompanyId)
        const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: {
                full_name: full_name,
                role: 'warehouse',
            },
        })

        if (authError || !authData.user) {
            await supabaseClient.from('companies').delete().eq('id', inventoryCompanyId)
            return new Response(
                JSON.stringify({ error: `Failed to create user: ${authError?.message || 'No user returned'}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const userId = authData.user.id

        const { error: profileInsertError } = await supabaseClient
            .from('profiles')
            .insert({
                id: userId,
                company_id: inventoryCompanyId,
                email: email,
                full_name: full_name,
                role: 'warehouse',
                phone: phone || null,
                status: 'active',
            })

        if (profileInsertError) {
            await supabaseClient.auth.admin.deleteUser(userId)
            await supabaseClient.from('companies').delete().eq('id', inventoryCompanyId)
            return new Response(
                JSON.stringify({ error: `Failed to create profile: ${profileInsertError.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const assignments = uniqueClientIds.map((clientId: string) => ({
            warehouse_user_id: userId,
            client_company_id: clientId,
            assigned_by: user.id,
        }))

        const { error: assignmentError } = await supabaseClient
            .from('warehouse_company_assignments')
            .insert(assignments)

        if (assignmentError) {
            await supabaseClient.from('profiles').delete().eq('id', userId)
            await supabaseClient.auth.admin.deleteUser(userId)
            await supabaseClient.from('companies').delete().eq('id', inventoryCompanyId)
            return new Response(
                JSON.stringify({ error: `Failed to create assignments: ${assignmentError.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 3) Ensure a MAIN location exists and link this warehouse user to it
        const { data: mainLocation, error: mainLocErr } = await supabaseClient
            .from('warehouse_locations')
            .select('id')
            .eq('company_id', inventoryCompanyId)
            .eq('is_main', true)
            .maybeSingle()

        if (mainLocErr) {
            await supabaseClient.from('warehouse_company_assignments').delete().eq('warehouse_user_id', userId)
            await supabaseClient.from('profiles').delete().eq('id', userId)
            await supabaseClient.auth.admin.deleteUser(userId)
            await supabaseClient.from('companies').delete().eq('id', inventoryCompanyId)
            return new Response(
                JSON.stringify({ error: `Failed to find main warehouse location: ${mainLocErr.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        let mainLocationId = mainLocation?.id as string | undefined
        if (!mainLocationId) {
            const { data: createdLoc, error: createLocErr } = await supabaseClient
                .from('warehouse_locations')
                .insert({ company_id: inventoryCompanyId, name: 'Main Warehouse', is_main: true, created_by: user.id })
                .select('id')
                .single()

            if (createLocErr || !createdLoc) {
                await supabaseClient.from('warehouse_company_assignments').delete().eq('warehouse_user_id', userId)
                await supabaseClient.from('profiles').delete().eq('id', userId)
                await supabaseClient.auth.admin.deleteUser(userId)
                await supabaseClient.from('companies').delete().eq('id', inventoryCompanyId)
                return new Response(
                    JSON.stringify({ error: `Failed to create main warehouse location: ${createLocErr?.message}` }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
                )
            }
            mainLocationId = createdLoc.id as string
        }

        const { error: linkErr } = await supabaseClient
            .from('warehouse_location_users')
            .insert({ location_id: mainLocationId, user_id: userId })

        if (linkErr) {
            await supabaseClient.from('warehouse_company_assignments').delete().eq('warehouse_user_id', userId)
            await supabaseClient.from('profiles').delete().eq('id', userId)
            await supabaseClient.auth.admin.deleteUser(userId)
            await supabaseClient.from('companies').delete().eq('id', inventoryCompanyId)
            return new Response(
                JSON.stringify({ error: `Failed to link warehouse user to main location: ${linkErr.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Warehouse company and account created successfully',
                data: {
                    user_id: userId,
                    company_id: inventoryCompanyId,
                    company_name: company.company_name,
                    email,
                    full_name,
                    client_companies: uniqueClientIds.length,
                },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    } catch (error) {
        console.error('Error in create-warehouse function:', error)
        return new Response(
            JSON.stringify({
                success: false,
                error: (error as Error).message || 'An unexpected error occurred',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
