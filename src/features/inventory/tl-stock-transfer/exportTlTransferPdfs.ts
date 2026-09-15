/**
 * Printable TL stock transfer request + Transfer Delivery Receipt (TDR).
 * Same HTML print → Save as PDF pattern as PO DR / internal stock DR.
 */
import type { TLRequestWithDetails } from '@/types/tlStockRequests.types';
import { tlStatusLabel, tlTdrKindLabel } from './tlStockTransferShared';

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

function fmtQtyFixed(n: number | null | undefined): string {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function openPrintableHtml(title: string, html: string): void {
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

function sharedStyles(): string {
  return `
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
    margin: 10px 0 6px;
  }
  .doc-subtitle {
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    color: #444;
    margin-bottom: 14px;
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
    white-space: nowrap;
    width: 78px;
  }
  .line-variance {
    font-size: 9px;
    font-weight: 600;
    color: #8a5a00;
    margin-top: 2px;
  }
  .total-qty-row {
    display: flex;
    justify-content: flex-start;
    align-items: baseline;
    gap: 10px;
    margin: 4px 0 8px;
    font-size: 10px;
  }
  .total-qty-row .label { font-weight: 800; }
  .total-qty-row .value {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    min-width: 90px;
    text-align: right;
  }
  .delivery-section {
    margin: 18px 0;
    padding-top: 8px;
    border-top: 1.5px solid #000;
  }
  .delivery-section .section-label,
  .courier-section .section-label {
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
  .handover-section {
    margin: 4px 0 0;
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    line-height: 1.9;
  }
  .handover-section .sig { margin-top: 10px; }
  .courier-section {
    margin: 18px 0;
    padding-top: 8px;
    border-top: 1.5px solid #000;
  }
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
  .footer-note {
    text-align: center;
    font-size: 8px;
    color: #555;
    margin-top: 14px;
  }
  @media print {
    @page { size: A4 portrait; margin: 6mm; }
    html, body { background: #fff; }
    .toolbar { display: none !important; }
    .page {
      width: auto; min-height: auto;
      margin: 0; padding: 0;
      box-shadow: none;
    }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;
}

function variantLabel(line: {
  variant?: { name?: string | null; brand_name?: string | null };
}): string {
  return [line.variant?.brand_name, line.variant?.name].filter(Boolean).join(' · ') || 'Item';
}

export type TlStockTransferRequestPdfLine = {
  label: string;
  requested: number;
  approved?: number | null;
};

export type TlStockTransferRequestPdfOptions = {
  requestNumber: string;
  statusLabel: string;
  createdAt: string;
  requesterName: string;
  requesterRegion?: string | null;
  sourceName: string;
  sourceRegion?: string | null;
  notes?: string | null;
  lines: TlStockTransferRequestPdfLine[];
};

export type TlTdrPdfLine = {
  label: string;
  dispatched: number;
  received: number;
  /** Shown under description when a receive left a gap, e.g. "Missing / lost in transit". */
  shortfallReason?: string | null;
  /** True only after the requester confirmed receive (including received 0). */
  receiveConfirmed?: boolean;
};

export type TlTdrPdfOptions = {
  tdrNumber: string;
  kind: string;
  dispatchedAt: string;
  requestNumber: string;
  requesterName: string;
  sourceName: string;
  lines: TlTdrPdfLine[];
};

function buildTransferRequestHtml(options: TlStockTransferRequestPdfOptions): string {
  const requestNo = escapeHtml(options.requestNumber);
  const totalRequested = options.lines.reduce((sum, line) => sum + Math.max(0, line.requested), 0);
  const showApproved = options.lines.some((line) => line.approved != null);
  const itemRows =
    options.lines
      .map(
        (line) => `
      <tr>
        <td>${escapeHtml(line.label)}</td>
        <td class="col-qty">${fmtQty(line.requested)}</td>
        ${showApproved ? `<td class="col-qty">${line.approved == null ? '—' : fmtQty(line.approved)}</td>` : ''}
      </tr>`
      )
      .join('') ||
    `<tr><td>&nbsp;</td><td class="col-qty">&nbsp;</td>${showApproved ? '<td class="col-qty">&nbsp;</td>' : ''}</tr>`;

  const requester = [options.requesterName, options.requesterRegion].filter(Boolean).join(' · ');
  const source = [options.sourceName, options.sourceRegion].filter(Boolean).join(' · ');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Stock Transfer — ${requestNo}</title>
<style>${sharedStyles()}</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1>Stock Transfer
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">Transfer: <span>${requestNo}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>
  <div class="page">
    <div class="doc-title">STOCK TRANSFER</div>
    <div class="doc-subtitle">${escapeHtml(options.statusLabel)}</div>
    <div class="dr-number-row">
      <span class="label">TRANSFER NO:</span>
      <span class="value">${requestNo}</span>
    </div>
    <table class="items-table">
      <thead>
        <tr>
          <th>Description</th>
          <th class="col-qty">Requested</th>
          ${showApproved ? '<th class="col-qty">Approved</th>' : ''}
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="total-qty-row">
      <span class="label">Total requested:</span>
      <span class="value">${fmtQty(totalRequested)}</span>
    </div>
    <div class="delivery-section">
      <div class="section-label">Transfer details:</div>
      <div class="delivery-field">
        <span class="flabel">REQUESTED BY:</span>
        <span class="fvalue">${escapeHtml(requester)}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">FROM (SOURCE TL):</span>
        <span class="fvalue">${escapeHtml(source)}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">CREATED:</span>
        <span class="fvalue">${escapeHtml(formatDateTime(options.createdAt))}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">NOTES:</span>
        <span class="fvalue">${options.notes?.trim() ? escapeHtml(options.notes.trim()) : '—'}</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function buildTdrHtml(options: TlTdrPdfOptions): string {
  const tdrNo = escapeHtml(options.tdrNumber);
  const requestNo = escapeHtml(options.requestNumber);
  const totalDispatched = options.lines.reduce((sum, line) => sum + Math.max(0, line.dispatched), 0);
  const totalReceived = options.lines.reduce((sum, line) => sum + Math.max(0, line.received), 0);
  const itemRows =
    options.lines
      .map((line) => {
        const short = Math.max(0, line.dispatched - line.received);
        const receiveConfirmed = line.receiveConfirmed === true || Boolean(line.shortfallReason?.trim());
        const reasonBit =
          short > 0 && receiveConfirmed && line.shortfallReason?.trim()
            ? `<div class="line-variance">${escapeHtml(line.shortfallReason.trim())} · short ${fmtQtyFixed(short)}</div>`
            : short > 0 && receiveConfirmed
              ? `<div class="line-variance">Short ${fmtQtyFixed(short)} · under investigation</div>`
              : '';
        return `
      <tr>
        <td class="col-desc">${escapeHtml(line.label)}${reasonBit}</td>
        <td class="col-qty">${fmtQtyFixed(line.dispatched)}</td>
        <td class="col-qty">${fmtQtyFixed(line.received)}</td>
      </tr>`;
      })
      .join('') ||
    `<tr><td class="col-desc">&nbsp;</td><td class="col-qty">&nbsp;</td><td class="col-qty">&nbsp;</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>TDR — ${tdrNo}</title>
<style>${sharedStyles()}</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1>Transfer Delivery Receipt
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">TDR: <span>${tdrNo}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>
  <div class="page">
    <div class="doc-title">TRANSFER DELIVERY RECEIPT</div>
    <div class="doc-subtitle">${escapeHtml(tlTdrKindLabel(options.kind))}</div>
    <div class="dr-number-row">
      <span class="label">TDR NUMBER:</span>
      <span class="value">${tdrNo}</span>
    </div>
    <div class="dr-number-row">
      <span class="label">TRANSFER NO:</span>
      <span class="value">${requestNo}</span>
    </div>
    <table class="items-table">
      <thead>
        <tr>
          <th>Description</th>
          <th class="col-qty">Dispatched</th>
          <th class="col-qty">Received</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="total-qty-row">
      <span class="label">Total dispatched:</span>
      <span class="value">${fmtQtyFixed(totalDispatched)}</span>
    </div>
    <div class="total-qty-row">
      <span class="label">Total received:</span>
      <span class="value">${fmtQtyFixed(totalReceived)}</span>
    </div>
    <div class="delivery-section">
      <div class="section-label">Delivery details:</div>
      <div class="delivery-field">
        <span class="flabel">FROM (DISPATCHER):</span>
        <span class="fvalue">${escapeHtml(options.sourceName)}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">TO (REQUESTER):</span>
        <span class="fvalue">${escapeHtml(options.requesterName)}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">DISPATCHED:</span>
        <span class="fvalue">${escapeHtml(formatDateTime(options.dispatchedAt))}</span>
      </div>
    </div>
    <div class="courier-section">
      <div class="section-label">Courier details:</div>
      <div class="handover-section">
        <div>TOTAL BOXES :</div>
        <div>DRIVER NAMES :</div>
        <div>CONTACT NUMBER :</div>
        <div class="sig">SIGNATURE :</div>
        <div>PLATE NUMBER :</div>
        <div>DATE AND TIME</div>
      </div>
    </div>
    <table class="signoff-table">
      <thead>
        <tr>
          <th class="boxes-col">Number of Boxes</th>
          <th class="confirm-col">Receiving team leader confirmation</th>
          <th class="legal-col">I hereby acknowledge that the stock details above are accurate and received in good condition. No further claims will be accepted for this TDR.</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="boxes-col" style="height: 80px;"></td>
          <td class="confirm-col">
            <div class="sub-row">
              <span class="slabel">Name of team leader / representative</span>
              <span class="sline"></span>
            </div>
            <div class="sub-row">
              <span class="slabel">Signature:</span>
              <span class="sline"></span>
            </div>
            <div class="sub-row">
              <span class="slabel">Date:</span>
              <span class="sline"></span>
            </div>
          </td>
          <td class="legal-col"></td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

export async function exportTlStockTransferRequestPdf(
  options: TlStockTransferRequestPdfOptions
): Promise<void> {
  const html = buildTransferRequestHtml(options);
  openPrintableHtml(`Stock Transfer — ${options.requestNumber}`, html);
}

export async function exportTlTdrPdf(options: TlTdrPdfOptions): Promise<void> {
  const html = buildTdrHtml(options);
  openPrintableHtml(`TDR — ${options.tdrNumber}`, html);
}

export function tlTransferRequestPdfFromLines(
  lines: TLRequestWithDetails[]
): TlStockTransferRequestPdfOptions | null {
  const header = lines[0];
  if (!header) return null;
  return {
    requestNumber: header.request_number,
    statusLabel: tlStatusLabel(header.status),
    createdAt: header.created_at,
    requesterName: header.requester?.full_name || '—',
    requesterRegion: header.requester?.region,
    sourceName: header.source?.full_name || '—',
    sourceRegion: header.source?.region,
    notes: header.requester_notes,
    lines: lines.map((line) => ({
      label: variantLabel(line),
      requested: Number(line.requested_quantity || 0),
      approved: line.admin_approved_quantity,
    })),
  };
}

export async function printTlStockTransferRequest(
  lines: TLRequestWithDetails[]
): Promise<void> {
  const options = tlTransferRequestPdfFromLines(lines);
  if (!options) throw new Error('Nothing to print');
  await exportTlStockTransferRequestPdf(options);
}

export function tlTdrPdfFromDispatch(input: {
  tdrNumber: string;
  kind?: string;
  requestNumber: string;
  requesterName: string;
  sourceName: string;
  dispatchedAt?: string;
  lines: { label: string; quantity: number }[];
}): TlTdrPdfOptions {
  return {
    tdrNumber: input.tdrNumber,
    kind: input.kind || 'dispatch',
    dispatchedAt: input.dispatchedAt || new Date().toISOString(),
    requestNumber: input.requestNumber,
    requesterName: input.requesterName,
    sourceName: input.sourceName,
    lines: input.lines.map((line) => ({
      label: line.label,
      dispatched: line.quantity,
      received: 0,
    })),
  };
}
