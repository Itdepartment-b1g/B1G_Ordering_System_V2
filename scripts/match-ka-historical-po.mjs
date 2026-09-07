import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const n = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const lines = [
  {
    row: 3,
    po: 'LEGACY-2024-001',
    client: 'Key account client',
    shop: 'Vape Shop',
    addr: 'Receiving',
    brand: 'Chillax',
    variant: 'COSMIC CRUSH',
    kam: 'keyaccount3@gmail.com',
  },
  {
    row: 5,
    po: 'LEGACY-2024-002',
    client: 'KAM First Client',
    shop: 'Puff Vape Shop',
    addr: 'Muntilupa Client',
    brand: 'ROLEX',
    variant: 'ROLEX MASARAP',
    kam: 'saleshead@gmail.com',
  },
];

const clientNames = [...new Set(lines.map((l) => l.client))];
const kamEmails = [...new Set(lines.map((l) => l.kam))];

const { data: clients, error: ce } = await sb
  .from('key_account_clients')
  .select('id, company_id, client_name, client_code, status')
  .or(clientNames.map((name) => `client_name.ilike.%${name.replace(/[%_,]/g, '')}%`).join(','));
if (ce) throw ce;

const { data: kams, error: ke } = await sb
  .from('profiles')
  .select('id, full_name, email, role, company_id, status')
  .or(kamEmails.map((e) => `email.ilike.${e}`).join(','));
if (ke) throw ke;

function pickClient(name) {
  const exact = (clients || []).filter((c) => n(c.client_name) === n(name));
  if (exact.length) return exact;
  return (clients || []).filter(
    (c) => n(c.client_name).includes(n(name)) || n(name).includes(n(c.client_name))
  );
}

const results = [];
for (const line of lines) {
  const clientHits = pickClient(line.client);
  const out = { ...line };

  if (clientHits.length === 1) {
    const c = clientHits[0];
    out.client_match = {
      status: 'unique',
      name: c.client_name,
      code: c.client_code,
      account: c.status,
    };
    const companyId = c.company_id;

    const { data: shops } = await sb
      .from('key_account_shops')
      .select('id, shop_name, shop_code, client_id, is_active')
      .eq('client_id', c.id);
    const shopHits = (shops || []).filter((s) => n(s.shop_name) === n(line.shop));
    const shopFuzzy = shopHits.length
      ? shopHits
      : (shops || []).filter(
          (s) => n(s.shop_name).includes(n(line.shop)) || n(line.shop).includes(n(s.shop_name))
        );
    if (shopFuzzy.length === 1) {
      const s = shopFuzzy[0];
      out.shop_match = {
        status: 'unique',
        name: s.shop_name,
        code: s.shop_code,
        active: s.is_active,
      };
      const { data: addrs } = await sb
        .from('key_account_delivery_addresses')
        .select('id, address_label, is_default, is_active')
        .eq('shop_id', s.id);
      const addrHits = (addrs || []).filter((a) => n(a.address_label) === n(line.addr));
      const addrFuzzy = addrHits.length
        ? addrHits
        : (addrs || []).filter(
            (a) =>
              n(a.address_label).includes(n(line.addr)) || n(line.addr).includes(n(a.address_label))
          );
      if (addrFuzzy.length === 1) {
        out.addr_match = {
          status: 'unique',
          label: addrFuzzy[0].address_label,
          default: addrFuzzy[0].is_default,
        };
      } else if (addrFuzzy.length === 0) {
        out.addr_match = { status: 'none', available: (addrs || []).map((a) => a.address_label) };
      } else {
        out.addr_match = { status: 'ambiguous', available: addrFuzzy.map((a) => a.address_label) };
      }
    } else if (shopFuzzy.length === 0) {
      out.shop_match = { status: 'none', available: (shops || []).map((s) => s.shop_name) };
    } else {
      out.shop_match = { status: 'ambiguous', available: shopFuzzy.map((s) => s.shop_name) };
    }

    const kamHits = (kams || []).filter(
      (p) => n(p.email) === n(line.kam) && p.company_id === companyId
    );
    const kamAny = kamHits.length
      ? kamHits
      : (kams || []).filter((p) => n(p.email) === n(line.kam));
    if (kamAny.length === 1) {
      out.kam_match = {
        status: 'unique',
        email: kamAny[0].email,
        role: kamAny[0].role,
        account: kamAny[0].status,
      };
    } else if (kamAny.length === 0) {
      out.kam_match = { status: 'none' };
    } else {
      out.kam_match = { status: 'ambiguous' };
    }

    const { data: assign } = await sb
      .from('warehouse_company_assignments')
      .select('warehouse_user_id')
      .eq('client_company_id', companyId)
      .limit(1)
      .maybeSingle();
    let hubId = null;
    if (assign?.warehouse_user_id) {
      const { data: wp } = await sb
        .from('profiles')
        .select('company_id')
        .eq('id', assign.warehouse_user_id)
        .maybeSingle();
      hubId = wp?.company_id || null;
    }
    out.hub = hubId ? 'linked' : 'missing';

    if (hubId) {
      const { data: brands } = await sb
        .from('brands')
        .select('id, name, is_active')
        .eq('company_id', hubId)
        .ilike('name', `%${line.brand.replace(/[%_,]/g, '')}%`);
      const brandExact = (brands || []).filter((b) => n(b.name) === n(line.brand));
      const brandUse = brandExact.length ? brandExact : brands || [];
      if (brandUse.length === 1) {
        const b = brandUse[0];
        out.brand_match = { status: 'unique', name: b.name, active: b.is_active };
        const { data: variants } = await sb
          .from('variants')
          .select('id, name, sku, is_active')
          .eq('company_id', hubId)
          .eq('brand_id', b.id)
          .ilike('name', `%${line.variant.replace(/[%_,]/g, '')}%`);
        const varExact = (variants || []).filter((v) => n(v.name) === n(line.variant));
        const varUse = varExact.length ? varExact : variants || [];
        if (varUse.length === 1) {
          out.variant_match = {
            status: 'unique',
            name: varUse[0].name,
            sku: varUse[0].sku || null,
            active: varUse[0].is_active,
          };
        } else if (varUse.length === 0) {
          const { data: allVars } = await sb
            .from('variants')
            .select('name')
            .eq('company_id', hubId)
            .eq('brand_id', b.id)
            .eq('is_active', true)
            .limit(8);
          out.variant_match = { status: 'none', sample: (allVars || []).map((v) => v.name) };
        } else {
          out.variant_match = { status: 'ambiguous', available: varUse.map((v) => v.name) };
        }
      } else if (brandUse.length === 0) {
        out.brand_match = { status: 'none' };
      } else {
        out.brand_match = { status: 'ambiguous', available: brandUse.map((b) => b.name) };
      }
    }
  } else if (clientHits.length === 0) {
    out.client_match = { status: 'none' };
  } else {
    out.client_match = {
      status: 'ambiguous',
      available: clientHits.map((c) => `${c.client_name} (${c.client_code})`),
    };
  }
  results.push(out);
}

console.log(JSON.stringify(results, null, 2));
