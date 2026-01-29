
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOrphanClients() {
    console.log('--- Checking for Orders with Unknown Clients ---');

    // 1. Fetch recent orders
    const { data: orders, error } = await supabase
        .from('client_orders')
        .select('id, order_number, client_id, company_id')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching orders:', error);
        return;
    }

    console.log(`Found ${orders.length} recent orders.`);

    let orphanCount = 0;
    let nullClientCount = 0;

    for (const order of orders) {
        if (!order.client_id) {
            console.log(`[Order ${order.order_number}] has NULL client_id.`);
            nullClientCount++;
            continue;
        }

        // Check if client exists
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, name, company_id')
            .eq('id', order.client_id)
            .single();

        if (clientError || !client) {
            console.log(`[Order ${order.order_number}] refers to non-existent client ${order.client_id}`);
            orphanCount++;
        } else {
            // Check for mismatched company?
            if (client.company_id !== order.company_id) {
                console.warn(`[Order ${order.order_number}] Company Mismatch! Order Co: ${order.company_id}, Client Co: ${client.company_id}`);
            }
            // console.log(`[Order ${order.order_number}] Client OK: ${client.name}`);
        }
    }

    console.log('--- Summary ---');
    console.log(`Total Orders Checked: ${orders.length}`);
    console.log(`Orders with NULL client_id: ${nullClientCount}`);
    console.log(`Orders with Dead client_id link: ${orphanCount}`);
}

checkOrphanClients();
