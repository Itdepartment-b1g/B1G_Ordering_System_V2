import { format } from 'date-fns';

import { supabase } from '@/lib/supabase';

import type { PhysicalCountHistoryDetail } from '../types';
import { formatLotDate } from './formatLotDate';

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtQty(value: number): string {
  return Number(value).toLocaleString();
}

function formatOptionalQty(value: number | null | undefined): string {
  if (value == null) return '—';
  return fmtQty(value);
}

function formatLoose(
  looseBoxCount: number | null | undefined,
  looseQty: number | null | undefined
): string {
  const hasLoose =
    (looseBoxCount != null && looseBoxCount > 0) || (looseQty != null && looseQty > 0);
  if (!hasLoose) return '—';
  return `${formatOptionalQty(looseBoxCount)} × ${formatOptionalQty(looseQty)}`;
}

function formatVariance(value: number): string {
  return `${value > 0 ? '+' : ''}${fmtQty(value)}`;
}

function formatCountedAt(iso: string): string {
  try {
    return format(new Date(iso), 'MMM d, yyyy h:mm a');
  } catch {
    return iso;
  }
}

function formatWarehouseFooterLabel(locationName: string): string {
  const base = locationName.replace(/\s*\(Main\)\s*$/i, '').trim();
  if (!base) return 'B1G Warehouse';
  if (/^B1G\s/i.test(base) && /\bWarehouse\s*$/i.test(base)) return base;
  return `B1G ${base} Warehouse`;
}

async function fetchCompanyName(): Promise<string> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return '';

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', uid)
      .maybeSingle();

    const companyId = profile?.company_id as string | null | undefined;
    if (!companyId) return '';

    const { data: companyRow } = await supabase
      .from('companies')
      .select('company_name')
      .eq('id', companyId)
      .maybeSingle();

    return (companyRow?.company_name as string | undefined)?.trim() || '';
  } catch (e) {
    console.warn('[physical count receipt] company name fetch failed', e);
    return '';
  }
}

