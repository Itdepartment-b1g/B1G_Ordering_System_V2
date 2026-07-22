import { supabase } from '@/lib/supabase';
import { getDrBankAccounts } from '@/features/finance/paymentSettingsUtils';
import type { BankAccount } from '@/types/database.types';
import type { PurchaseOrder } from '../types';

export type ReceiveReceiptLine = {
  brand_name?: string | null;
  variant_name?: string | null;
  quantity_dispatched: number;
  quantity_received: number;
  shortfall_reason?: string | null;
};

export type ReceiveReceiptPdfOptions = {
  drNumber: string;
  warehouseLocationId: string;
  warehouseLocationName: string;
  lines: ReceiveReceiptLine[];
  receivedAt?: string | null;
  buyerNotes?: string | null;
  buyerSignatureUrl?: string | null;
};

type DrReceiptInfo = {
  company_account_type?: string;
  key_account_client_id?: string | null;
  key_account?: {
    client_name: string;
    full_address: string;
    city: string;
    province: string;
    zip_code: string;
    contact_name: string;
    contact_phone: string;
  } | null;
  standard?: {
    company_name: string;
    contact_person: string;
    contact_phone: string;
    address: string;
    city: string;
    country: string;
  } | null;
  payment?: {
    company_name?: string;
    bank_transfer_enabled?: boolean;
    bank_accounts?: BankAccount[];
  } | null;
};

type DeliveryDetails = {
  clientOrCompany: string;
  addressLine: string;
  contactPerson: string;
  contactPhone: string;
};

async function fetchWarehousePaymentFallback(
  po: PurchaseOrder
): Promise<DrReceiptInfo['payment'] | null> {
  const companyId = po.warehouse_company_id;
  if (!companyId) return null;

  const [{ data: paymentRow }, { data: companyRow }] = await Promise.all([
    supabase
      .from('company_payment_settings')
      .select('bank_accounts, bank_transfer_enabled')
      .eq('company_id', companyId)
      .maybeSingle(),
    supabase.from('companies').select('company_name').eq('id', companyId).maybeSingle(),
  ]);

  if (!paymentRow && !companyRow) return null;

  return {
    company_name: companyRow?.company_name ?? '',
    bank_transfer_enabled: paymentRow?.bank_transfer_enabled ?? false,
    bank_accounts: (paymentRow?.bank_accounts as BankAccount[] | undefined) ?? [],
  };
}

async function fetchDrReceiptInfoFallback(po: PurchaseOrder): Promise<DrReceiptInfo> {
  const payment = await fetchWarehousePaymentFallback(po);
  return payment ? { payment } : {};
}

async function fetchDrReceiptInfo(po: PurchaseOrder): Promise<DrReceiptInfo> {
  try {
    const { data, error } = await supabase.rpc('get_po_dr_receipt_info', { p_po_id: po.id });
    if (error) {
      console.warn('[RR] get_po_dr_receipt_info error:', error);
      return await fetchDrReceiptInfoFallback(po);
    }
    const info = (data || {}) as DrReceiptInfo;
    if (!info.payment?.bank_accounts?.length) {
      const fallbackPayment = await fetchWarehousePaymentFallback(po);
      if (fallbackPayment) {
        info.payment = { ...info.payment, ...fallbackPayment };
      }
    }
    return info;
  } catch (e) {
    console.warn('[RR] get_po_dr_receipt_info exception:', e);
    return fetchDrReceiptInfoFallback(po);
  }
}

/**
 * Opens a Received Receipt HTML print view (same layout as Delivery Receipt).
 * Quantities reflect buyer-confirmed received amounts for this DR.
 */
