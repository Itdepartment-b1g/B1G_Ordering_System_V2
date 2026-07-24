/**
 * Delivery Receipt for internal stock requests (main → sub).
 * Matches PO DR layout (generateDrPdf): logo, items, company/contact,
 * client confirmation signoff — without bank details.
 */
import { supabase } from '@/lib/supabase';
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
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  if (event.type === 'delivered' || event.type === 'approved_released') {
    return !!request.drNumber?.trim();
  }
  return false;
}

export type ExportDeliveryReceiptOptions = {
  /** When set, print this wave's DR / lines instead of the latest wave. */
  event?: DeliveryReceiptWaveEvent;
};

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
    console.warn('[internal DR] company name fetch failed', e);
    return '';
  }
}

function formatWarehouseFooterLabel(locationName: string): string {
  const base = locationName.replace(/\s*\(Main\)\s*$/i, '').trim();
  if (!base) return 'B1G Warehouse';
  if (/^B1G\s/i.test(base) && /\bWarehouse\s*$/i.test(base)) return base;
  return `B1G ${base} Warehouse`;
}

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
  companyName: string,
  options?: ExportDeliveryReceiptOptions
): string {
  const wave = options?.event ?? getLatestDeliveryWaveEvent(request);
  const drNo = escapeHtml(wave?.drNumber?.trim() || request.drNumber || '—');
  const destination = request.fromLocationName || 'Sub-warehouse';
  const companyLabel = companyName.trim() || destination;
  const contactPerson = request.requestedByName?.trim() || '';
  const whLabel = escapeHtml(destination);
  const whFooter = escapeHtml(formatWarehouseFooterLabel(destination));

  const receiptLines = resolveReceiptLines(request, wave);
  const itemRows =
    receiptLines.length > 0
      ? receiptLines
          .map(
            (row) => `
        <tr>
          <td class="col-desc">${escapeHtml(row.desc)}</td>
          <td class="col-qty">${fmtQty(row.qty)}</td>
        </tr>`
          )
          .join('')
      : `<tr>
          <td class="col-desc">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
        </tr>`;

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
  .toolbar-center {
    text-align: center;
    justify-self: center;
  }
  .warehouse-badge {
    display: inline-block;
    background: #1e3a5f;
    border: 1px solid #3b82f6;
    color: #dbeafe;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 6px;
    letter-spacing: 0.02em;
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
    position: relative;
  }

  .logo-block { text-align: center; margin-bottom: 6px; }
  .logo-b1g {
    font-size: 42px;
    font-weight: 900;
    font-style: italic;
    letter-spacing: -2px;
    line-height: 1;
  }
  .logo-corp {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.35em;
    margin-top: 2px;
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
    margin-bottom: 12px;
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
    margin-bottom: 16px;
  }
  .items-table thead th {
    text-align: left;
    font-weight: 800;
    font-size: 12px;
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
    min-width: 120px;
    flex-shrink: 0;
  }
  .delivery-field .fvalue { flex: 1; }

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
    .footer-note {
      margin-top: 10px;
    }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <h1>Delivery Receipt
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">DR to: <span>${whLabel}</span></div>
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
        <span class="flabel">COMPANY:</span>
        <span class="fvalue">${escapeHtml(companyLabel)}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">ADDRESS:</span>
        <span class="fvalue"></span>
      </div>
      <div class="delivery-field">
        <span class="flabel">CONTACT PERSON:</span>
        <span class="fvalue">${escapeHtml(contactPerson)}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">CONTACT #:</span>
        <span class="fvalue"></span>
      </div>
    </div>

    <table class="signoff-table">
      <thead>
        <tr>
          <th class="boxes-col">Number of Boxes</th>
          <th class="confirm-col">Client confirmation</th>
          <th class="legal-col">I hereby acknowledged that the order details above are accurate and received in good condition. No further claims will be accepted.</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="boxes-col" style="height: 80px;"></td>
          <td class="confirm-col">
            <div class="sub-row">
              <span class="slabel">Name of Client/representative</span>
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

    <div class="footer-note">${whFooter}</div>
  </div>
</body>
</html>`;
}

export async function exportInternalStockDeliveryReceiptPdf(
  request: SubWarehouseStockRequest,
  options?: ExportDeliveryReceiptOptions
): Promise<void> {
  const wave = options?.event ?? getLatestDeliveryWaveEvent(request);
  const companyName = await fetchCompanyName();
  const html = buildDeliveryReceiptHtml(request, companyName, { event: wave });
  const titleNo = wave?.drNumber?.trim() || request.drNumber || request.requestNumber;
  openPrintableHtml(`Delivery Receipt — ${titleNo}`, html);
}
