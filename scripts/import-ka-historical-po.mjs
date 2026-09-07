/**
 * Real historical KA PO import (pilot).
 * Inserts delivered + fully paid POs. Does not reserve/fulfill warehouse stock.
 *
 * Usage: node scripts/import-ka-historical-po.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  sb,
  money,
  readExcelRows,
  resolveLine,
  alreadyImported,
} from './dry-run-ka-historical-po.mjs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const userClientByEmail = new Map();

async function paymentClientFor(email) {
  if (userClientByEmail.has(email)) return userClientByEmail.get(email);
  const { data, error } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error) throw new Error(`KAM session for payment: ${error.message}`);
  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) throw new Error(`No auth token for KAM ${email}`);

  const url = String(env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = createClient(url, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: verifyErr } = await anon.auth.verifyOtp({
    type: 'email',
    token_hash: tokenHash,
  });
  if (verifyErr) throw new Error(`KAM verify: ${verifyErr.message}`);
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error(`No access token for KAM ${email}`);

  const userSb = createClient(url, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  userClientByEmail.set(email, userSb);
  return userSb;
}

function paymentCreatedAt(orderDate) {
  const day = String(orderDate).slice(0, 10);
  return `${day}T04:00:00.000Z`;
}

function spreadFullPay(items, cash) {
  let left = money(cash);
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLast = i === items.length - 1;
    const take = isLast ? left : money(Math.min(left, item.total_price));
    if (take > 0) {
      out.push({ itemId: item.id, amount: take });
      left = money(left - take);
    }
  }
  return out;
}

async function rollbackPo(poId) {
  if (!poId) return;
  await sb.from('purchase_order_key_account_payments').delete().eq('purchase_order_id', poId);
  await sb.from('purchase_order_items').delete().eq('purchase_order_id', poId);
  await sb.from('purchase_orders').delete().eq('id', poId);
}

async function importOne(ref, lines) {
  const issues = [];
  const headerKeys = ['order_date', 'client_name', 'shop_name', 'address_label', 'kam_email', 'discount', 'rfpf_number'];
  for (const key of headerKeys) {
    const vals = [...new Set(lines.map((l) => String(l[key] ?? '').trim()))];
    if (vals.length > 1) issues.push(`header ${key} differs across lines: ${vals.join(' | ')}`);
  }

  const resolved = [];
  for (const line of lines) {
    const r = await resolveLine(line);
    resolved.push({ excel_row: line.excel_row, ...r, source: line });
    issues.push(...r.errors.map((e) => `row ${line.excel_row}: ${e}`));
  }

  const first = resolved.find((r) => r.client && r.shop && r.address && r.kam && r.variant && r.location);
  if (!first) issues.push('could not resolve header lookups');
  if (first) {
    const dupes = await alreadyImported(first.client.company_id, ref);
    if (dupes.length) {
      issues.push(`already imported: ${dupes.map((d) => d.po_number).join(', ')}`);
    }
  }
  if (issues.length) {
    return { ok: false, external_po_ref: ref, issues };
  }

  const companyId = first.client.company_id;
  const kamId = first.kam.id;
  const orderDate = String(lines[0].order_date).slice(0, 10);
  const subtotal = money(resolved.reduce((s, r) => s + r.lineTotal, 0));
  const discount = money(lines[0]?.discount || 0);
  const total = money(subtotal - discount);
  const extraNote = String(lines[0].notes || '').trim();
  const rfpfNumber = String(lines[0].rfpf_number || '').trim() || null;
  const notes = [extraNote, `Legacy: ${ref}`, 'Imported historical PO (pre-system)']
    .filter(Boolean)
    .join(' | ');

  const { data: poNumber, error: numErr } = await sb.rpc('generate_key_account_po_number', {
    p_company_id: companyId,
  });
  if (numErr) throw numErr;
  if (!poNumber || typeof poNumber !== 'string') throw new Error('Failed to generate PO number');

  let poId = null;
  try {
    // created_by left null so service-role payment insert passes auth.uid() check; set after pay.
    const { data: po, error: poErr } = await sb
      .from('purchase_orders')
      .insert({
        company_id: companyId,
        po_number: poNumber,
        supplier_id: null,
        fulfillment_type: 'warehouse_transfer',
        warehouse_company_id: first.hubId,
        warehouse_location_id: first.location.id,
        key_account_client_id: first.client.id,
        key_account_shop_id: first.shop.id,
        key_account_address_id: first.address.id,
        kam_id: kamId,
        order_date: orderDate,
        expected_delivery_date: orderDate,
        notes,
        subtotal,
        tax_rate: 0,
        tax_amount: 0,
        discount,
        total_amount: total,
        po_order_kind: 'standard',
        rfpf_number: rfpfNumber,
        key_account_payment_terms: first.client.payment_terms || null,
        key_account_payment_mode: 'full',
        company_account_type: 'Key Accounts',
        workflow_status: 'kam_pending',
        status: 'pending',
        created_by: kamId,
        custom_pricing_confirmed: true,
        key_account_payment_status: 'unpaid',
      })
      .select('id, po_number')
      .single();
    if (poErr) throw poErr;
    poId = po.id;

    const itemPayload = resolved.map((r) => ({
      company_id: companyId,
      purchase_order_id: poId,
      variant_id: r.variant.id,
      warehouse_location_id: r.location.id,
      quantity: r.qty,
      unit_price: r.unitPrice,
      total_price: r.lineTotal,
    }));
    const { data: insertedItems, error: itemsErr } = await sb
      .from('purchase_order_items')
      .insert(itemPayload)
      .select('id, total_price');
    if (itemsErr) throw itemsErr;

    const userSb = await paymentClientFor(first.kam.email);
    const { data: pay, error: payErr } = await userSb
      .from('purchase_order_key_account_payments')
      .insert({
        purchase_order_id: poId,
        company_id: companyId,
        amount: total,
        settlement_discount: 0,
        payment_method: 'CASH',
        bank_type: null,
        proof_storage_path: null,
        created_at: paymentCreatedAt(orderDate),
      })
      .select('id')
      .single();
    if (payErr) throw payErr;

    const splits = spreadFullPay(insertedItems || [], total);
    if (splits.length) {
      const { error: allocErr } = await sb.from('purchase_order_key_account_payment_allocations').insert(
        splits.map((row) => ({
          company_id: companyId,
          payment_id: pay.id,
          purchase_order_item_id: row.itemId,
          allocated_amount: row.amount,
          allocated_discount: 0,
        }))
      );
      if (allocErr) throw allocErr;
    }

    const { error: updErr } = await sb
      .from('purchase_orders')
      .update({
        status: 'fulfilled',
        workflow_status: 'delivered',
        created_by: kamId,
        key_account_payment_status: 'paid',
      })
      .eq('id', poId);
    if (updErr) throw updErr;

    await sb.from('purchase_order_key_account_payments').update({ recorded_by: kamId }).eq('id', pay.id);

    await sb.rpc('log_purchase_order_event', {
      p_purchase_order_id: poId,
      p_event_type: 'created',
      p_note: `Imported historical PO (pre-system). Legacy: ${ref}`,
      p_created_by: kamId,
    });

    return {
      ok: true,
      external_po_ref: ref,
      po_id: poId,
      po_number: poNumber,
      rfpf_number: rfpfNumber,
      total_amount: total,
      line_count: resolved.length,
      order_date: orderDate,
    };
  } catch (error) {
    await rollbackPo(poId);
    return {
      ok: false,
      external_po_ref: ref,
      po_number_consumed: poNumber,
      issues: [error.message || String(error)],
    };
  }
}

async function main() {
  const rows = await readExcelRows();
  const grouped = new Map();
  for (const row of rows) {
    const ref = String(row.external_po_ref || '').trim();
    if (!grouped.has(ref)) grouped.set(ref, []);
    grouped.get(ref).push(row);
  }

  const results = [];
  for (const [ref, lines] of grouped) {
    results.push(await importOne(ref, lines));
  }

  console.log(
    JSON.stringify(
      {
        dry_run: false,
        file: 'docs/KA_Historical_PO_Fill_Template.xlsx',
        imported: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      },
      null,
      2
    )
  );

  if (results.some((r) => !r.ok)) process.exit(1);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
