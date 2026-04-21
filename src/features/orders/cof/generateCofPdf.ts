import { supabase } from '@/lib/supabase';
import type { PurchaseOrder, PurchaseOrderItem } from '../types';

type RequestorInfo = {
  company: { id: string; company_name: string } | null;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string | null;
  } | null;
};

async function fetchRequestorInfo(poId: string): Promise<RequestorInfo> {
  try {
    const { data, error } = await supabase.rpc('get_po_requestor_info', { p_po_id: poId });
    if (error) {
      console.warn('[COF] get_po_requestor_info error:', error);
      return { company: null, profile: null };
    }
    const obj = (data || {}) as Partial<RequestorInfo>;
    return {
      company: obj.company ?? null,
      profile: obj.profile ?? null,
    };
  } catch (e) {
    console.warn('[COF] get_po_requestor_info exception:', e);
    return { company: null, profile: null };
  }
}

/**
 * Opens a new browser tab with an HTML/CSS rendition of the Customer Order
 * Form (COF), populated with the given Purchase Order. The new tab exposes a
 * "Print" button that triggers the browser's native print dialog, letting the
 * user save it as PDF or send it to a printer.
 *
 * Implementation note: we deliberately use a blob URL + synthetic anchor
 * click (instead of `window.open` with size features) so the COF opens as a
 * real new tab — the user can keep browsing the main app while reviewing or
 * printing the form.
 *
 * Layout intentionally mirrors the COF spreadsheet template (teal item
 * headers, light blue client fields, gray SELECT BRAND band, right sidebar
 * with pricing/payment/bank details, yellow totals block).
 */
export async function generateAndOpenCofPdf(po: PurchaseOrder) {
  const requestor = await fetchRequestorInfo(po.id);
  const html = buildCofHtml(po, requestor);

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Open in a new tab via a click on a transient anchor. This reliably
  // produces a tab (not a popup window) and is not blocked when invoked
  // from a user gesture (e.g. the "COF" button click).
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Release the blob URL after the new tab has had time to load.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function escapeHtml(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function peso(n: number | null | undefined): string {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return `₱${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDateTime(d?: string | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString();
}

// ----------------------------------------------------------------------------
// Row builders
// ----------------------------------------------------------------------------

const FLAVOR_ROW_COUNT = 20;
const DEVICE_ROW_COUNT = 7;
const OTHER_ROW_COUNT = 10;

function flavorRowsHtml(items: PurchaseOrderItem[]): string {
  const rows: (PurchaseOrderItem | null)[] = [...items];
  while (rows.length < FLAVOR_ROW_COUNT) rows.push(null);

  return rows
    .map((r) => {
      if (!r) {
        return `
          <tr>
            <td class="cell-name"></td>
            <td class="cell-qty"></td>
            <td class="cell-price"></td>
            <td class="cell-total">${peso(0)}</td>
          </tr>`;
      }
      const name = `${r.brand_name ? r.brand_name + ' — ' : ''}${r.variant_name}`;
      return `
        <tr>
          <td class="cell-name">${escapeHtml(name)}</td>
          <td class="cell-qty">${Number(r.quantity || 0)}</td>
          <td class="cell-price">${peso(r.unit_price)}</td>
          <td class="cell-total">${peso(r.total_price)}</td>
        </tr>`;
    })
    .join('');
}

function deviceRowsHtml(items: PurchaseOrderItem[]): string {
  const rows: (PurchaseOrderItem | null)[] = [...items];
  while (rows.length < DEVICE_ROW_COUNT) rows.push(null);

  return rows
    .map((r) => {
      if (!r) {
        return `
          <tr>
            <td class="cell-name"></td>
            <td class="cell-qty"></td>
            <td class="cell-price"></td>
            <td class="cell-total">${peso(0)}</td>
          </tr>`;
      }
      const name = `${r.brand_name ? r.brand_name + ' — ' : ''}${r.variant_name}`;
      return `
        <tr>
          <td class="cell-name">${escapeHtml(name)}</td>
          <td class="cell-qty">${Number(r.quantity || 0)}</td>
          <td class="cell-price">${peso(r.unit_price)}</td>
          <td class="cell-total">${peso(r.total_price)}</td>
        </tr>`;
    })
    .join('');
}

function otherRowsHtml(items: PurchaseOrderItem[]): string {
  const rows: (PurchaseOrderItem | null)[] = [...items];
  while (rows.length < OTHER_ROW_COUNT) rows.push(null);

  return rows
    .map((r) => {
      if (!r) {
        return `
          <tr>
            <td class="cell-name"></td>
            <td class="cell-qty"></td>
            <td class="cell-price"></td>
            <td class="cell-total">${peso(0)}</td>
          </tr>`;
      }
      const typeLabel = (r.variant_type || '').toUpperCase();
      const name = `${typeLabel ? typeLabel + ' — ' : ''}${r.brand_name ? r.brand_name + ' — ' : ''}${r.variant_name}`;
      return `
        <tr>
          <td class="cell-name">${escapeHtml(name)}</td>
          <td class="cell-qty">${Number(r.quantity || 0)}</td>
          <td class="cell-price">${peso(r.unit_price)}</td>
          <td class="cell-total">${peso(r.total_price)}</td>
        </tr>`;
    })
    .join('');
}

// ----------------------------------------------------------------------------
// HTML builder
// ----------------------------------------------------------------------------

/**
 * Collapse line items that reference the same product so multi-warehouse POs
 * don't show the same SKU on multiple rows. Items are keyed by `variant_id`
 * (falling back to brand/name/unit-price when unavailable). Quantities and
 * totals are summed; the unit price of the first occurrence is kept.
 */
function aggregateItems(items: PurchaseOrderItem[]): PurchaseOrderItem[] {
  const map = new Map<string, PurchaseOrderItem>();
  for (const it of items) {
    const key =
      it.variant_id ||
      `${it.brand_name || ''}__${it.variant_name || ''}__${it.variant_type}__${it.unit_price}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity = Number(existing.quantity || 0) + Number(it.quantity || 0);
      existing.total_price = Number(existing.total_price || 0) + Number(it.total_price || 0);
    } else {
      map.set(key, {
        ...it,
        quantity: Number(it.quantity || 0),
        total_price: Number(it.total_price || 0),
      });
    }
  }
  return Array.from(map.values());
}

