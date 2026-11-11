import { getRoleDisplayName } from '@/lib/roleUtils';

export type VariantStockHoldersPdfLine = {
  holderName: string;
  role: string;
  leaderName?: string | null;
  status: 'active' | 'inactive';
  qty: number;
};

export type VariantStockHoldersPdfInput = {
  brandName: string;
  variantName: string;
  variantType?: string | null;
  printedAt?: string | null;
  lines: VariantStockHoldersPdfLine[];
};

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtQty(n: number): string {
  return Number(n || 0).toLocaleString();
}

function detailField(label: string, valueHtml: string): string {
  return `
      <div class="delivery-field">
        <span class="flabel">${escapeHtml(label)}</span>
        <span class="fvalue">${valueHtml}</span>
      </div>`;
}

function roleCellHtml(line: VariantStockHoldersPdfLine): string {
  const roleLabel = escapeHtml(getRoleDisplayName(line.role));
  if (line.role !== 'mobile_sales') {
    return roleLabel;
  }
  const leader = escapeHtml(line.leaderName?.trim() || 'Unassigned');
  return `${roleLabel}<div class="sub">(Team Leader: ${leader})</div>`;
}

function itemRowsHtml(lines: VariantStockHoldersPdfLine[]): string {
  const rows = lines.map(
    (line) => `
      <tr>
        <td class="col-desc">${escapeHtml(line.holderName)}</td>
        <td class="col-role">${roleCellHtml(line)}</td>
        <td class="col-status">${escapeHtml(line.status === 'inactive' ? 'Inactive' : 'Active')}</td>
        <td class="col-qty">${fmtQty(line.qty)}</td>
        <td class="col-check">&nbsp;</td>
      </tr>`
  );

  if (rows.length === 0) {
    rows.push(`
      <tr>
        <td class="col-desc">&nbsp;</td>
        <td class="col-role">&nbsp;</td>
        <td class="col-status">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-check">&nbsp;</td>
      </tr>`);
  }

  return rows.join('');
}

function buildHtml(input: VariantStockHoldersPdfInput): string {
  const when = escapeHtml(formatDateTime(input.printedAt || new Date().toISOString()));
  const brand = escapeHtml(input.brandName.trim() || '—');
  const variantLabel = escapeHtml(
    `${input.variantName.trim() || '—'}${
      input.variantType?.trim() ? ` (${input.variantType.trim()})` : ''
    }`
  );
  const brandVariant = `${input.brandName.trim() || '—'} - ${input.variantName.trim() || '—'}`;

  let totalStock = 0;
  let teamLeaderStock = 0;
  let mobileSalesStock = 0;
  for (const line of input.lines) {
    totalStock += line.qty;
    if (line.role === 'team_leader') teamLeaderStock += line.qty;
    else if (line.role === 'mobile_sales') mobileSalesStock += line.qty;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Stock Holders – ${escapeHtml(brandVariant)}</title>
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
    background: #1e3a5f;
    border: 1px solid #3b82f6;
    color: #dbeafe;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 6px;
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
  }
  .doc-title {
    text-align: center;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.06em;
    margin: 10px 0 14px;
  }
  .meta-row {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
    font-size: 11px;
  }
  .meta-row .label { font-weight: 600; color: #444; }
  .meta-row .value {
    min-width: 180px;
    font-weight: 700;
    border-bottom: 1.5px solid #000;
    padding-bottom: 2px;
  }
  .items-table { width: 100%; border-collapse: collapse; margin: 14px 0 8px; }
  .items-table thead th {
    text-align: left;
    font-weight: 800;
    font-size: 11px;
    padding: 6px 4px;
    border-bottom: 2px solid #000;
  }
  .items-table thead th.col-qty { text-align: right; }
  .items-table tbody td { padding: 10px 4px; border-bottom: 1px solid #ccc; vertical-align: middle; }
  .items-table .col-qty {
    text-align: right;
    font-variant-numeric: tabular-nums;
    width: 90px;
  }
  .items-table .col-status { width: 90px; }
  .items-table .col-check {
    width: 70px;
    min-height: 22px;
  }
  .items-table .sub { font-size: 10px; color: #555; margin-top: 2px; }
  .totals-note { font-size: 10px; font-weight: 600; margin-bottom: 14px; color: #333; }
  .delivery-section { margin: 18px 0; padding-top: 8px; border-top: 1.5px solid #000; }
  .delivery-section .section-label { font-weight: 700; margin-bottom: 10px; }
  .delivery-field { display: flex; gap: 8px; margin-bottom: 6px; font-size: 11px; }
  .delivery-field .flabel { font-weight: 800; min-width: 140px; flex-shrink: 0; }
  .delivery-field .fvalue { flex: 1; }
  .sline { display: inline-block; border-bottom: 1px solid #999; min-width: 160px; min-height: 16px; }
  .footer-note { text-align: center; font-size: 8px; color: #555; margin-top: 18px; }
  @media print {
    @page { size: A4 portrait; margin: 6mm; }
    html, body { background: #fff; }
    .toolbar { display: none !important; }
    .page { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1>Stock Holders
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">${brand} <span>- ${escapeHtml(input.variantName.trim() || '—')}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>
  <div class="page">
    <div class="doc-title">STOCK HOLDERS</div>
    <div class="meta-row">
      <span class="label">BRAND:</span>
      <span class="value">${brand}</span>
    </div>
    <div class="meta-row">
      <span class="label">VARIANT:</span>
      <span class="value">${variantLabel}</span>
    </div>
    <div class="meta-row">
      <span class="label">DATE:</span>
      <span class="value">${when}</span>
    </div>
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Name</th>
          <th class="col-role">Role</th>
          <th class="col-status">Status</th>
          <th class="col-qty">Qty</th>
          <th class="col-check"></th>
        </tr>
      </thead>
      <tbody>${itemRowsHtml(input.lines)}</tbody>
    </table>
    <div class="totals-note">Total held: ${fmtQty(totalStock)} unit(s)</div>
    <div class="delivery-section">
      <div class="section-label">Stock Holder Details:</div>
      ${detailField('BRAND:', brand)}
      ${detailField('VARIANT:', variantLabel)}
      ${detailField('DATE:', when)}
      ${detailField('TOTAL STOCK:', fmtQty(totalStock))}
      ${detailField('TEAM LEADER STOCK:', fmtQty(teamLeaderStock))}
      ${detailField('MOBILE SALES STOCK:', fmtQty(mobileSalesStock))}
      ${detailField('SIGNATURE:', '<span class="sline"></span>')}
    </div>
    <div class="footer-note">Stock holders · ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
  </div>
</body>
</html>`;
}

export function exportVariantStockHoldersPdf(input: VariantStockHoldersPdfInput): void {
  const html = buildHtml(input);
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
