/**
 * Bank-free Delivery Receipt for internal stock requests (main → sub).
 * Opens an HTML print tab (same pattern as PO DR / stock return receipts).
 */
import {
  getItemDeliveredQty,
  type SubWarehouseReleaseLine,
  type SubWarehouseRequestHistoryEvent,
  type SubWarehouseStockRequest,
} from '../components/SubWarehouseStockRequestDialog';

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtQty(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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

export type DeliveryReceiptWaveEvent = Extract<
  SubWarehouseRequestHistoryEvent,
  { type: 'delivered' | 'approved_released' | 'remaining_released' }
>;

function isDeliveryWaveEvent(
  event: SubWarehouseRequestHistoryEvent
): event is DeliveryReceiptWaveEvent {
  return (
    event.type === 'delivered' ||
    event.type === 'approved_released' ||
    event.type === 'remaining_released'
  );
}

/** Latest delivered / allocate-remaining wave, preferring events that already have a DR #. */
export function getLatestDeliveryWaveEvent(
  request: SubWarehouseStockRequest
): DeliveryReceiptWaveEvent | undefined {
  const waves = (request.history ?? [])
    .filter(isDeliveryWaveEvent)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return waves.find((e) => !!e.drNumber?.trim()) ?? waves[0];
}

/** True once main has delivered (or legacy approve+release). */
export function canExportInternalStockDeliveryReceipt(
  request: SubWarehouseStockRequest
): boolean {
  if (
    request.status === 'pending_receive' ||
    request.status === 'partially_received' ||
    request.status === 'fully_received'
  ) {
    return true;
  }
  return (request.history ?? []).some(
    (e) => e.type === 'delivered' || e.type === 'approved_released'
  );
}

export function canExportDeliveryReceiptForEvent(
  request: SubWarehouseStockRequest,
  event: SubWarehouseRequestHistoryEvent
): boolean {
  if (!isDeliveryWaveEvent(event)) return false;
  if (event.drNumber?.trim()) return true;
  // Legacy first-delivery events: fall back to request-level DR.
  if (event.type === 'delivered' || event.type === 'approved_released') {
    return !!request.drNumber?.trim();
  }
  // Old remaining_released waves without a stored DR stay unprintable.
  return false;
}

export type ExportDeliveryReceiptOptions = {
  /** When set, print this wave's DR / lines / rider instead of the latest wave. */
  event?: DeliveryReceiptWaveEvent;
};

function resolveReceiptLines(
  request: SubWarehouseStockRequest,
  event?: DeliveryReceiptWaveEvent
): Array<{ desc: string; qty: number }> {
  if (event?.lines && event.lines.length > 0) {
    return event.lines
      .filter((line) => line.quantity > 0)
      .map((line: SubWarehouseReleaseLine) => {
        const brand = line.brandName?.trim();
        const desc = brand ? `${brand} — ${line.variantName}` : line.variantName;
        return { desc, qty: line.quantity };
      });
  }

  return request.items
    .map((item) => {
      const qty = getItemDeliveredQty(item);
      if (qty <= 0) return null;
      const brand = item.brandName?.trim();
      const desc = brand ? `${brand} — ${item.variantName}` : item.variantName;
      return { desc, qty };
    })
    .filter((row): row is { desc: string; qty: number } => row != null);
}

function buildDeliveryReceiptHtml(
  request: SubWarehouseStockRequest,
  options?: ExportDeliveryReceiptOptions
): string {
  const wave = options?.event ?? getLatestDeliveryWaveEvent(request);
  const isMainAllocation = request.initiationType === 'main_allocation';
  const drNo = escapeHtml(wave?.drNumber?.trim() || request.drNumber || '—');
  const refNo = escapeHtml(request.requestNumber);
  const destination = escapeHtml(request.fromLocationName || 'Sub-warehouse');
  const initiatedBy = escapeHtml(
    isMainAllocation
      ? request.requestedByName
        ? `Main Warehouse · ${request.requestedByName}`
        : 'Main Warehouse'
      : request.requestedByName || '—'
  );
  const refLabel = isMainAllocation ? 'AL NUMBER:' : 'RN NUMBER:';
  const initiatorLabel = isMainAllocation ? 'ALLOCATED BY:' : 'REQUESTED BY:';
  const footer = escapeHtml(
    request.fromLocationName
      ? `B1G → ${request.fromLocationName}`
      : 'B1G Internal Stock Transfer'
  );

  const riderName = wave?.riderName?.trim() || request.riderName?.trim();
  const riderPlate = wave?.riderPlateNumber?.trim() || request.riderPlateNumber?.trim();

  const receiptLines = resolveReceiptLines(request, wave);
  const lines = receiptLines
    .map(
      (row) => `
        <tr>
          <td class="col-desc">${escapeHtml(row.desc)}</td>
          <td class="col-qty">${fmtQty(row.qty)}</td>
        </tr>`
    )
    .join('');

  const itemRows =
    lines ||
    `<tr><td class="col-desc" colspan="2">No delivered items</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Delivery Receipt — ${drNo}</title>
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
    padding: 4px 10px;
    border-radius: 999px;
    background: #374151;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .toolbar-right { justify-self: end; }
  .toolbar button {
    appearance: none;
    border: 0;
    border-radius: 6px;
    padding: 8px 14px;
    background: #fff;
    color: #111827;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .toolbar button:hover { background: #f3f4f6; }

  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 16px auto 32px;
    padding: 18mm 16mm 16mm;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.12);
  }

  .logo-block { text-align: center; margin-bottom: 8px; }
  .logo-b1g {
    font-size: 42px;
    font-weight: 800;
    letter-spacing: 0.08em;
    line-height: 1;
  }
  .logo-corp {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.28em;
    margin-top: 2px;
  }

  .doc-title {
    text-align: center;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.12em;
    margin: 14px 0 10px;
  }

  .dr-number-row {
    display: flex;
    justify-content: flex-end;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 14px;
    font-size: 13px;
  }
  .dr-number-row .label { font-weight: 700; }
  .dr-number-row .value { font-weight: 700; letter-spacing: 0.02em; }

  .items-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-bottom: 18px;
  }
  .items-table th,
  .items-table td {
    border: 1px solid #111;
    padding: 6px 8px;
    vertical-align: top;
  }
  .items-table th {
    background: #f3f4f6;
    text-align: left;
    font-weight: 700;
  }
  .col-desc { width: 78%; }
  .col-qty { width: 22%; text-align: right; }

  .delivery-section { margin-bottom: 18px; font-size: 12px; }
  .section-label { font-weight: 700; margin-bottom: 6px; }
  .delivery-field {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 8px;
    margin-bottom: 4px;
  }
  .delivery-field .flabel { font-weight: 700; }
  .delivery-field .fvalue { border-bottom: 1px solid #111; min-height: 1.2em; }

  .signoff-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-top: 8px;
  }
  .signoff-table th,
  .signoff-table td {
    border: 1px solid #111;
    padding: 8px;
    vertical-align: top;
  }
  .signoff-table th {
    background: #f3f4f6;
    font-weight: 700;
    text-align: left;
  }
  .boxes-col { width: 22%; }
  .confirm-col { width: 38%; }
  .legal-col { width: 40%; font-weight: 400 !important; }
  .sub-row {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    margin-bottom: 10px;
  }
  .sub-row .slabel { white-space: nowrap; }
  .sub-row .sline {
    flex: 1;
    border-bottom: 1px solid #111;
    min-height: 16px;
  }

  .footer-note {
    margin-top: 18px;
    text-align: center;
    font-size: 11px;
    color: #444;
  }

  @media print {
    html, body { background: #fff; }
    .toolbar { display: none !important; }
    .page {
      width: auto;
      min-height: auto;
      margin: 0;
      padding: 12mm 10mm;
      box-shadow: none;
    }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1>Delivery Receipt</h1>
      <span class="hint">Internal stock · print or Save as PDF</span>
    </div>
    <div class="toolbar-center">
      <span class="warehouse-badge">${escapeHtml(request.fromLocationName || 'Sub warehouse')}</span>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>

  <div class="page">
    <div class="logo-block">
      <div class="logo-b1g">B1G</div>
      <div class="logo-corp">CORPORATION</div>
    </div>

    <div class="doc-title">DELIVERY RECEIPT</div>

    <div class="dr-number-row">
      <span class="label">DR NUMBER:</span>
      <span class="value">${drNo}</span>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Description</th>
          <th class="col-qty">Quantity</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="delivery-section">
      <div class="section-label">Delivery Details:</div>
      <div class="delivery-field">
        <span class="flabel">FROM:</span>
        <span class="fvalue">Main Warehouse</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">TO (SUB-WAREHOUSE):</span>
        <span class="fvalue">${destination}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">${initiatorLabel}</span>
        <span class="fvalue">${initiatedBy}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">${refLabel}</span>
        <span class="fvalue">${refNo}</span>
      </div>
      ${
        riderName || riderPlate
          ? `<div class="delivery-field">
        <span class="flabel">RIDER:</span>
        <span class="fvalue">${escapeHtml(
          [riderName, riderPlate].filter(Boolean).join(' · ') || '—'
        )}</span>
      </div>`
          : ''
      }
    </div>

    <table class="signoff-table">
      <thead>
        <tr>
          <th class="boxes-col">Number of Boxes</th>
          <th class="confirm-col">Receiver confirmation</th>
          <th class="legal-col">I hereby acknowledged that the order details above are accurate and received in good condition. No further claims will be accepted.</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="boxes-col" style="height: 80px;"></td>
          <td class="confirm-col">
            <div class="sub-row">
              <span class="slabel">Name of receiver</span>
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

    <div class="footer-note">${footer}</div>
  </div>
</body>
</html>`;
}

export async function exportInternalStockDeliveryReceiptPdf(
  request: SubWarehouseStockRequest,
  options?: ExportDeliveryReceiptOptions
): Promise<void> {
  const wave = options?.event ?? getLatestDeliveryWaveEvent(request);
  const html = buildDeliveryReceiptHtml(request, { event: wave });
  const titleNo = wave?.drNumber?.trim() || request.drNumber || request.requestNumber;
  openPrintableHtml(`Delivery Receipt — ${titleNo}`, html);
}
