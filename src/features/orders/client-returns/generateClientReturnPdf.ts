import {
  formatClientReturnPeso,
  formatClientReturnReason,
  formatClientReturnStatus,
  formatClientReturnStockFate,
  formatClientReturnType,
  getClientReturnRefundAmount,
  type PreviewClientReturn,
  type PreviewClientReturnLine,
} from './clientReturnPreview';

export function generateAndOpenClientReturnPdf(row: PreviewClientReturn) {
  const html = buildClientReturnHtml(row);
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

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return escapeHtml(value);
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function lineDescription(line: PreviewClientReturnLine): string {
  const brand = line.brandName?.trim();
  const variant = line.variantName?.trim() || 'Item';
  return brand ? `${brand} — ${variant}` : variant;
}

function withQty(lines: PreviewClientReturnLine[]): PreviewClientReturnLine[] {
  return lines.filter((line) => (Number(line.quantity) || 0) > 0);
}

function lineAmount(line: PreviewClientReturnLine): string {
  const total = Number(line.lineTotal);
  if (Number.isFinite(total) && total > 0) return formatClientReturnPeso(total);
  const unit = Number(line.unitPrice);
  const qty = Number(line.quantity) || 0;
  if (Number.isFinite(unit) && unit > 0 && qty > 0) return formatClientReturnPeso(unit * qty);
  return '—';
}

function lineRowsHtml(
  lines: PreviewClientReturnLine[],
  emptyLabel: string,
  showAmount: boolean,
  showStockFate: boolean
): string {
  const rows = lines.map((line) => {
    return `
      <tr>
        <td class="col-desc">${escapeHtml(lineDescription(line))}</td>
        <td class="col-qty">${fmtQty(line.quantity)}</td>
        <td class="col-qty">${escapeHtml(line.variantType || '—')}</td>
        ${showStockFate ? `<td class="col-qty">${escapeHtml(formatClientReturnStockFate(line.stockFate))}</td>` : ''}
        ${showAmount ? `<td class="col-qty">${escapeHtml(lineAmount(line))}</td>` : ''}
      </tr>`;
  });

  if (rows.length === 0) {
    rows.push(`
      <tr>
        <td class="col-desc">${escapeHtml(emptyLabel)}</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        ${showStockFate ? '<td class="col-qty">&nbsp;</td>' : ''}
        ${showAmount ? '<td class="col-qty">&nbsp;</td>' : ''}
      </tr>`);
  }

  return rows.join('');
}

function itemsTableHtml({
  title,
  qtyLabel,
  lines,
  emptyLabel,
  showAmount = true,
  showStockFate = false,
}: {
  title: string;
  qtyLabel: string;
  lines: PreviewClientReturnLine[];
  emptyLabel: string;
  showAmount?: boolean;
  showStockFate?: boolean;
}): string {
  return `
    <div class="table-caption">${escapeHtml(title)}</div>
    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Description</th>
          <th class="col-qty">${escapeHtml(qtyLabel)}</th>
          <th class="col-qty">Type</th>
          ${showStockFate ? '<th class="col-qty">Stock</th>' : ''}
          ${showAmount ? '<th class="col-qty">Amount</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${lineRowsHtml(lines, emptyLabel, showAmount, showStockFate)}
      </tbody>
    </table>`;
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

function buildClientReturnHtml(row: PreviewClientReturn): string {
  const returnNo = escapeHtml(row.returnNumber);
  const orderNo = escapeHtml(row.orderNumber);
  const kind = formatClientReturnType(row.returnType);
  const status = formatClientReturnStatus(row.status);
  const returnedLines = withQty(row.lines);
  const changeLines = withQty(row.changeLines || []);
  const showChanged = row.returnType === 'change_item' || changeLines.length > 0;
  const returnedQty = returnedLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const changedQty = changeLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const refundAmount =
    row.returnType === 'refund' ? formatClientReturnPeso(getClientReturnRefundAmount(row)) : null;
  const returnedTable = itemsTableHtml({
    title: 'Returned',
    qtyLabel: 'Returned',
    lines: returnedLines,
    emptyLabel: 'No returned items',
    showStockFate: true,
  });
  const changedTable = showChanged
    ? `${itemsTableHtml({
        title: 'Changed',
        qtyLabel: 'Changed',
        lines: changeLines,
        emptyLabel: 'No changed items',
        showAmount: false,
      })}
    <div class="totals-note">
      Total changed: ${fmtQty(changedQty)} unit(s)
    </div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Client Return Receipt – ${returnNo}</title>
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
  .signature-field { align-items: flex-start; }
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
      <h1>Client Return Receipt
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">Order: <span>${orderNo}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>

  <div class="page">
    <div class="doc-title">CLIENT RETURN RECEIPT</div>

    <div class="dr-number-row">
      <span class="label">RETURN NUMBER:</span>
      <span class="value">${returnNo}</span>
    </div>
    <div class="meta-row return-to-row">
      <span class="label">ORDER NUMBER:</span>
      <span class="value">${orderNo}</span>
    </div>
    <div class="meta-row">
      <span class="label">STATUS:</span>
      <span class="value">${escapeHtml(status)}</span>
    </div>

    ${returnedTable}
    <div class="totals-note">
      Total returned: ${fmtQty(returnedQty)} unit(s)${refundAmount ? ` · Refund: ${escapeHtml(refundAmount)}` : ''}
    </div>
    ${changedTable}

    <div class="delivery-section">
      <div class="section-label">Return Details:</div>
      ${detailField('CLIENT', row.clientName)}
      ${detailField('TYPE', kind)}
      ${detailField('REASON', formatClientReturnReason(row.reason))}
      ${refundAmount ? detailField('REFUND', refundAmount) : ''}
      ${detailField('RETURNED DATE', formatDate(row.returnDate))}
      ${detailField('SUBMITTED AT', formatDateTime(row.createdAt))}
      ${detailField('SUBMITTED BY', row.returnedByName)}
      ${
        row.status === 'posted' && row.approvedByName
          ? detailField(
              row.returnType === 'refund' ? 'POSTED BY' : 'APPROVED BY',
              row.approvedByName
            )
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
        <span class="fvalue"><span class="sline"></span></span>
      </div>
    </div>

    <div class="footer-note">
      Client order return · ${escapeHtml(formatDateTime(new Date().toISOString()))}
    </div>
  </div>
</body>
</html>`;
}