function openPrintableHtml(html: string): void {
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

function lineDescription(line: PhysicalCountHistoryDetail['lines'][number]): string {
  const brand = line.brand_name?.trim();
  const variant = line.variant_name?.trim() || '—';
  const base = brand ? `${brand} — ${variant}` : variant;
  const exp = formatLotDate(line.expiration_date);
  if (!exp || exp === '—') return base;
  return `${base} (Exp: ${exp})`;
}

function buildPhysicalCountReceiptHtml(
  detail: PhysicalCountHistoryDetail,
  companyName: string
): string {
  const batchNumber = detail.batch?.batch_number ?? '—';
  const locationName = detail.warehouse_location?.name ?? '—';
  const countedAt = formatCountedAt(detail.counted_at);
  const countedBy =
    detail.performed_by_user?.full_name ?? detail.performed_by_name ?? 'Unknown';
  const companyLabel = companyName.trim() || locationName;
  const whLabel = escapeHtml(locationName);
  const whFooter = escapeHtml(formatWarehouseFooterLabel(locationName));
  const logoUrl = escapeHtml(
    new URL('/logo/B1G_LOGO_BLACK.png', window.location.origin).toString()
  );
  const title = `Physical Count Receipt – ${batchNumber}`;

  const totals = detail.lines.reduce(
    (acc, line) => {
      acc.system += line.system_qty_snapshot || 0;
      acc.boxes += line.box_count ?? 0;
      acc.physical += line.physical_qty || 0;
      acc.variance += line.variance || 0;
      return acc;
    },
    { system: 0, boxes: 0, physical: 0, variance: 0 }
  );

  const itemRows =
    detail.lines.length > 0
      ? detail.lines
          .map(
            (line) => `
        <tr>
          <td class="col-desc">${escapeHtml(lineDescription(line))}</td>
          <td class="col-qty">${escapeHtml(fmtQty(line.system_qty_snapshot))}</td>
          <td class="col-qty">${escapeHtml(formatOptionalQty(line.box_count))}</td>
          <td class="col-qty">${escapeHtml(formatOptionalQty(line.units_per_box))}</td>
          <td class="col-qty">${escapeHtml(formatLoose(line.loose_box_count, line.loose_qty))}</td>
          <td class="col-qty">${escapeHtml(fmtQty(line.physical_qty))}</td>
          <td class="col-qty">${escapeHtml(formatVariance(line.variance))}</td>
          <td class="col-blank">&nbsp;</td>
        </tr>`
          )
          .join('')
      : `<tr>
          <td class="col-desc">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
          <td class="col-blank">&nbsp;</td>
        </tr>`;

  const totalsRow = `
        <tr class="totals-row">
          <td class="col-desc">TOTALS</td>
          <td class="col-qty">${escapeHtml(fmtQty(totals.system))}</td>
          <td class="col-qty">${escapeHtml(fmtQty(totals.boxes))}</td>
          <td class="col-qty">—</td>
          <td class="col-qty">—</td>
          <td class="col-qty">${escapeHtml(fmtQty(totals.physical))}</td>
          <td class="col-qty">${escapeHtml(formatVariance(totals.variance))}</td>
          <td class="col-blank">&nbsp;</td>
        </tr>`;

  const signatureImgHtml = detail.signature_url
    ? `<img class="sig-img" src="${escapeHtml(detail.signature_url)}" alt="Counter signature" />`
    : `<span class="sline" style="display:block;min-height:48px;"></span>`;

  const notesField = detail.notes
    ? `<div class="delivery-field">
        <span class="flabel">NOTES:</span>
        <span class="fvalue">${escapeHtml(detail.notes)}</span>
      </div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
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
    background: #1e3a5f;
    border: 1px solid #3b82f6;
    color: #dbeafe;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 6px;
    letter-spacing: 0.02em;
  }
  .warehouse-badge span { color: #93c5fd; font-weight: 600; }
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
  .logo-img {
    display: block;
    max-width: 180px;
    max-height: 52px;
    margin: 0 auto;
    object-fit: contain;
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
    margin-bottom: 12px;
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

  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
  }
  .items-table thead th {
    text-align: left;
    font-weight: 800;
    font-size: 10px;
    padding: 6px 3px;
    border-bottom: 2px solid #000;
    white-space: nowrap;
  }
  .items-table thead th.col-qty,
  .items-table thead th.col-blank { text-align: right; }
  .items-table tbody td {
    padding: 6px 3px;
    border-bottom: 1px solid #ccc;
    vertical-align: top;
    font-size: 10px;
  }
  .items-table .col-desc { width: auto; }
  .items-table .col-qty {
    text-align: right;
    font-variant-numeric: tabular-nums;
    width: 52px;
  }
  .items-table .col-blank {
    text-align: right;
    width: 72px;
    min-height: 22px;
  }
  .items-table .totals-row td {
    font-weight: 800;
    border-top: 2px solid #000;
    border-bottom: 1px solid #000;
    padding-top: 8px;
    padding-bottom: 8px;
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

  .signoff-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
    margin-top: 24px;
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
  }
  .signoff-table .sub-row .slabel { font-weight: 600; }
  .signoff-table .sub-row .sline {
    border-bottom: 1px solid #999;
    min-height: 16px;
  }
  .sig-img {
    display: block;
    max-height: 72px;
    max-width: 100%;
    margin-top: 4px;
    background: #fff;
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
      <h1>Physical Count Receipt
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">Count at: <span>${whLabel}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>

  <div class="page">
    <div class="logo-block">
      <img class="logo-img" src="${logoUrl}" alt="B1G Corporation" />
    </div>

    <div class="doc-title">PHYSICAL COUNT RECEIPT</div>

    <div class="dr-number-row">
      <span class="label">BATCH:</span>
      <span class="value">${escapeHtml(batchNumber)}</span>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Description</th>
          <th class="col-qty">System</th>
          <th class="col-qty">Boxes</th>
          <th class="col-qty">Qty/box</th>
          <th class="col-qty">Loose</th>
          <th class="col-qty">Physical Qty</th>
          <th class="col-qty">Net Variance</th>
          <th class="col-blank">&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        ${detail.lines.length > 0 ? totalsRow : ''}
      </tbody>
    </table>

    <div class="delivery-section">
      <div class="section-label">Count Details:</div>
      <div class="delivery-field">
        <span class="flabel">COMPANY:</span>
        <span class="fvalue">${escapeHtml(companyLabel)}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">LOCATION:</span>
        <span class="fvalue">${whLabel}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">COUNTED BY:</span>
        <span class="fvalue">${escapeHtml(countedBy)}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">COUNTED AT:</span>
        <span class="fvalue">${escapeHtml(countedAt)}</span>
      </div>
      ${notesField}
    </div>

    <table class="signoff-table">
      <thead>
        <tr>
          <th class="boxes-col">Lines / Net variance</th>
          <th class="confirm-col">Counter confirmation</th>
          <th class="legal-col">I hereby acknowledge that the physical count details above are accurate. Variances are for audit only; system stock is not changed automatically.</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="boxes-col" style="height: 80px;">
            ${escapeHtml(detail.line_count ?? detail.lines.length)} line(s)<br />
            Net variance: ${escapeHtml(
              `${detail.total_variance > 0 ? '+' : ''}${detail.total_variance}`
            )}
          </td>
          <td class="confirm-col">
            <div class="sub-row">
              <span class="slabel">Name</span>
              <span class="sline">${escapeHtml(countedBy)}</span>
            </div>
            <div class="sub-row">
              <span class="slabel">Signature:</span>
              <span class="sline"></span>
            </div>
            ${signatureImgHtml}
            <div class="sub-row" style="margin-top:8px;">
              <span class="slabel">Date:</span>
              <span class="sline">${escapeHtml(countedAt)}</span>
            </div>
          </td>
          <td class="legal-col"></td>
        </tr>
      </tbody>
    </table>

    <div class="footer-note">${whFooter}</div>
  </div>
</body>
</html>`;
}

export async function exportPhysicalCountPdf(
  detail: PhysicalCountHistoryDetail
): Promise<void> {
  const companyName = await fetchCompanyName();
  openPrintableHtml(buildPhysicalCountReceiptHtml(detail, companyName));
}
