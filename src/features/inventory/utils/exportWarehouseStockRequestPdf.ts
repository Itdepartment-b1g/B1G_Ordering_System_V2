/**
 * Stock Request sheet — printable HTML for pending receive (before packing/expiry exist).
 * Opens in a new tab for Print → Save as PDF.
 */
import { supabase } from '@/lib/supabase';

export type StockRequestLinePdf = {
  brandName?: string | null;
  variantName?: string | null;
  orderedQuantity: number;
  receivedQuantity?: number;
};

export type StockRequestPdfOptions = {
  requestNumber: string;
  statusLabel: string;
  createdAt: string;
  expectedDeliveryDate?: string | null;
  createdByName?: string | null;
  notes?: string | null;
  lines: StockRequestLinePdf[];
  companyName?: string | null;
};

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtQty(n: number | null | undefined): string {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatDate(value: string | null | undefined): string {
  if (!value?.trim()) return '—';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value?.trim()) return '—';
  try {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
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
    console.warn('[WSR] company name fetch failed', e);
    return '';
  }
}

function itemRowsHtml(lines: StockRequestLinePdf[]): string {
  const rows = lines.map((line) => {
    const name = `${line.brandName ? `${line.brandName} — ` : ''}${line.variantName || 'Item'}`;

    return `
      <tr>
        <td class="col-desc">${escapeHtml(name)}</td>
        <td class="col-pack">&nbsp;</td>
        <td class="col-qty">${fmtQty(line.orderedQuantity)}</td>
        <td class="col-recv">&nbsp;</td>
        <td class="col-date">&nbsp;</td>
      </tr>`;
  });

  if (rows.length === 0) {
    rows.push(`
      <tr>
        <td class="col-desc">&nbsp;</td>
        <td class="col-pack">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-recv">&nbsp;</td>
        <td class="col-date">&nbsp;</td>
      </tr>`);
  }

  return rows.join('');
}

function buildStockRequestHtml(options: StockRequestPdfOptions, companyName: string): string {
  const requestNo = escapeHtml(options.requestNumber);
  const companyLabel = escapeHtml(companyName.trim() || options.companyName?.trim() || 'Warehouse');
  const totalOrdered = options.lines.reduce(
    (sum, line) => sum + Math.max(0, line.orderedQuantity),
    0
  );
  const logoUrl = escapeHtml(new URL('/logo/B1G_LOGO_BLACK.png', window.location.origin).toString());

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Stock Request — ${requestNo}</title>
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
  .toolbar-center { text-align: center; justify-self: center; }
  .warehouse-badge {
    display: inline-block;
    background: #14532d;
    border: 1px solid #22c55e;
    color: #dcfce7;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 6px;
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
    margin: 10px 0 6px;
  }
  .doc-subtitle {
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    color: #444;
    margin-bottom: 14px;
  }

  .meta-row {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 12px;
  }
  .meta-row .label { font-weight: 700; }
  .meta-row .value {
    min-width: 180px;
    border-bottom: 1.5px solid #000;
    font-weight: 700;
    font-family: ui-monospace, monospace;
    padding-bottom: 2px;
  }

  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin: 14px 0 8px;
  }
  .items-table thead th {
    text-align: left;
    font-weight: 800;
    font-size: 11px;
    padding: 6px 4px;
    border-bottom: 2px solid #000;
  }
  .items-table thead th.col-qty,
  .items-table thead th.col-recv { text-align: right; }
  .items-table tbody td {
    padding: 7px 4px;
    border-bottom: 1px solid #ccc;
    vertical-align: top;
  }
  .items-table .col-qty,
  .items-table .col-recv {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    width: 72px;
  }
  .items-table .col-qty { font-weight: 700; }
  .items-table .col-pack {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    width: 140px;
  }
  .items-table .col-date { width: 90px; white-space: nowrap; }

  .summary-note {
    font-size: 10px;
    font-weight: 600;
    margin-bottom: 14px;
    color: #333;
  }

  .delivery-section { margin-top: 18px; }
  .delivery-field {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 11px;
  }
  .delivery-field .flabel { font-weight: 700; }
  .delivery-field .fvalue { border-bottom: 1px solid #999; min-height: 16px; }
  .muted { color: #888; }

  .footer-note {
    margin-top: 28px;
    text-align: center;
    font-size: 10px;
    color: #555;
  }

  @media print {
    html, body { background: #fff; }
    .toolbar { display: none !important; }
    .page { margin: 0; box-shadow: none; width: auto; min-height: auto; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1>Stock Request</h1>
      <span class="hint">Print → Save as PDF</span>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">Warehouse: <span>${companyLabel}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print / Save PDF</button>
    </div>
  </div>

  <div class="page">
    <div class="logo-block">
      <img class="logo-img" src="${logoUrl}" alt="B1G Corporation" />
    </div>
    <div class="doc-title">STOCK REQUEST</div>
    <div class="doc-subtitle">${escapeHtml(options.statusLabel)}</div>

    <div class="meta-row">
      <span class="label">REQUEST NO:</span>
      <span class="value">${requestNo}</span>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Item</th>
          <th class="col-pack">Packing<br /><span style="font-weight:600;font-size:9px;color:#666">Boxes × Qty/box + Loose × Loose qty</span></th>
          <th class="col-qty">Ordered Qty</th>
          <th class="col-recv">Received Qty</th>
          <th class="col-date">Expiry</th>
        </tr>
      </thead>
      <tbody>
        ${itemRowsHtml(options.lines)}
      </tbody>
    </table>

    <div class="summary-note">
      Total ordered: ${fmtQty(totalOrdered)} unit(s)
    </div>

    <div class="delivery-section">
      <div class="delivery-field">
        <span class="flabel">CREATED AT:</span>
        <span class="fvalue">${escapeHtml(formatDateTime(options.createdAt))}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">CREATED BY:</span>
        <span class="fvalue">${
          options.createdByName?.trim()
            ? escapeHtml(options.createdByName.trim())
            : '<span class="muted">—</span>'
        }</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">EXPECTED DELIVERY:</span>
        <span class="fvalue">${escapeHtml(formatDate(options.expectedDeliveryDate))}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">NOTES:</span>
        <span class="fvalue">${
          options.notes?.trim()
            ? escapeHtml(options.notes.trim())
            : '<span class="muted">—</span>'
        }</span>
      </div>
    </div>

    <div class="footer-note">Main warehouse stock request · ${companyLabel}</div>
  </div>
</body>
</html>`;
}

export async function generateAndOpenStockRequestPdf(
  options: StockRequestPdfOptions
): Promise<void> {
  const companyName = options.companyName?.trim() || (await fetchCompanyName());
  const html = buildStockRequestHtml(options, companyName);

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
