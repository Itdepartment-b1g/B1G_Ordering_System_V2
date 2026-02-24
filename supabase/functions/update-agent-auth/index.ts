
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Create a Supabase client with the Auth Admin API context
        const supabaseClient = createClient(
            // Supabase API URL - Env var exported by default.
            Deno.env.get('SUPABASE_URL') ?? '',
            // Supabase API SERVICE ROLE KEY - Env var exported by default.
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            }
        );

        // Get the request body
        const { user_id, email, password, full_name, role, phone, company_id } = await req.json();

        if (!user_id) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        // Build the update object
        const updates: any = {};
        if (email) updates.email = email;
        if (password) updates.password = password;

        // Update metadata if any relevant fields are provided
        if (full_name || role || phone || company_id) {
            updates.user_metadata = {};
            if (full_name) updates.user_metadata.full_name = full_name;
            if (role) updates.user_metadata.role = role;
            if (phone) updates.user_metadata.phone = phone;
            if (company_id) updates.user_metadata.company_id = company_id;
        }

        // Update the user using the admin client
        const { data: user, error } = await supabaseClient.auth.admin.updateUserById(
            user_id,
            updates
        );

        if (error) throw error;

        return new Response(
            JSON.stringify({ user }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
});
