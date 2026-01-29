/**
 * Quick script to check users in your database
 * Run with: npx tsx scripts/check_users.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables!');
  console.error('Make sure you have VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
  process.exit(1);
}

// Create admin client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkUsers() {
  console.log('🔍 Checking users in database...\n');

  try {
    // Check profiles table
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, status, company_id')
      .limit(20);

    if (profileError) {
      console.error('❌ Error fetching profiles:', profileError.message);
      return;
    }

    if (!profiles || profiles.length === 0) {
      console.log('⚠️  No users found in profiles table');
      return;
    }

    console.log(`✅ Found ${profiles.length} users:\n`);
    console.log('╔════════════════════════════════════════════════════════════════════╗');
    console.log('║ Email                        │ Name            │ Role             ║');
    console.log('╠════════════════════════════════════════════════════════════════════╣');
    
    profiles.forEach((user, index) => {
      const email = (user.email || 'N/A').padEnd(28);
      const name = (user.full_name || 'N/A').substring(0, 15).padEnd(15);
      const role = (user.role || 'N/A').substring(0, 16).padEnd(16);
      const status = user.status === 'active' ? '✅' : '❌';
      
      console.log(`║ ${email} │ ${name} │ ${role} ${status} ║`);
    });
    
    console.log('╚════════════════════════════════════════════════════════════════════╝');
    console.log('\n📝 Note: Passwords are hashed and cannot be displayed here.');
    console.log('   If you need to reset a password, use the Supabase dashboard.');
    console.log('\n💡 Tips:');
    console.log('   - Users with ❌ are inactive and cannot login');
    console.log('   - Check Supabase Dashboard > Authentication > Users for more details');
    console.log('   - You can reset passwords from the dashboard\n');

    // Check for any super admin or system admin
    const admins = profiles.filter(p => 
      p.role === 'super_admin' || p.role === 'system_administrator'
    );

    if (admins.length > 0) {
      console.log('🔐 Admin Users:');
      admins.forEach(admin => {
        console.log(`   - ${admin.email} (${admin.role})`);
      });
      console.log('');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

// Run the script
checkUsers().then(() => {
  console.log('✅ Done!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
