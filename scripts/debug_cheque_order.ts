
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugGeneral() {
    console.log('--- DIAGNOSTIC: PAYMENT METHODS ---');

    // Check distinct payment methods
    const { data: methods, error: methodError } = await supabase
        .from('client_orders')
        .select('payment_method')
        .limit(100)
        .order('created_at', { ascending: false });

    if (methodError) {
        console.error('Error fetching methods:', methodError);
    } else {
        const distinct = [...new Set(methods.map(m => m.payment_method))];
        console.log('Distinct Payment Methods found:', distinct);
    }

    console.log('\n--- DIAGNOSTIC: RECENT ORDERS (ANY TYPE) ---');
    const { data: orders, error: orderError } = await supabase
        .from('client_orders')
        .select('id, order_number, payment_method, deposit_id, status')
        .order('created_at', { ascending: false })
        .limit(5);

    if (orderError) console.error(orderError);
    else {
        orders.forEach(o => {
            console.log(`${o.order_number}: ${o.payment_method} (Deposit: ${o.deposit_id || 'NULL'})`);
        });
    }

    console.log('\n--- DIAGNOSTIC: RECENT DEPOSITS ---');
    const { data: deposits, error: depError } = await supabase
        .from('cash_deposits')
        .select('id, deposit_type, bank_account, status, amount')
        .order('created_at', { ascending: false })
        .limit(5);

    if (depError) console.error(depError);
    else {
        deposits.forEach(d => {
            console.log(`[${d.deposit_type}] ID: ${d.id}, Bank: '${d.bank_account}', Status: ${d.status}`);
        });
    }
}

debugGeneral();