export async function generateAndOpenReceiveReceiptPdf(
  po: PurchaseOrder,
  options: ReceiveReceiptPdfOptions
) {
  const receiptInfo = await fetchDrReceiptInfo(po);
  const html = buildReceiveReceiptHtml(po, options, receiptInfo);

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function escapeHtml(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtQty(n: number | null | undefined): string {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatWarehouseFooterLabel(locationName: string): string {
  const base = locationName.replace(/\s*\(Main\)\s*$/i, '').trim();
  if (!base) return 'B1G Warehouse';
  if (/^B1G\s/i.test(base) && /\bWarehouse\s*$/i.test(base)) return base;
  return `B1G ${base} Warehouse`;
}

function resolveCompanyAccountType(po: PurchaseOrder, info: DrReceiptInfo): string {
  return String(info.company_account_type || po.company_account_type || 'Standard Accounts');
}

function shouldHideWarehouseOnDr(po: PurchaseOrder, info: DrReceiptInfo): boolean {
  if (resolveCompanyAccountType(po, info) === 'Key Accounts') return true;
  if (po.key_account_client_id) return true;
  if (info.key_account_client_id) return true;
  return false;
}

function resolveDeliveryDetails(po: PurchaseOrder, info: DrReceiptInfo): DeliveryDetails {
  const acct = resolveCompanyAccountType(po, info);

  if (acct === 'Key Accounts' && info.key_account) {
    const ka = info.key_account;
    const addressParts = [ka.full_address, ka.city, ka.province, ka.zip_code].filter(Boolean);
    return {
      clientOrCompany: ka.client_name,
      addressLine: addressParts.join(', '),
      contactPerson: ka.contact_name,
      contactPhone: ka.contact_phone,
    };
  }

  if (info.standard) {
    const std = info.standard;
    const addressParts = [std.address, std.city, std.country].filter(Boolean);
    return {
      clientOrCompany: std.company_name,
      addressLine: addressParts.join(', '),
      contactPerson: std.contact_person,
      contactPhone: std.contact_phone,
    };
  }

  return {
    clientOrCompany: '',
    addressLine: '',
    contactPerson: '',
    contactPhone: '',
  };
}

function itemRowsHtml(lines: ReceiveReceiptLine[]): string {
  const rows = lines.map((r) => {
    const name = `${r.brand_name ? r.brand_name + ' — ' : ''}${r.variant_name || 'Item'}`;
    const short = Math.max(0, Number(r.quantity_dispatched || 0) - Number(r.quantity_received || 0));
    const reasonBit =
      short > 0 && r.shortfall_reason
        ? `<div class="line-variance">${escapeHtml(String(r.shortfall_reason))} · short ${fmtQty(short)}</div>`
        : short > 0
          ? `<div class="line-variance">Short ${fmtQty(short)} · under investigation</div>`
          : '';
    return `
      <tr>
        <td class="col-desc">${escapeHtml(name)}${reasonBit}</td>
        <td class="col-qty">${fmtQty(r.quantity_dispatched)}</td>
        <td class="col-qty">${fmtQty(r.quantity_received)}</td>
      </tr>`;
  });

  if (rows.length === 0) {
    rows.push(`
      <tr>
        <td class="col-desc">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
      </tr>`);
  }

  return rows.join('');
}

function bankSectionHtml(receiptInfo: DrReceiptInfo): string {
  const payment = receiptInfo.payment;
  const banks = getDrBankAccounts(payment ? { bank_accounts: payment.bank_accounts ?? [] } : null);

  if (banks.length === 0) return '';

  const companyName = payment?.company_name?.trim() || 'B1G CORPORATION';
  const cols = banks
    .map(
      (bank) => `
        <div>
          <div class="corp">${escapeHtml(companyName)}</div>
          <div class="bank-name">${escapeHtml(bank.name)}</div>
          <div class="bank-acct">${escapeHtml(bank.account_number)}</div>
        </div>`
    )
    .join('');

  return `
    <div class="bank-section">
      <div class="bank-title">BANK DETAILS:</div>
      <div class="bank-cols">
        ${cols}
      </div>
    </div>`;
}

function buildReceiveReceiptHtml(
  po: PurchaseOrder,
  options: ReceiveReceiptPdfOptions,
  receiptInfo: DrReceiptInfo
): string {
  const delivery = resolveDeliveryDetails(po, receiptInfo);
  const hideWarehouse = shouldHideWarehouseOnDr(po, receiptInfo);
  const whLabel = escapeHtml(options.warehouseLocationName);
  const whFooter = escapeHtml(formatWarehouseFooterLabel(options.warehouseLocationName));
  const drNo = escapeHtml(options.drNumber);
  const acct = resolveCompanyAccountType(po, receiptInfo);
  const recipientLabel = acct === 'Key Accounts' ? 'CLIENT' : 'COMPANY';
  const warehouseBadgeHtml = hideWarehouse
    ? ''
    : `<div class="warehouse-badge">Received from: <span>${whLabel}</span></div>`;
  const footerNoteHtml = hideWarehouse ? '' : `<div class="footer-note">${whFooter}</div>`;
  const bankSection = bankSectionHtml(receiptInfo);

  const totalDispatched = options.lines.reduce((s, l) => s + Number(l.quantity_dispatched || 0), 0);
  const totalReceived = options.lines.reduce((s, l) => s + Number(l.quantity_received || 0), 0);
  const shortfall = Math.max(0, totalDispatched - totalReceived);
  const reasonSummary = options.lines
    .filter((l) => (Number(l.quantity_dispatched) || 0) > (Number(l.quantity_received) || 0) && l.shortfall_reason)
    .map((l) => l.shortfall_reason)
    .filter(Boolean);
  const uniqueReasons = [...new Set(reasonSummary)];
  const varianceHtml =
    shortfall > 0
      ? `<div class="variance-note">Dispatched ${fmtQty(totalDispatched)} · Received ${fmtQty(totalReceived)} · Shortfall ${fmtQty(shortfall)} under warehouse investigation${
          uniqueReasons.length ? ` (${escapeHtml(uniqueReasons.join('; '))})` : ''
        }</div>`
      : `<div class="variance-note">Fully received: ${fmtQty(totalReceived)} unit(s)</div>`;

  const receivedAtHtml = options.receivedAt
    ? `<div class="delivery-field">
        <span class="flabel">RECEIVED AT:</span>
        <span class="fvalue">${escapeHtml(new Date(options.receivedAt).toLocaleString())}</span>
      </div>`
    : '';

  const notesHtml = `<div class="delivery-field">
        <span class="flabel">RECEIVE NOTES:</span>
        <span class="fvalue">${
          options.buyerNotes?.trim()
            ? escapeHtml(options.buyerNotes.trim())
            : '<span class="muted">—</span>'
        }</span>
      </div>`;

  const signatureImgHtml = options.buyerSignatureUrl
    ? `<img class="sig-img" src="${escapeHtml(options.buyerSignatureUrl)}" alt="Receiver signature" />`
    : `<span class="sline"></span>`;



  const poNo = escapeHtml(po.po_number || '');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Received Receipt</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #e5e5e5;
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    color: #000;
  }

  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center; gap: 12px;
    padding: 10px 16px;
    background: #111827; color: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  }
  .toolbar-left h1 { margin: 0; font-size: 13px; font-weight: 600; }
  .toolbar-left .hint { font-size: 11px; opacity: 0.75; display: block; margin-top: 2px; }
  .toolbar-center {
    text-align: center;
    justify-self: center;
  }
  .warehouse-badge {
    display: inline-block;
    background: #14532d;
    border: 1px solid #22c55e;
    color: #dcfce7;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 6px;
    letter-spacing: 0.02em;
  }
  .warehouse-badge span { color: #86efac; font-weight: 600; }
  .toolbar-right { justify-self: end; }
  .toolbar button {
    background: #22c55e; color: #000; border: 0;
    padding: 8px 16px; font-size: 13px; font-weight: 700;
    border-radius: 4px; cursor: pointer;
  }
  .toolbar button:hover { background: #16a34a; color: #fff; }

  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 16px auto;
    padding: 12mm 14mm 20mm;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    font-size: 11px;
    line-height: 1.35;
    color: #000;
    position: relative;
  }

  .logo-block { text-align: center; margin-bottom: 6px; }
  .logo-b1g {
    font-size: 42px;
    font-weight: 900;
    font-style: italic;
    letter-spacing: -2px;
    line-height: 1;
  }
  .logo-corp {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.35em;
    margin-top: 2px;
  }

  .doc-title {
    text-align: center;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.06em;
    margin: 10px 0 14px;
  }

  .dr-number-row {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 12px;
  }
  .dr-number-row .label { font-weight: 700; }
  .dr-number-row .value {
    min-width: 180px;
    border-bottom: 1.5px solid #000;
    font-weight: 700;
    font-family: ui-monospace, monospace;
    padding-bottom: 2px;
  }
  .po-number-row {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 11px;
  }
  .po-number-row .label { font-weight: 600; color: #444; }
  .po-number-row .value {
    min-width: 180px;
    font-family: ui-monospace, monospace;
    font-weight: 600;
  }

  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
  }
  .items-table thead th {
    text-align: left;
    font-weight: 800;
    font-size: 12px;
    padding: 6px 4px;
    border-bottom: 2px solid #000;
  }
  .items-table thead th.col-qty { text-align: right; }
  .items-table tbody td {
    padding: 7px 4px;
    border-bottom: 1px solid #ccc;
    vertical-align: top;
  }
  .items-table .col-qty {
    text-align: right;
    font-variant-numeric: tabular-nums;
    width: 90px;
  }

  .variance-note {
    font-size: 10px;
    font-weight: 600;
    margin-bottom: 14px;
    color: #333;
  }
  .line-variance {
    font-size: 9px;
    font-weight: 600;
    color: #8a5a00;
    margin-top: 2px;
  }

  .delivery-section {
    margin: 18px 0;
    padding-top: 8px;
    border-top: 1.5px solid #000;
  }
  .delivery-section .section-label {
    font-weight: 700;
    margin-bottom: 10px;
  }
  .delivery-field {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 11px;
  }
  .delivery-field .flabel {
    font-weight: 800;
    min-width: 120px;
    flex-shrink: 0;
  }
  .delivery-field .fvalue { flex: 1; }
  .delivery-field .muted { color: #777; font-style: italic; }
  .signature-field { align-items: flex-start; }
  .sig-img-large {
    display: block;
    max-height: 72px;
    max-width: 280px;
    object-fit: contain;
    border: 1px solid #ccc;
    background: #fff;
    padding: 4px;
  }
  .sig-img {
    display: block;
    max-height: 48px;
    max-width: 160px;
    object-fit: contain;
    margin-top: 2px;
  }

  .bank-section {
    margin: 28px 0 20px;
    text-align: center;
  }
  .bank-section .bank-title {
    font-weight: 800;
    text-decoration: underline;
    margin-bottom: 10px;
    font-size: 12px;
  }
  .bank-cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 12px;
    font-size: 10px;
    text-align: center;
  }
  .bank-cols .corp { font-weight: 700; margin-bottom: 4px; }
  .bank-cols .bank-name { font-weight: 700; margin-top: 6px; }
  .bank-cols .bank-acct { font-family: ui-monospace, monospace; }

  .signoff-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
    margin-top: 8px;
  }
  .signoff-table th,
  .signoff-table td {
    border: 1px solid #000;
    padding: 6px 8px;
    vertical-align: top;
  }
  .signoff-table .boxes-col { width: 18%; }
  .signoff-table .confirm-col { width: 42%; }
  .signoff-table .legal-col { width: 40%; font-size: 9px; line-height: 1.4; }
  .signoff-table .sub-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin-bottom: 6px;
    align-items: center;
  }
  .signoff-table .sub-row.sig-row {
    grid-template-columns: auto 1fr;
  }
  .signoff-table .sub-row .slabel { font-weight: 600; }
  .signoff-table .sub-row .sline {
    border-bottom: 1px solid #999;
    min-height: 16px;
  }

  .footer-note {
    text-align: center;
    font-size: 8px;
    color: #555;
    margin-top: 14px;
  }

  @media print {
    @page {
      size: A4 portrait;
      margin: 6mm;
    }
    html, body { background: #fff; }
    .toolbar { display: none !important; }
    .page {
      width: auto; min-height: auto;
      margin: 0; padding: 0;
      box-shadow: none;
    }
    .footer-note {
      margin-top: 10px;
    }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1>Received Receipt
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      ${warehouseBadgeHtml}
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>

  <div class="page">
    <div class="logo-block">
      <div class="logo-b1g">B1G</div>
      <div class="logo-corp">CORPORATION</div>
    </div>

    <div class="doc-title">RECEIVED RECEIPT</div>

    <div class="dr-number-row">
      <span class="label">DR NUMBER:</span>
      <span class="value">${drNo}</span>
    </div>
    <div class="po-number-row">
      <span class="label">PO NUMBER:</span>
      <span class="value">${poNo}</span>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Description</th>
          <th class="col-qty">Dispatched</th>
          <th class="col-qty">Received</th>
        </tr>
      </thead>
      <tbody>
        ${itemRowsHtml(options.lines)}
      </tbody>
    </table>
    ${varianceHtml}

    <div class="delivery-section">
      <div class="section-label">Receive Details:</div>
      ${
        delivery.clientOrCompany
          ? `<div class="delivery-field">
        <span class="flabel">${recipientLabel}:</span>
        <span class="fvalue">${escapeHtml(delivery.clientOrCompany)}</span>
      </div>`
          : ''
      }
      <div class="delivery-field">
        <span class="flabel">ADDRESS:</span>
        <span class="fvalue">${escapeHtml(delivery.addressLine)}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">CONTACT PERSON:</span>
        <span class="fvalue">${escapeHtml(delivery.contactPerson)}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">CONTACT #:</span>
        <span class="fvalue">${escapeHtml(delivery.contactPhone)}</span>
      </div>
      ${receivedAtHtml}
      ${notesHtml}
    </div>

    ${bankSection}

    <table class="signoff-table">
      <thead>
        <tr>
          <th class="boxes-col">Number of Boxes</th>
          <th class="confirm-col">Receiver confirmation</th>
          <th class="legal-col">I hereby acknowledged that the received quantities above are accurate and in good condition. No further claims will be accepted for the confirmed units on this receipt.</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="boxes-col" style="height: 80px;"></td>
          <td class="confirm-col">
            <div class="sub-row">
              <span class="slabel">Name of Client/representative</span>
              <span class="sline"></span>
            </div>
            <div class="sub-row sig-row">
              <span class="slabel">Signature:</span>
              ${signatureImgHtml}
            </div>
            <div class="sub-row">
              <span class="slabel">Date:</span>
              <span class="sline">${
                options.receivedAt
                  ? escapeHtml(new Date(options.receivedAt).toLocaleDateString())
                  : ''
              }</span>
            </div>
          </td>
          <td class="legal-col"></td>
        </tr>
      </tbody>
    </table>

    ${footerNoteHtml}
  </div>
</body>
</html>`;
}
