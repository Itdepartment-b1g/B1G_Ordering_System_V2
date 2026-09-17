import {
  getReturnLeaderLineQty,
  returnLeaderStatusLabel,
  type ReturnLeaderHandover,
  type ReturnLeaderHandoverLine,
} from './returnLeaderApi';

export function generateAndOpenReturnLeaderPdf(row: ReturnLeaderHandover) {
  const html = buildReturnLeaderHtml(row);
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
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return escapeHtml(value);
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function lineDescription(line: ReturnLeaderHandoverLine): string {
  const brand = line.brandName?.trim();
  const variant = line.variantName?.trim() || 'Item';
  return brand ? `${brand} — ${variant}` : variant;
}

function lineRowsHtml(lines: ReturnLeaderHandoverLine[]): string {
  const rows = lines
    .filter((line) => (Number(line.quantity) || 0) > 0)
    .map(
      (line) => `
      <tr>
        <td class="col-desc">${escapeHtml(lineDescription(line))}</td>
        <td class="col-qty">${fmtQty(line.quantity)}</td>
        <td class="col-qty">${escapeHtml(line.variantType || '—')}</td>
      </tr>`
    );

  if (rows.length === 0) {
    rows.push(`
      <tr>
        <td class="col-desc">No returned items</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
      </tr>`);
  }

  return rows.join('');
}

function detailField(label: string, value: string | null | undefined): string {
  const trimmed = value?.trim();
  return `
    <div class="delivery-field">
      <span class="flabel">${escapeHtml(label)}:</span>
      <span class="fvalue">${
        trimmed ? escapeHtml(trimmed) : '<span class="muted">—</span>'
      }</span>
    </div>`;
}

function buildReturnLeaderHtml(row: ReturnLeaderHandover): string {
  const returnNo = escapeHtml(row.returnNumber);
  const status = escapeHtml(returnLeaderStatusLabel(row.status));
  const returnTo = escapeHtml(row.toHolderName?.trim() || 'Team Leader');
  const fromName = row.fromHolderName?.trim() || row.submittedByName;
  const qty = getReturnLeaderLineQty(row);
  const signatureHtml = row.agentSignatureUrl
    ? `<img class="sig-img" src="${escapeHtml(row.agentSignatureUrl)}" alt="Return signature" />`
    : `<span class="sline"></span>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Stock Return Receipt – ${returnNo}</title>
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
    font-family: ui-monospace, monospace;
    font-weight: 600;
  }
  .return-to-row .value {
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    font-weight: 700;
    border-bottom: 1.5px solid #000;
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
  .items-table thead th.col-qty { text-align: right; }
  .items-table tbody td {
    padding: 7px 4px;
    border-bottom: 1px solid #ccc;
    vertical-align: top;
  }
  .items-table .col-qty {
    text-align: right;
    font-variant-numeric: tabular-nums;
    width: 88px;
  }
  .totals-note {
    font-size: 10px;
    font-weight: 600;
    margin-bottom: 14px;
    color: #333;
  }
  .delivery-section {
    margin: 18px 0;
    padding-top: 8px;
    border-top: 1.5px solid #000;
  }
  .delivery-section .section-label { font-weight: 700; margin-bottom: 10px; }
  .delivery-field {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
    font-size: 11px;
  }
  .delivery-field .flabel {
    font-weight: 800;
    min-width: 140px;
    flex-shrink: 0;
  }
  .delivery-field .fvalue { flex: 1; }
  .delivery-field .muted { color: #777; font-style: italic; }
  .signature-field { align-items: flex-start; }
  .sig-img {
    display: block;
    max-height: 64px;
    max-width: 220px;
    object-fit: contain;
    margin-top: 2px;
  }
  .sline {
    display: inline-block;
    border-bottom: 1px solid #999;
    min-width: 160px;
    min-height: 16px;
  }
  .footer-note {
    text-align: center;
    font-size: 8px;
    color: #555;
    margin-top: 18px;
  }
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
      <h1>Stock Return Receipt
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">Return to: <span>${returnTo}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>
  <div class="page">
    <div class="doc-title">STOCK RETURN RECEIPT</div>
    <div class="dr-number-row">
      <span class="label">RETURN NUMBER:</span>
      <span class="value">${returnNo}</span>
    </div>
    <div class="meta-row return-to-row">
      <span class="label">RETURN TO:</span>
      <span class="value">${returnTo}</span>
    </div>
    <div class="meta-row">
      <span class="label">STATUS:</span>
      <span class="value">${status}</span>
    </div>
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Description</th>
          <th class="col-qty">Returned</th>
          <th class="col-qty">Type</th>
        </tr>
      </thead>
      <tbody>
        ${lineRowsHtml(row.lines)}
      </tbody>
    </table>
    <div class="totals-note">Total returned: ${fmtQty(qty)} unit(s)</div>
    <div class="delivery-section">
      <div class="section-label">Return Details:</div>
      ${detailField('FROM', fromName)}
      ${detailField('RETURN TO', row.toHolderName?.trim() || 'Team Leader')}
      ${detailField('SUBMITTED AT', formatDateTime(row.createdAt))}
      ${detailField('SUBMITTED BY', row.submittedByName)}
      ${
        row.status === 'received' && row.approvedByName
          ? detailField('RECEIVED BY', row.approvedByName)
          : ''
      }
      ${
        row.status === 'rejected'
          ? `${detailField('REJECTED BY', row.rejectedByName)}${detailField('REJECTION', row.rejectionNote)}`
          : ''
      }
      ${detailField('NOTES', row.notes)}
      <div class="delivery-field signature-field">
        <span class="flabel">SIGNATURE:</span>
        <span class="fvalue">${signatureHtml}</span>
      </div>
    </div>
    <div class="footer-note">
      Return to team leader · ${escapeHtml(formatDateTime(new Date().toISOString()))}
    </div>
  </div>
</body>
</html>`;
}
