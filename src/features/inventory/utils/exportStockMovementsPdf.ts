import { format } from 'date-fns';

import type { StockMovementRow } from '../stock-movements/stockMovementsApi';
import { formatStockMovementQtyDisplay } from '../stock-movements/stockMovementTypes';

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function qtyDisplay(row: StockMovementRow): string {
  return formatStockMovementQtyDisplay({
    quantity: row.quantity,
    direction: row.direction,
    fromLocationRaw: row.fromLocationRaw,
    toLocationRaw: row.toLocationRaw,
    fromQtyBefore: row.fromQtyBefore,
    fromQtyAfter: row.fromQtyAfter,
    toQtyBefore: row.toQtyBefore,
    toQtyAfter: row.toQtyAfter,
  });
}

function directionLabel(row: StockMovementRow): string {
  if (row.direction === 'in') return 'In';
  if (row.direction === 'out') return 'Out';
  if (row.direction === 'transfer') return 'Transfer';
  return '—';
}

function formatDateTime(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return escapeHtml(String(value));
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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

function buildHtml(opts: {
  rows: StockMovementRow[];
  scopeLabel?: string | null;
}): string {
  const when = formatDateTime(new Date());
  const scope = opts.scopeLabel?.trim() || 'All movements';
  const unitsIn = opts.rows
    .filter((row) => row.direction === 'in')
    .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const unitsOut = opts.rows
    .filter((row) => row.direction === 'out')
    .reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

  const rowsHtml = opts.rows
    .map((row) => {
      const typeCell = `
        <div class="type">${escapeHtml(row.typeLabel)}</div>
        <div class="desc">${escapeHtml(row.typeDescription)}</div>`;
      const productCell = row.variantType
        ? `${escapeHtml(row.productName)} <span class="muted">(${escapeHtml(row.variantType)})</span>`
        : escapeHtml(row.productName);
      const doneBy = row.performedByRoleTag
        ? `${escapeHtml(row.performedByName)} · ${escapeHtml(row.performedByRoleTag)}`
        : escapeHtml(row.performedByName);

      return `
      <tr>
        <td class="col-date">${escapeHtml(format(new Date(row.createdAt), 'MMM d, yyyy HH:mm'))}</td>
        <td class="col-desc">${typeCell}</td>
        <td class="col-qty">${escapeHtml(directionLabel(row))}</td>
        <td class="col-desc">${productCell}</td>
        <td class="col-qty">${escapeHtml(qtyDisplay(row))}</td>
        <td class="col-desc">${escapeHtml(row.fromLabel)}</td>
        <td class="col-desc">${escapeHtml(row.toLabel)}</td>
        <td class="col-desc">${doneBy}</td>
        <td class="col-desc">${escapeHtml(row.notes?.trim() || '—')}</td>
      </tr>`;
    })
    .join('');

  const emptyRow = `
      <tr>
        <td class="col-desc" colspan="9">No movements</td>
      </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Stock Movements</title>
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

  .table-caption {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 16px 0 4px;
  }
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 8px;
  }
  .items-table thead th {
    text-align: left;
    font-weight: 800;
    font-size: 10px;
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
    width: 64px;
    white-space: nowrap;
  }
  .items-table .col-date {
    width: 108px;
    white-space: nowrap;
    color: #333;
  }
  .items-table .type { font-weight: 700; }
  .items-table .desc { color: #555; margin-top: 2px; font-size: 10px; }
  .items-table .muted { color: #777; font-style: italic; }

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

  @media print and (orientation: landscape) {
    @page { size: A4 landscape; margin: 6mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1>Stock Movements
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">Scope: <span>${escapeHtml(scope)}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>

  <div class="page">
    <div class="doc-title">STOCK MOVEMENTS</div>

    <div class="dr-number-row">
      <span class="label">ROWS:</span>
      <span class="value">${opts.rows.length.toLocaleString()}</span>
    </div>
    <div class="meta-row">
      <span class="label">GENERATED:</span>
      <span class="value">${escapeHtml(when)}</span>
    </div>
    <div class="meta-row">
      <span class="label">SCOPE:</span>
      <span class="value">${escapeHtml(scope)}</span>
    </div>

    <div class="table-caption">Movements</div>
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-date">Date</th>
          <th class="col-desc">Type</th>
          <th class="col-qty">Dir</th>
          <th class="col-desc">Product</th>
          <th class="col-qty">Qty</th>
          <th class="col-desc">From</th>
          <th class="col-desc">To</th>
          <th class="col-desc">Done by</th>
          <th class="col-desc">Notes</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || emptyRow}
      </tbody>
    </table>
    <div class="totals-note">
      Total rows: ${opts.rows.length.toLocaleString()}
      · Units in: ${unitsIn.toLocaleString()}
      · Units out: ${unitsOut.toLocaleString()}
    </div>

    <div class="delivery-section">
      <div class="section-label">Report Details:</div>
      ${detailField('SCOPE', scope)}
      ${detailField('GENERATED AT', when)}
      ${detailField('ROW COUNT', String(opts.rows.length))}
    </div>

    <div class="footer-note">
      Stock movements · ${escapeHtml(when)}
    </div>
  </div>
</body>
</html>`;
}

export function exportStockMovementsPdf(opts: {
  rows: StockMovementRow[];
  scopeLabel?: string | null;
}): void {
  const html = buildHtml(opts);
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
