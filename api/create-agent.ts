// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { email, password, full_name, role } = req.body;

        if (!email || !password || !full_name) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: email, password, full_name',
            });
        }

        // Get credentials from environment variables
        const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
        const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error('❌ Missing Supabase credentials in environment variables');
            return res.status(500).json({
                success: false,
                error: 'Server misconfigured. Missing Supabase credentials.',
            });
        }

        // Create Supabase Admin Client
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        console.log(`👤 Attempting to create user: ${email}`);

        // Create User
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email
            user_metadata: {
                full_name,
                role: role || 'sales_agent',
            },
        });

        if (error) {
            console.error('❌ Error creating user:', error);
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }

        console.log(`✅ User created successfully: ${data.user.id}`);

        return res.status(200).json({
            success: true,
            userId: data.user.id,
            user: data.user,
        });
    } catch (error: any) {
        console.error('❌ Server error:', error);

        return res.status(500).json({
            success: false,
            error: error?.message || 'Internal Server Error',
        });
    }
}
