import type { Order, OrderItem } from './OrderContext';

export type OrderReceiptPdfOptions = {
  orderNumber: string;
  orderDate: string;
  clientName: string;
  agentName: string;
  items: OrderItem[];
  total: number;
  notes?: string | null;
};

export function generateAndOpenOrderReceiptPdf(options: OrderReceiptPdfOptions) {
  const html = buildOrderReceiptHtml(options);
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

function fmtMoney(n: number | null | undefined): string {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: number | null | undefined): string {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function itemRowsHtml(items: OrderItem[]): string {
  const rows = items.map((item) => `
      <tr>
        <td class="col-brand">${escapeHtml(item.brandName || '—')}</td>
        <td class="col-variant">${escapeHtml(item.variantName || '—')}</td>
        <td class="col-qty">${fmtQty(item.quantity)}</td>
        <td class="col-qty money">₱${fmtMoney(item.unitPrice)}</td>
        <td class="col-qty money">₱${fmtMoney(item.total)}</td>
      </tr>`);

  if (rows.length === 0) {
    rows.push(`
      <tr>
        <td class="col-brand">&nbsp;</td>
        <td class="col-variant">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
      </tr>`);
  }

  return rows.join('');
}

function buildOrderReceiptHtml(options: OrderReceiptPdfOptions): string {
  const orderNo = escapeHtml(options.orderNumber);
  const orderDate = escapeHtml(new Date(options.orderDate).toLocaleDateString());
  const clientName = escapeHtml(options.clientName);
  const agentName = escapeHtml(options.agentName);

  const notesHtml = options.notes?.trim()
    ? `<div class="notes-box">
        <div class="notes-label">Notes</div>
        <div class="notes-text">${escapeHtml(options.notes.trim())}</div>
      </div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Order Receipt - ${orderNo}</title>
<style>
  :root {
    color-scheme: light;
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --line-strong: #0f172a;
    --surface: #f8fafc;
    --accent: #14532d;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #e2e8f0;
    font-family: "Segoe UI", Arial, "Helvetica Neue", Helvetica, sans-serif;
    color: var(--ink);
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
  .toolbar-center { text-align: center; font-size: 11px; opacity: 0.8; }
  .toolbar-right { justify-self: end; }
  .toolbar button {
    background: #22c55e; color: #000; border: 0;
    padding: 8px 16px; font-size: 13px; font-weight: 700;
    border-radius: 4px; cursor: pointer;
  }
  .toolbar button:hover { background: #16a34a; color: #fff; }

  .page {
    width: 210mm;
    margin: 16px auto;
    padding: 14mm 16mm 16mm;
    background: #fff;
    box-shadow: 0 4px 24px rgba(15,23,42,0.12);
    font-size: 11px;
    line-height: 1.45;
    color: var(--ink);
  }

  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    padding-bottom: 16px;
    margin-bottom: 18px;
    border-bottom: 2px solid var(--line-strong);
  }
  .doc-title-block { flex: 1; }
  .doc-title {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin: 0 0 4px;
    line-height: 1.1;
  }
  .doc-subtitle {
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .meta-panel {
    min-width: 240px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px 14px;
  }
  .meta-item {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 8px;
    align-items: baseline;
    margin-bottom: 8px;
    font-size: 11px;
  }
  .meta-item:last-child { margin-bottom: 0; }
  .meta-item .label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .meta-item .value {
    font-weight: 700;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    word-break: break-all;
  }

  .parties-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin-bottom: 20px;
  }
  .party-card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px 14px;
  }
  .party-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: var(--muted);
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .party-name {
    font-size: 13px;
    font-weight: 700;
    line-height: 1.3;
  }

  .section-title {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .items-table thead th {
    text-align: left;
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--muted);
    padding: 10px 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }
  .items-table thead th.col-qty { text-align: right; }
  .items-table tbody td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
    font-size: 11px;
  }
  .items-table tbody tr:last-child td { border-bottom: 0; }
  .items-table .col-brand { font-weight: 600; }
  .items-table .col-variant { color: #334155; }
  .items-table .col-qty {
    text-align: right;
    font-variant-numeric: tabular-nums;
    width: 72px;
    white-space: nowrap;
  }
  .items-table .col-qty.money { font-weight: 600; }

  .summary-wrap {
    display: flex;
    justify-content: flex-end;
    margin-top: 14px;
  }
  .summary-box {
    min-width: 280px;
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    padding: 10px 14px;
    background: transparent;
  }
  .summary-row .label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #444;
  }
  .summary-row .value {
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }

  .notes-box {
    margin-top: 18px;
    padding: 12px 14px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
  }
  .notes-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #92400e;
    margin-bottom: 4px;
  }
  .notes-text { font-size: 11px; color: #78350f; line-height: 1.5; }

  @media print {
    @page { size: A4 portrait; margin: 8mm; }
    html, body { background: #fff; }
    .toolbar { display: none !important; }
    .page {
      width: auto; margin: 0; padding: 0;
      box-shadow: none;
    }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1>Order Receipt
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">${orderNo}</div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>

  <div class="page">
    <div class="doc-header">
      <div class="doc-title-block">
        <h1 class="doc-title">SALES ORDER</h1>
        <div class="doc-subtitle">Client Order Summary</div>
      </div>
      <div class="meta-panel">
        <div class="meta-item">
          <span class="label">Order No.</span>
          <span class="value">${orderNo}</span>
        </div>
        <div class="meta-item">
          <span class="label">Order Date</span>
          <span class="value">${orderDate}</span>
        </div>
      </div>
    </div>

    <div class="parties-grid">
      <div class="party-card">
        <div class="party-label">Client</div>
        <div class="party-name">${clientName}</div>
      </div>
      <div class="party-card">
        <div class="party-label">Sales Agent</div>
        <div class="party-name">${agentName}</div>
      </div>
    </div>

    <div class="section-title">Order Items</div>

    <table class="items-table">
      <thead>
        <tr>
          <th class="col-brand">Brand</th>
          <th class="col-variant">Variant</th>
          <th class="col-qty">Qty</th>
          <th class="col-qty">Unit Price</th>
          <th class="col-qty">Total</th>
        </tr>
      </thead>
      <tbody>${itemRowsHtml(options.items)}</tbody>
    </table>

    <div class="summary-wrap">
      <div class="summary-box">
        <div class="summary-row">
          <span class="label">Total Amount</span>
          <span class="value">₱${fmtMoney(options.total)}</span>
        </div>
      </div>
    </div>

    ${notesHtml}
  </div>
</body>
</html>`;
}

/** Opens a printable order receipt from a saved Order record. */
export function generateAndOpenOrderReceiptFromOrder(order: Order) {
  generateAndOpenOrderReceiptPdf({
    orderNumber: order.orderNumber,
    orderDate: order.date,
    clientName: order.clientName,
    agentName: order.agentName,
    items: order.items ?? [],
    total: order.total,
    notes: order.notes || null,
  });
}