function buildCofHtml(po: PurchaseOrder, requestor: RequestorInfo): string {
  const aggregated = aggregateItems(po.items || []);
  const flavors = aggregated.filter((it) => it.variant_type === 'flavor');
  const devices = aggregated.filter((it) => it.variant_type === 'battery');
  const others = aggregated.filter((it) => it.variant_type !== 'flavor' && it.variant_type !== 'battery');

  const sumQty = (xs: PurchaseOrderItem[]) => xs.reduce((s, x) => s + Number(x.quantity || 0), 0);
  const sumAmt = (xs: PurchaseOrderItem[]) => xs.reduce((s, x) => s + Number(x.total_price || 0), 0);

  // Client info on the COF reflects the REQUESTOR (the tenant company that
  // created this PO) – not the supplier.
  const requestorCompanyName = requestor.company?.company_name || '';
  const requestorFullName = requestor.profile?.full_name || '';
  const requestorPhone = requestor.profile?.phone || '';
  const requestorAddress = [
    requestor.profile?.address,
    requestor.profile?.city,
    requestor.profile?.country,
  ]
    .filter(Boolean)
    .join(', ');

  const clientName = requestorCompanyName;
  const tradeName = requestorCompanyName;
  const contactPerson = requestorFullName;
  const contactNumber = requestorPhone;
  const address = requestorAddress;
  const remarks = po.notes || '';

  const vatable = Number(po.subtotal || 0);
  const vat = Number(po.tax_amount || 0);
  const total = Number(po.total_amount || 0);
  const discount = Number(po.discount || 0);
  const grand = Math.max(0, total);
  const remaining = Math.max(0, total);

  const otherSectionHtml =
    others.length > 0
      ? `
        <div style="height: 6px;"></div>

        <table class="items-table other-table">
          <thead>
            <tr>
              <th colspan="4" class="section-title">OTHER ITEMS</th>
            </tr>
            <tr>
              <th>ITEM</th>
              <th>QUANTITY</th>
              <th>UNIT PRICE</th>
              <th>TOTAL AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${otherRowsHtml(others)}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL QUANTITY</td>
              <td class="ft-qty">${sumQty(others)}</td>
              <td>TOTAL AMOUNT</td>
              <td class="ft-total">${peso(sumAmt(others))}</td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td class="ft-discount">SP DISCOUNT</td>
              <td class="ft-total"></td>
            </tr>
          </tfoot>
        </table>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>COF – ${escapeHtml(po.po_number)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #e5e5e5;
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    color: #000;
  }

  /* ---- Toolbar (non-printable) ---- */
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16px;
    background: #111827; color: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  }
  .toolbar h1 { margin: 0; font-size: 13px; font-weight: 600; }
  .toolbar .hint { font-size: 11px; opacity: 0.75; margin-left: 10px; }
  .toolbar button {
    background: #22c55e; color: #000; border: 0;
    padding: 8px 16px; font-size: 13px; font-weight: 700;
    border-radius: 4px; cursor: pointer;
  }
  .toolbar button:hover { background: #16a34a; color: #fff; }

  /* ---- Page ---- */
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 16px auto;
    padding: 10mm 8mm;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    font-size: 9px;
    line-height: 1.2;
    color: #000;
  }

  /* ---- Header ---- */
  .head {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: end;
    padding-bottom: 4px;
  }
  .head .title {
    text-align: center;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.02em;
  }
  .head .cof-code {
    text-align: right;
    font-size: 10px;
    font-weight: 700;
  }
  .head .cof-code .sub {
    display: block;
    font-size: 8px;
    font-weight: 400;
    color: #555;
    margin-top: 2px;
  }

  /* ---- SELECT BRAND band ---- */
  .brand-band {
    background: #d0d0d0;
    border: 1px solid #9a9a9a;
    text-align: center;
    font-weight: 600;
    padding: 6px 0;
    margin-top: 2px;
    letter-spacing: 0.06em;
    font-size: 11px;
  }

  /* ---- Top info: client info (left) + meta/reason (right) ---- */
  .top-info {
    display: grid;
    grid-template-columns: 1.55fr 1fr;
    gap: 4px;
    margin-top: 6px;
  }
  .client-info .ci-label {
    font-style: italic;
    font-size: 9px;
    margin-bottom: 2px;
    padding-left: 2px;
  }
  .field-row {
    display: grid;
    grid-template-columns: 120px 1fr;
    column-gap: 2px;
    margin-bottom: 2px;
    align-items: stretch;
  }
  .field-row .flabel {
    text-align: right;
    font-weight: 600;
    padding: 2px 4px;
    font-size: 9px;
  }
  .field-row .finput {
    background: #dce7f1;
    border: 1px solid #9fb4c7;
    padding: 2px 4px;
    min-height: 14px;
    font-size: 9px;
  }
  .meta-info .field-row {
    grid-template-columns: 130px 1fr;
  }
  .reason-box {
    border: 1px solid #777;
    margin-top: 4px;
  }
  .reason-box .rb-title {
    background: #e9e9e9;
    border-bottom: 1px solid #777;
    padding: 2px 6px;
    font-weight: 700;
    font-size: 9px;
  }
  .reason-box .rb-body {
    padding: 4px 6px;
  }
  .reason-box .rb-body > div { margin: 2px 0; }

  /* ---- Main body: items tables (left) + sidebar (right) ---- */
  .main-body {
    display: grid;
    grid-template-columns: 1.55fr 1fr;
    gap: 6px;
    margin-top: 6px;
  }

  .items-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  .items-table th, .items-table td {
    border: 1px solid #6a6a6a;
    padding: 2px 4px;
    font-size: 9px;
    height: 16px;
  }
  .items-table thead th {
    background: #8fd3ce;
    color: #000;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.03em;
    height: 22px;
  }
  .items-table .section-title {
    background: #8fd3ce;
    font-weight: 800;
    text-align: center;
    letter-spacing: 0.08em;
    height: 22px;
    font-size: 11px;
  }
  .items-table .cell-name { text-align: left; }
  .items-table .cell-qty { text-align: center; width: 14%; }
  .items-table .cell-price { text-align: right; width: 18%; }
  .items-table .cell-total {
    text-align: right;
    width: 22%;
    background: #e9e9e9;
  }
  .items-table tfoot td {
    background: #d0d0d0;
    font-weight: 700;
  }
  .items-table tfoot .ft-qty { text-align: center; }
  .items-table tfoot .ft-total { text-align: right; background: #e9e9e9; }
  .items-table tfoot .ft-discount {
    background: #bfbfbf;
    text-align: center;
    font-weight: 700;
  }

  .device-table thead th:first-child { width: 46%; }

  /* ---- Sidebar ---- */
  .sidebar { display: flex; flex-direction: column; gap: 4px; }
  .side-block { border: 1px solid #777; padding: 4px 6px; font-size: 9px; }
  .side-block .sb-title {
    font-weight: 700;
    margin-bottom: 3px;
    letter-spacing: 0.02em;
  }
  .side-block .sb-row { margin: 2px 0; }
  .side-block.plain { border: 0; padding: 2px 0; }
  .side-block .empty-box {
    border: 1px solid #9fb4c7;
    background: #ffffff;
    min-height: 40px;
    margin-top: 2px;
  }
  .bank .bank-corp {
    font-weight: 800;
    font-size: 10px;
    margin-top: 2px;
  }
  .bank .bank-name { font-weight: 700; margin-top: 3px; }
  .bank .bank-acct { font-variant-numeric: tabular-nums; }

  /* ---- Bottom: remarks + totals ---- */
  .bottom {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: 6px;
    margin-top: 6px;
  }
  .remarks-box {
    border: 1px solid #6a6a6a;
    padding: 4px 6px;
    min-height: 80px;
  }
  .remarks-box .rm-title {
    font-weight: 700;
    margin-bottom: 3px;
    font-size: 9px;
  }
  .remarks-box .rm-body { font-size: 9px; white-space: pre-wrap; }

  .totals {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
    background: #fff6c8;
  }
  .totals td {
    border: 1px solid #6a6a6a;
    padding: 3px 6px;
  }
  .totals .tlabel {
    font-weight: 700;
    text-align: right;
    background: #fff2a8;
    width: 60%;
  }
  .totals .tvalue {
    text-align: right;
    font-variant-numeric: tabular-nums;
    background: #ffffff;
  }
  .totals .tbold .tlabel { background: #ffe87a; }
  .totals .tbold .tvalue { font-weight: 800; }

  .footer-note {
    text-align: center;
    font-size: 8px;
    color: #555;
    margin-top: 6px;
  }

  /* ---- Print ---- */
  @media print {
    @page { size: A4 portrait; margin: 6mm; }
    html, body { background: #fff; }
    .toolbar { display: none !important; }
    .page {
      width: auto; min-height: auto;
      margin: 0; padding: 0;
      box-shadow: none;
    }
    /* Preserve background colors when printing */
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <h1>Customer Order Form · ${escapeHtml(po.po_number)}
      <span class="hint">Use <b>Print</b> (or Ctrl/⌘ + P) and choose “Save as PDF”.</span>
    </h1>
    <button onclick="window.print()">Print</button>
  </div>

  <div class="page">

    <!-- Header -->
    <div class="head">
      <div></div>
      <div class="title">CUSTOMER ORDER FORM</div>
      <div class="cof-code">
        B1GSALES-COF-V01-2026__-___
        <span class="sub">COF No.: ${escapeHtml(po.po_number)}</span>
      </div>
    </div>

    <!-- SELECT BRAND -->
    <div class="brand-band">SELECT BRAND</div>

    <!-- Top info -->
    <div class="top-info">
      <div class="client-info">
        <div class="ci-label">Client Information</div>

        <div class="field-row">
          <div class="flabel">Client Name:</div>
          <div class="finput">${escapeHtml(clientName)}</div>
        </div>
        <div class="field-row">
          <div class="flabel">Trade Name:</div>
          <div class="finput">${escapeHtml(tradeName)}</div>
        </div>
        <div class="field-row">
          <div class="flabel">Vape Shop:</div>
          <div class="finput"></div>
        </div>
        <div class="field-row">
          <div class="flabel">TIN Number:</div>
          <div class="finput"></div>
        </div>
        <div class="field-row">
          <div class="flabel">Contact Number:</div>
          <div class="finput">${escapeHtml(contactNumber)}</div>
        </div>
        <div class="field-row">
          <div class="flabel">Address:</div>
          <div class="finput">${escapeHtml(address)}</div>
        </div>
        <div class="field-row">
          <div class="flabel">Delivery Address:</div>
          <div class="finput">${escapeHtml(address)}</div>
        </div>
      </div>

      <div class="meta-info">
        <div class="field-row">
          <div class="flabel">Date and Time Prepared:</div>
          <div class="finput">${escapeHtml(fmtDateTime(po.created_at || po.order_date))}</div>
        </div>
        <div class="field-row">
          <div class="flabel">Sales Account:</div>
          <div class="finput">${escapeHtml(contactPerson)}</div>
        </div>

        <div class="reason-box">
          <div class="rb-title">REASON</div>
          <div class="rb-body">
            <div>☐ &nbsp; Event</div>
            <div>☑ &nbsp; Client Order</div>
            <div>☐ &nbsp; Other: ______________________</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Main body -->
    <div class="main-body">
      <!-- LEFT: FLAVOR + DEVICE tables -->
      <div class="left-col">
        <table class="items-table flavor-table">
          <thead>
            <tr>
              <th colspan="4" class="section-title">FLAVOR</th>
            </tr>
            <tr>
              <th>FLAVOR</th>
              <th>QUANTITY</th>
              <th>UNIT PRICE</th>
              <th>TOTAL AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${flavorRowsHtml(flavors)}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL QUANTITY</td>
              <td class="ft-qty">${sumQty(flavors)}</td>
              <td>TOTAL AMOUNT</td>
              <td class="ft-total">${peso(sumAmt(flavors))}</td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td class="ft-discount">SP DISCOUNT</td>
              <td class="ft-total"></td>
            </tr>
          </tfoot>
        </table>

        <div style="height: 6px;"></div>

        <table class="items-table device-table">
          <thead>
            <tr>
              <th colspan="4" class="section-title">DEVICE</th>
            </tr>
            <tr>
              <th>DEVICE TYPE</th>
              <th>QUANTITY</th>
              <th>UNIT PRICE</th>
              <th>TOTAL AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${deviceRowsHtml(devices)}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL QUANTITY</td>
              <td class="ft-qty">${sumQty(devices)}</td>
              <td>TOTAL AMOUNT</td>
              <td class="ft-total">${peso(sumAmt(devices))}</td>
            </tr>
            <tr>
              <td colspan="2"></td>
              <td class="ft-discount">SP DISCOUNT</td>
              <td class="ft-total"></td>
            </tr>
          </tfoot>
        </table>

        ${otherSectionHtml}
      </div>

      <!-- RIGHT: Sidebar -->
      <div class="sidebar">
        <div class="side-block plain">
          <div class="sb-title">PRICING:</div>
          <div class="sb-row">☐ &nbsp; DSP</div>
          <div class="sb-row">☐ &nbsp; RSP</div>
          <div class="sb-row">☐ &nbsp; with SP</div>
          <div class="sb-row">☐ &nbsp; RAINDROP REWARDS</div>
        </div>

        <div class="side-block plain">
          <div class="sb-title">PAYMENT METHOD:</div>
          <div class="sb-row">☐ &nbsp; CASH</div>
          <div class="sb-row">☐ &nbsp; CHEQUE</div>
          <div class="sb-row">☐ &nbsp; BANK TRANSFER</div>
        </div>

        <div class="side-block">
          <div class="sb-title">PAYMENT TERMS:</div>
          <div class="empty-box"></div>
        </div>

        <div class="side-block plain bank">
          <div class="sb-title">BANK DETAILS:</div>
          <div class="bank-corp">B1G CORPORATION</div>
          <div class="bank-name">BDO</div>
          <div class="bank-acct">004738021691</div>
          <div class="bank-name">BPI</div>
          <div class="bank-acct">1761-011118</div>
          <div class="bank-name">PBCOM</div>
          <div class="bank-acct">238-10-1005743</div>
        </div>

        <div class="side-block plain">
          <div class="sb-title">DELIVERY METHOD:</div>
          <div class="sb-row">☐ &nbsp; SAME DAY DELIVERY (LALAMOVE, etc.)</div>
          <div class="sb-row">☐ &nbsp; COURIER PICK UP (LBC, etc.)</div>
          <div class="sb-row">☐ &nbsp; BUS SHIPPING</div>
          <div class="sb-row">☐ &nbsp; CARGO SHIPPING</div>
        </div>

        <div class="side-block">
          <div class="sb-title">OTHER DETAILS:</div>
          <div class="empty-box"></div>
        </div>
      </div>
    </div>

    <!-- Bottom -->
    <div class="bottom">
      <div class="remarks-box">
        <div class="rm-title">REMARKS:</div>
        <div class="rm-body">${escapeHtml(remarks)}</div>
      </div>

      <table class="totals">
        <tr>
          <td class="tlabel">TOTAL AMOUNT</td>
          <td class="tvalue">${peso(grand)}</td>
        </tr>
        <tr>
          <td class="tlabel">VATABLE SALES</td>
          <td class="tvalue">${peso(vatable)}</td>
        </tr>
        <tr>
          <td class="tlabel">12% VAT AMOUNT</td>
          <td class="tvalue">${peso(vat)}</td>
        </tr>
        <tr>
          <td class="tlabel">TOTAL AMOUNT</td>
          <td class="tvalue">${peso(grand)}</td>
        </tr>
        <tr>
          <td class="tlabel">TOTAL DISCOUNT (SP)</td>
          <td class="tvalue">${peso(discount)}</td>
        </tr>
        <tr>
          <td class="tlabel">DOWN PAYMENT (WILL BE DEDUCTED TO THE TOTAL PAYMENT)</td>
          <td class="tvalue">${peso(0)}</td>
        </tr>
        <tr class="tbold">
          <td class="tlabel">REMAINING BALANCE</td>
          <td class="tvalue">${peso(remaining)}</td>
        </tr>
      </table>
    </div>

    <div class="footer-note">Generated by B1G Ordering System</div>
  </div>
</body>
</html>`;
}
