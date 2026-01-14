
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Fix for ESM __dirname
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase URL or Anon Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkOrders() {
    const { data: orders, error } = await supabase
        .from('client_orders')
        .select('id, client_id, status, stage, company_id')
        .or('stage.eq.admin_approved,status.eq.approved');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${orders.length} approved orders.`);
    if (orders.length > 0) {
        console.log('Sample order:', orders[0]);
    }

    // Count by client
    const counts: Record<string, number> = {};
    orders.forEach((o: any) => {
        counts[o.client_id] = (counts[o.client_id] || 0) + 1;
    });
    console.log('Counts by client:', counts);
}

checkOrders();
