/**
 * Preparing order / packing slip for main→sub allocations (before delivery).
 * No rider, plate, DR #, delivery signature, or package photos — those belong on the DR after deliver.
 * Physical qty column is left blank for handwritten counts on the printed sheet.
 */
import { supabase } from '@/lib/supabase';
import type {
  SubWarehouseRequestHistoryEvent,
  SubWarehouseStockRequest,
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
    console.warn('[packing slip] company name fetch failed', e);
    return '';
  }
}

function getMainAllocatedEvent(
  request: SubWarehouseStockRequest
): Extract<SubWarehouseRequestHistoryEvent, { type: 'main_allocated' }> | undefined {
  return (request.history ?? [])
    .filter((e): e is Extract<SubWarehouseRequestHistoryEvent, { type: 'main_allocated' }> =>
      e.type === 'main_allocated'
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
}

/** True once main has created a packing-ready allocation (or later stages). */
export function canExportInternalStockPackingSlip(
  request: SubWarehouseStockRequest
): boolean {
  if (request.initiationType !== 'main_allocation') return false;
  return (
    request.status === 'ready_to_deliver' ||
    request.status === 'pending_receive' ||
    request.status === 'partially_received' ||
    request.status === 'fully_received' ||
    (request.history ?? []).some((e) => e.type === 'main_allocated')
  );
}

function resolvePackingLines(request: SubWarehouseStockRequest): Array<{ desc: string; qty: number }> {
  const allocated = getMainAllocatedEvent(request);
  if (allocated?.lines && allocated.lines.length > 0) {
    return allocated.lines
      .filter((line) => line.quantity > 0)
      .map((line) => {
        const brand = line.brandName?.trim();
        const desc = brand ? `${brand} — ${line.variantName}` : line.variantName;
        return { desc, qty: line.quantity };
      });
  }

  return request.items
    .filter((item) => item.requestedQuantity > 0)
    .map((item) => {
      const brand = item.brandName?.trim();
      const desc = brand ? `${brand} — ${item.variantName}` : item.variantName;
      return { desc, qty: item.requestedQuantity };
    });
}

function buildPackingSlipHtml(
  request: SubWarehouseStockRequest,
  companyName: string
): string {
  const alNo = escapeHtml(request.requestNumber || '—');
  const destination = request.fromLocationName || 'Sub-warehouse';
  const companyLabel = escapeHtml(companyName.trim() || destination);
  const whLabel = escapeHtml(destination);
  const createdAt = (() => {
    try {
      return new Date(request.createdAt).toLocaleString();
    } catch {
      return request.createdAt;
    }
  })();
  const logoUrl = escapeHtml(new URL('/logo/B1G_LOGO_BLACK.png', window.location.origin).toString());
  const lines = resolvePackingLines(request);

  const itemRows =
    lines.length > 0
      ? lines
          .map(
            (row) => `
        <tr>
          <td class="col-desc">${escapeHtml(row.desc)}</td>
          <td class="col-qty">${fmtQty(row.qty)}</td>
          <td class="col-phys">&nbsp;</td>
        </tr>`
          )
          .join('')
      : `<tr>
          <td class="col-desc">&nbsp;</td>
          <td class="col-qty">&nbsp;</td>
          <td class="col-phys">&nbsp;</td>
        </tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Packing Slip — ${alNo}</title>
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
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 16px auto;
    padding: 12mm 14mm 20mm;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    font-size: 11px;
    line-height: 1.35;
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
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 0.04em;
    margin: 10px 0 4px;
  }
  .doc-sub {
    text-align: center;
    font-size: 11px;
    color: #444;
    margin-bottom: 14px;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
    font-size: 12px;
  }
  .meta-row .label { font-weight: 700; }
  .meta-row .value {
    font-family: ui-monospace, monospace;
    font-weight: 700;
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
  .items-table thead th.col-qty,
  .items-table thead th.col-phys { text-align: right; }
  .items-table tbody td {
    padding: 10px 4px;
    border-bottom: 1px solid #ccc;
    vertical-align: middle;
  }
  .items-table .col-qty {
    text-align: right;
    font-variant-numeric: tabular-nums;
    width: 90px;
  }
  .items-table .col-phys {
    text-align: right;
    width: 110px;
    min-height: 22px;
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
      <h1>Packing Slip
        <span class="hint">Attach to physical boxes. Print without headers/footers.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">To: <span>${whLabel}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>
  <div class="page">
    <div class="logo-block">
      <img class="logo-img" src="${logoUrl}" alt="B1G" />
    </div>
    <div class="doc-title">PREPARED ORDER</div>
    <div class="doc-sub">${companyLabel}</div>
    <div class="meta-row">
      <div><span class="label">Allocation #</span> <span class="value">${alNo}</span></div>
      <div><span class="label">Created</span> ${escapeHtml(createdAt)}</div>
    </div>
    <div class="meta-row">
      <div><span class="label">Destination</span> ${whLabel}</div>
    </div>
    <table class="items-table">
      <thead>
        <tr>
          <th>Item</th>
          <th class="col-qty">Qty</th>
          <th class="col-phys">Physical qty</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    <p class="footer-note">
      Write counted physical qty by hand. This sheet does not include rider or plate details — print the Delivery Receipt after dispatch.
    </p>
  </div>
</body>
</html>`;
}

export async function exportInternalStockPackingSlipPdf(
  request: SubWarehouseStockRequest
): Promise<void> {
  const companyName = await fetchCompanyName();
  const html = buildPackingSlipHtml(request, companyName);
  openPrintableHtml(`Packing Slip — ${request.requestNumber}`, html);
}
