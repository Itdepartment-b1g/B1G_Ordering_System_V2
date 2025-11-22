import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { company_name, company_email, admin_email, admin_name, admin_password } = req.body;

        if (!company_name || !company_email || !admin_email || !admin_name || !admin_password) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Initialize Supabase Admin Client
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing Supabase credentials');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        // 1. Create Company
        const { data: company, error: companyError } = await supabase
            .from('companies')
            .insert({
                name: company_name,
                email: company_email,
                superadmin_name: admin_name,
                superadmin_email: admin_email,
                subscription_status: 'active'
            })
            .select()
            .single();

        if (companyError) throw new Error(`Failed to create company: ${companyError.message}`);

        // 2. Create Auth User
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: admin_email,
            password: admin_password,
            email_confirm: true,
            user_metadata: { full_name: admin_name, role: 'admin' }
        });

        if (authError) {
            // If user already exists, we might want to just link them? 
            // For now, let's fail if user exists to avoid confusion, or handle gracefully.
            // If user exists, we proceed to link them.
            if (!authError.message.includes('already registered')) {
                throw new Error(`Failed to create auth user: ${authError.message}`);
            }
        }

        const userId = authData.user?.id;

        if (!userId) {
            // Try to get existing user if creation failed due to existence
            const { data: existingUser } = await supabase.from('profiles').select('id').eq('email', admin_email).single();
            if (!existingUser) throw new Error('Could not find or create user');
            // Note: This fallback is simplistic. Ideally we get the ID from the auth error or a separate lookup.
        }

        // 3. Create/Update Profile
        // We need the user ID. If createUser failed because it exists, we need to fetch it.
        let finalUserId = userId;
        if (!finalUserId) {
            // Fetch user by email to get ID
            const { data: users } = await supabase.auth.admin.listUsers();
            const existing = users.users.find(u => u.email === admin_email);
            if (existing) finalUserId = existing.id;
            else throw new Error('Failed to locate user ID');
        }

        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: finalUserId,
                email: admin_email,
                full_name: admin_name,
                role: 'admin',
                company_id: company.id,
                is_super_admin: true,
                status: 'active'
            });

        if (profileError) throw new Error(`Failed to update profile: ${profileError.message}`);

        return res.status(200).json({ success: true, company, userId: finalUserId });

    } catch (error: any) {
        console.error('Error creating company:', error);
        return res.status(500).json({ error: error.message });
    }
}
