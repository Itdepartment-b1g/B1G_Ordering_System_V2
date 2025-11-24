// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: corsHeaders
        });
    }

    try {
        // Create a Supabase client with the Service Role Key for admin operations
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        const {
            email,
            password,
            full_name,
            role,
            phone,
            region,
            city,
            status,
            company_id,
            reset_password
        } = await req.json();

        if (!email || !password || !full_name) {
            throw new Error('Missing required fields: email, password, and full_name are required');
        }

        // Check if this is a password reset operation
        if (reset_password) {
            // Get the existing user by email
            const { data: existingUser, error: getUserError } = await supabaseClient.auth.admin.listUsers();

            if (getUserError) throw getUserError;

            const user = existingUser.users.find(u => u.email === email);

            if (!user) {
                throw new Error('User not found');
            }

            // Update the user's password
            const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
                user.id,
                { password }
            );

            if (updateError) throw updateError;

            return new Response(JSON.stringify({
                success: true,
                userId: user.id
            }), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json'
                },
                status: 200
            });
        }

        // Create the auth user
        const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name,
                role: role || 'mobile_sales'
            }
        });

        if (authError) {
            // Provide clearer error message for duplicate email
            if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
                throw new Error(`A user with email ${email} already exists. Please use a different email or delete the existing user first.`);
            }
            throw authError;
        }
        if (!authData.user) throw new Error('Failed to create user');

        const userId = authData.user.id;

        // Create the profile record using SECURITY DEFINER function (bypasses RLS)
        const { error: profileError } = await supabaseClient.rpc('create_user_profile', {
            p_user_id: userId,
            p_full_name: full_name,
            p_email: email,
            p_role: role || 'mobile_sales',
            p_phone: phone || null,
            p_region: region || null,
            p_city: city || null,
            p_status: status || 'active',
            p_company_id: company_id || null
        });

        if (profileError) {
            console.error('Profile creation error:', profileError);
            
            // Clean up: delete the auth user if profile creation fails
            try {
                await supabaseClient.auth.admin.deleteUser(userId);
                console.log(`Cleaned up auth user ${userId} after profile creation failure`);
            } catch (cleanupError) {
                console.error('Failed to clean up auth user:', cleanupError);
            }
            
            throw new Error(`Failed to create profile: ${profileError.message}. The user account has been removed.`);
        }

        // Verify profile was created successfully
        const { data: profileData, error: verifyError } = await supabaseClient
            .from('profiles')
            .select('id, email, full_name, role, company_id')
            .eq('id', userId)
            .single();

        if (verifyError || !profileData) {
            console.error('Profile verification error:', verifyError);
            
            // Clean up: delete the auth user if profile verification fails
            try {
                await supabaseClient.auth.admin.deleteUser(userId);
                console.log(`Cleaned up auth user ${userId} after profile verification failure`);
            } catch (cleanupError) {
                console.error('Failed to clean up auth user:', cleanupError);
            }
            
            throw new Error(`Profile was not created successfully. The user account has been removed.`);
        }

        return new Response(JSON.stringify({
            success: true,
            userId: userId,
            profile: profileData
        }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            status: 200
        });

    } catch (error) {
        console.error('Error in create-agent function:', error);
        return new Response(JSON.stringify({
            error: error.message
        }), {
            headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
            },
            status: 400
        });
    }
});
