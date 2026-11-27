import type { Order, OrderItem } from './OrderContext';

export type OrderReceiptPdfOptions = {
  orderNumber: string;
  orderDate: string;
  clientName: string;
  agentName: string;
  items: OrderItem[];
  total: number;
  notes?: string | null;
  paymentSummary?: string | null;
  pricingStrategy?: string | null;
  statusLabel?: string | null;
};

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtQty(n: number | null | undefined): string {
  return Number(n || 0).toLocaleString();
}

function fmtMoney(n: number | null | undefined): string {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function typeLabel(type: string | null | undefined): string {
  if (!type?.trim()) return '';
  const key = type.trim().toLowerCase();
  if (key === 'foc' || key === 'posm' || key === 'ncv') return key.toUpperCase();
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function detailField(label: string, valueHtml: string): string {
  return `
      <div class="delivery-field">
        <span class="flabel">${escapeHtml(label)}</span>
        <span class="fvalue">${valueHtml}</span>
      </div>`;
}

function linesGroupedByBrand(items: OrderItem[]): OrderItem[] {
  return [...items].sort((a, b) => {
    const brandCmp = (a.brandName || '').localeCompare(b.brandName || '', undefined, {
      sensitivity: 'base',
    });
    if (brandCmp !== 0) return brandCmp;

    const variantCmp = (a.variantName || '').localeCompare(b.variantName || '', undefined, {
      sensitivity: 'base',
    });
    if (variantCmp !== 0) return variantCmp;

    return (a.variantType || '').localeCompare(b.variantType || '', undefined, {
      sensitivity: 'base',
    });
  });
}

function itemRowsHtml(items: OrderItem[]): string {
  const rows = linesGroupedByBrand(items).map((item) => {
    const type = typeLabel(item.variantType);
    const name = `${item.brandName ? `${item.brandName} — ` : ''}${item.variantName || 'Item'}${
      type ? ` (${type})` : ''
    }`;
    return `
      <tr>
        <td class="col-desc">${escapeHtml(name)}</td>
        <td class="col-qty">${fmtQty(item.quantity)}</td>
        <td class="col-check">&nbsp;</td>
      </tr>`;
  });

  if (rows.length === 0) {
    rows.push(`
      <tr>
        <td class="col-desc">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-check">&nbsp;</td>
      </tr>`);
  }

  return rows.join('');
}

function formatManilaNow(): string {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toLocaleString();
  }
}

function buildOrderReceiptHtml(options: OrderReceiptPdfOptions): string {
  const orderNo = escapeHtml(options.orderNumber?.trim() || '—');
  const clientName = escapeHtml(options.clientName?.trim() || '—');
  const agentName = escapeHtml(options.agentName?.trim() || '—');
  const orderDate = escapeHtml(
    options.orderDate ? new Date(options.orderDate).toLocaleDateString() : '—'
  );
  const payment = escapeHtml(options.paymentSummary?.trim() || '—');
  const pricing = escapeHtml(options.pricingStrategy?.trim() || '—');
  const status = escapeHtml(options.statusLabel?.trim() || '—');
  const totalUnits = (options.items || []).reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Client Order – ${orderNo}</title>
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
  .order-badge {
    display: inline-block;
    background: #1e3a5f;
    border: 1px solid #3b82f6;
    color: #dbeafe;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 6px;
  }
  .order-badge span { color: #93c5fd; font-weight: 600; }
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
  .items-table .col-check {
    width: 70px;
    min-height: 22px;
  }
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
      <h1>Client Order
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="order-badge">Order: <span>${orderNo}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>
  <div class="page">
    <div class="doc-title">CLIENT ORDER</div>
    <div class="meta-row">
      <span class="label">ORDER NO:</span>
      <span class="value">${orderNo}</span>
    </div>
    <div class="meta-row">
      <span class="label">CLIENT:</span>
      <span class="value">${clientName}</span>
    </div>
    <div class="meta-row">
      <span class="label">SALES AGENT:</span>
      <span class="value">${agentName}</span>
    </div>
    <div class="meta-row">
      <span class="label">DATE:</span>
      <span class="value">${orderDate}</span>
    </div>
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Description</th>
          <th class="col-qty">Qty</th>
          <th class="col-check"></th>
        </tr>
      </thead>
      <tbody>${itemRowsHtml(options.items || [])}</tbody>
    </table>
    <div class="totals-note">
      Total units: ${fmtQty(totalUnits)} · Total amount: ₱${fmtMoney(options.total)}
    </div>
    <div class="delivery-section">
      <div class="section-label">Order Details:</div>
      ${detailField('ORDER NO:', orderNo)}
      ${detailField('CLIENT:', clientName)}
      ${detailField('SALES AGENT:', agentName)}
      ${detailField('DATE:', orderDate)}
      ${detailField('PAYMENT:', payment)}
      ${detailField('PRICING:', pricing)}
      ${detailField('STATUS:', status)}
      ${detailField('TOTAL AMOUNT:', `₱${fmtMoney(options.total)}`)}
      ${detailField('SIGNATURE:', '<span class="sline"></span>')}
    </div>
    <div class="footer-note">Client order · ${escapeHtml(formatManilaNow())}</div>
  </div>
</body>
</html>`;
}

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

function paymentSummaryFromOrder(order: Order): string {
  if (order.paymentMode === 'SPLIT' && Array.isArray(order.paymentSplits) && order.paymentSplits.length > 0) {
    const parts = order.paymentSplits.map((split) => {
      if (split.method === 'BANK_TRANSFER') {
        return split.bank ? `Bank Transfer (${split.bank})` : 'Bank Transfer';
      }
      if (split.method === 'GCASH') return 'GCash';
      if (split.method === 'CASH') return 'Cash';
      if (split.method === 'CHEQUE') return 'Cheque';
      return split.method;
    });
    return `Split: ${parts.join(' + ')}`;
  }
  if (!order.paymentMethod) return 'N/A';
  if (order.paymentMethod === 'GCASH') return 'GCash';
  if (order.paymentMethod === 'BANK_TRANSFER') {
    return order.bankType ? `Bank Transfer (${order.bankType})` : 'Bank Transfer';
  }
  if (order.paymentMethod === 'CASH') return 'Cash';
  if (order.paymentMethod === 'CHEQUE') return 'Cheque';
  return order.paymentMethod;
}

function pricingLabelFromOrder(order: Order): string {
  if (order.pricingStrategy === 'special') return 'Special Pricing (Allocated)';
  if (order.pricingStrategy === 'dsp') return 'DSP Pricing';
  return 'RSP Pricing';
}

function statusLabelFromOrder(order: Order): string {
  const stage = order.stage || order.status;
  if (stage === 'needs_revision') return 'Needs Revision';
  if (stage === 'leader_approved') return 'Approved by Leader';
  if (stage === 'admin_approved' || order.status === 'approved') return 'Approved';
  if (stage === 'leader_rejected' || stage === 'admin_rejected' || order.status === 'rejected') {
    return 'Rejected';
  }
  return order.status || 'Pending';
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
    paymentSummary: paymentSummaryFromOrder(order),
    pricingStrategy: pricingLabelFromOrder(order),
    statusLabel: statusLabelFromOrder(order),
  });
}
