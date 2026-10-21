export type MobileSalesStockRequestPdfLine = {
  brandName?: string | null;
  variantName?: string | null;
  requestedQuantity: number;
};

export type MobileSalesStockRequestPdfInput = {
  requestNumber: string;
  status?: string | null;
  requestedAt: string;
  requestedByName?: string | null;
  /** Person the stock is requested from. Blank when no person is stored. */
  requestedFromName?: string | null;
  leaderName?: string | null;
  notes?: string | null;
  denialReason?: string | null;
  /** Shown on the sheet. Falls back to the mobile-sales status labels. */
  statusLabel?: string | null;
  /** Browser-tab and toolbar title. */
  toolbarTitle?: string | null;
  /** Large heading on the page. */
  documentTitle?: string | null;
  footerNote?: string | null;
  lines: MobileSalesStockRequestPdfLine[];
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

export function mobileSalesRequestStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'approved_by_leader':
      return 'Pending Approval';
    case 'approved_by_admin':
    case 'fulfilled':
      return 'Approved';
    case 'rejected':
      return 'Denied';
    case 'mixed':
      return 'Mixed';
    default:
      return status?.trim() || 'Submitted';
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

function itemRowsHtml(lines: MobileSalesStockRequestPdfLine[]): string {
  const rows = lines.map((line) => {
    const name = `${line.brandName ? `${line.brandName} — ` : ''}${line.variantName || 'Item'}`;
    return `
      <tr>
        <td class="col-desc">${escapeHtml(name)}</td>
        <td class="col-qty">${fmtQty(line.requestedQuantity)}</td>
      </tr>`;
  });

  if (rows.length === 0) {
    rows.push(`
      <tr>
        <td class="col-desc">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
      </tr>`);
  }

  return rows.join('');
}

function detailField(label: string, valueHtml: string): string {
  return `
      <div class="delivery-field">
        <span class="flabel">${escapeHtml(label)}</span>
        <span class="fvalue">${valueHtml}</span>
      </div>`;
}

function buildRequestHtml(input: MobileSalesStockRequestPdfInput): string {
  const totalRequested = input.lines.reduce((sum, line) => sum + Number(line.requestedQuantity || 0), 0);
  const requestNo = escapeHtml(input.requestNumber?.trim() || '—');
  const requestedFromRaw = input.requestedFromName?.trim() || input.leaderName?.trim() || '';
  const leader = requestedFromRaw ? escapeHtml(requestedFromRaw) : '—';
  const status = escapeHtml(input.statusLabel?.trim() || mobileSalesRequestStatusLabel(input.status));
  const toolbarTitle = escapeHtml(input.toolbarTitle?.trim() || 'Stock Request');
  const documentTitle = escapeHtml(input.documentTitle?.trim() || 'STOCK REQUEST');
  const footerNote = escapeHtml(input.footerNote?.trim() || 'Stock request');
  const notes = input.notes?.trim()
    ? escapeHtml(input.notes.trim())
    : '<span class="muted">—</span>';
  const requestedBy = input.requestedByName?.trim()
    ? escapeHtml(input.requestedByName.trim())
    : '<span class="muted">—</span>';

  const denialBlock = input.denialReason?.trim()
    ? detailField('DENIAL REASON:', escapeHtml(input.denialReason.trim()))
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${toolbarTitle} – ${requestNo}</title>
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
    width: 90px;
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
    min-width: 140px;
    flex-shrink: 0;
  }
  .delivery-field .fvalue { flex: 1; }
  .delivery-field .muted { color: #777; font-style: italic; }
  .signature-field { align-items: flex-end; }
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
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1>${toolbarTitle}
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">Requested from: <span>${leader}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>

  <div class="page">
    <div class="doc-title">${documentTitle}</div>

    <div class="dr-number-row">
      <span class="label">REQUEST NUMBER:</span>
      <span class="value">${requestNo}</span>
    </div>
    <div class="meta-row return-to-row">
      <span class="label">REQUESTED FROM:</span>
      <span class="value">${leader}</span>
    </div>
    <div class="meta-row">
      <span class="label">STATUS:</span>
      <span class="value">${status}</span>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Description</th>
          <th class="col-qty">Requested</th>
        </tr>
      </thead>
      <tbody>
        ${itemRowsHtml(input.lines)}
      </tbody>
    </table>
    <div class="totals-note">
      Total requested: ${fmtQty(totalRequested)} unit(s).
    </div>

    <div class="delivery-section">
      <div class="section-label">Request Details:</div>
      ${detailField('REQUESTED FROM:', leader)}
      ${detailField('REQUESTED BY:', requestedBy)}
      ${detailField('REQUESTED AT:', escapeHtml(formatDateTime(input.requestedAt)))}
      ${detailField('NOTES:', notes)}
      ${denialBlock}
      ${detailField('SIGNATURE:', '<span class="sline"></span>')}
    </div>

    <div class="footer-note">
      ${footerNote} · ${escapeHtml(formatDateTime(new Date().toISOString()))}
    </div>
  </div>
</body>
</html>`;
}

/** Opens a printable Stock Request (HTML → Print / Save PDF). */
export function exportMobileSalesStockRequestPdf(input: MobileSalesStockRequestPdfInput): void {
  openPrintableHtml(buildRequestHtml(input));
}
