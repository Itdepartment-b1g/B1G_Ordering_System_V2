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
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Get the authorization header
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing authorization header' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        // Verify the caller is a system administrator
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized: Invalid token' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        // Get the caller's profile to check role
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
                JSON.stringify({ error: 'Unauthorized: Only system administrators can create executive accounts' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
            )
        }

        // Parse request body
        const { full_name, email, password, phone, company_ids } = await req.json()

        // Validate required fields
        if (!full_name || !email || !password) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: full_name, email, password' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        if (!company_ids || !Array.isArray(company_ids) || company_ids.length === 0) {
            return new Response(
                JSON.stringify({ error: 'At least one company must be assigned to the executive' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) {
            return new Response(
                JSON.stringify({ error: 'Invalid email format' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // Verify all company IDs exist
        const { data: companies, error: companiesError } = await supabaseClient
            .from('companies')
            .select('id')
            .in('id', company_ids)

        if (companiesError) {
            return new Response(
                JSON.stringify({ error: `Error verifying companies: ${companiesError.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        if (!companies || companies.length !== company_ids.length) {
            return new Response(
                JSON.stringify({ error: 'One or more company IDs are invalid' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // Create the user in Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: {
                full_name: full_name,
                role: 'executive'
            }
        })

        if (authError) {
            return new Response(
                JSON.stringify({ error: `Failed to create user: ${authError.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        if (!authData.user) {
            return new Response(
                JSON.stringify({ error: 'User creation failed: No user data returned' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const userId = authData.user.id

        // Create profile with role = 'executive' and company_id = NULL
        const { error: profileInsertError } = await supabaseClient
            .from('profiles')
            .insert({
                id: userId,
                company_id: null,
                email: email,
                full_name: full_name,
                role: 'executive',
                phone: phone || null,
                status: 'active'
            })

        if (profileInsertError) {
            // Rollback: delete the auth user
            await supabaseClient.auth.admin.deleteUser(userId)
            return new Response(
                JSON.stringify({ error: `Failed to create profile: ${profileInsertError.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // Create company assignments
        const assignments = company_ids.map((companyId: string) => ({
            executive_id: userId,
            company_id: companyId,
            assigned_by: user.id
        }))

        const { error: assignmentError } = await supabaseClient
            .from('executive_company_assignments')
            .insert(assignments)

        if (assignmentError) {
            // Rollback: delete profile and auth user
            await supabaseClient.from('profiles').delete().eq('id', userId)
            await supabaseClient.auth.admin.deleteUser(userId)
            return new Response(
                JSON.stringify({ error: `Failed to create company assignments: ${assignmentError.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // Success response
        return new Response(
            JSON.stringify({
                success: true,
                message: 'Executive account created successfully',
                data: {
                    user_id: userId,
                    email: email,
                    full_name: full_name,
                    assigned_companies: company_ids.length
                }
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        )

    } catch (error) {
        console.error('Error in create-executive function:', error)
        return new Response(
            JSON.stringify({
                success: false,
                error: (error as Error).message || 'An unexpected error occurred',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
