import { getStandardAccountReturnEvidenceSignedUrl } from './uploadStandardAccountReturnEvidence';

export type StandardAccountReturnPdfLine = {
  brandName?: string | null;
  variantName?: string | null;
  returnQuantity: number;
  /** When null/undefined, Good cell is left blank for handwriting. */
  qtyGood?: number | null;
  /** When null/undefined, Damaged cell is left blank for handwriting. */
  qtyDamaged?: number | null;
  /** Destination batch label(s) for good units; blank when unset. */
  batchLabel?: string | null;
};

export type StandardAccountReturnPdfReceiptLine = {
  warehouseVariantId?: string | null;
  brandName?: string | null;
  variantName?: string | null;
  qtyGood: number;
  qtyDamaged: number;
  batchNumber?: string | null;
  expirationDate?: string | null;
};

export type StandardAccountReturnPdfInput = {
  requestNumber: string;
  status?: string | null;
  createdAt: string;
  notes?: string | null;
  clientCompanyName?: string | null;
  destinationLocationName?: string | null;
  destinationIsMain?: boolean | null;
  createdByName?: string | null;
  signatureUrl?: string | null;
  /** Override footer line; defaults to SA return wording. */
  footerNote?: string | null;
  /** Label for the company/from field; defaults to COMPANY. */
  companyFieldLabel?: string | null;
  lines: StandardAccountReturnPdfLine[];
};

/** Row shape shared by SA return list / warehouse client returns for reprint. */
export type StandardAccountReturnPdfSource = {
  request_number: string;
  status?: string | null;
  created_at: string;
  notes?: string | null;
  signature_url?: string | null;
  signature_path?: string | null;
  client_company?: { company_name: string } | null;
  destination_location?: { name: string; is_main?: boolean | null } | null;
  created_by_user?: { full_name: string } | null;
  footerNote?: string | null;
  companyFieldLabel?: string | null;
  items: Array<{
    warehouse_variant_id?: string | null;
    return_quantity: number;
    inspected_quantity?: number | null;
    variant?: {
      name: string;
      brand?: { name: string } | null;
    } | null;
  }>;
  receipts?: Array<{
    lines: StandardAccountReturnPdfReceiptLine[];
  }>;
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

function formatLotDate(date: string | null | undefined): string | null {
  if (!date) return null;
  try {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return date;
  }
}

function formatBatchLabel(
  batchNumber: string | null | undefined,
  expirationDate: string | null | undefined,
  qtyGood?: number
): string {
  const batch = batchNumber?.trim() || '—';
  const exp = formatLotDate(expirationDate);
  const base = exp ? `${batch} · exp ${exp}` : batch;
  if (qtyGood != null && qtyGood > 0) return `${base} (${qtyGood})`;
  return base;
}

function fmtQty(n: number): string {
  return Number(n || 0).toLocaleString();
}

function fmtQtyOrBlank(n: number | null | undefined): string {
  if (n == null) return '&nbsp;';
  return fmtQty(n);
}

function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'pending_approval':
      return 'Pending approval';
    case 'pending_receive':
      return 'Pending inspect';
    case 'partially_received':
      return 'Partially inspected';
    case 'fully_received':
      return 'Fully inspected';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status?.trim() || 'Submitted';
  }
}

function destinationLabel(input: StandardAccountReturnPdfInput): string {
  const name = input.destinationLocationName?.trim();
  if (!name) return '—';
  if (input.destinationIsMain === true) return `${name} (Main)`;
  if (input.destinationIsMain === false) return `${name} (Sub)`;
  return name;
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

/**
 * Strip near-white / opaque canvas background so the signature sits cleanly on the receipt.
 */
async function makeSignatureTransparent(src: string): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load signature image'));
      // data URLs don't need CORS; remote signed URLs may.
      if (!src.startsWith('data:')) image.crossOrigin = 'anonymous';
      image.src = src;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0 || canvas.height === 0) return src;

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Treat near-white pixels as background.
      if (r > 240 && g > 240 && b > 240) {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return src;
  }
}

function productKey(brandName: string | null | undefined, variantName: string | null | undefined): string {
  return `${(brandName ?? '').trim().toLowerCase()}::${(variantName ?? '').trim().toLowerCase()}`;
}

/** True when inspection columns should be filled (not left blank for handwriting). */
function shouldFillInspection(status: string | null | undefined, hasReceiptLines: boolean): boolean {
  if (status === 'fully_received' || status === 'partially_received') return true;
  return hasReceiptLines;
}

function itemRowsHtml(lines: StandardAccountReturnPdfLine[]): {
  html: string;
  totalGood: number;
  totalDamaged: number;
  hasFilledInspection: boolean;
} {
  let totalGood = 0;
  let totalDamaged = 0;
  let hasFilledInspection = false;

  const rows = lines.map((line) => {
    const name = `${line.brandName ? `${line.brandName} — ` : ''}${line.variantName || 'Item'}`;
    if (line.qtyGood != null) {
      totalGood += Number(line.qtyGood) || 0;
      hasFilledInspection = true;
    }
    if (line.qtyDamaged != null) {
      totalDamaged += Number(line.qtyDamaged) || 0;
      hasFilledInspection = true;
    }
    const batchCell = line.batchLabel?.trim()
      ? escapeHtml(line.batchLabel.trim())
      : '&nbsp;';

    return `
      <tr>
        <td class="col-desc">${escapeHtml(name)}</td>
        <td class="col-qty">${fmtQty(line.returnQuantity)}</td>
        <td class="col-qty">${fmtQtyOrBlank(line.qtyGood)}</td>
        <td class="col-qty">${fmtQtyOrBlank(line.qtyDamaged)}</td>
        <td class="col-batch">${batchCell}</td>
      </tr>`;
  });

  if (rows.length === 0) {
    rows.push(`
      <tr>
        <td class="col-desc">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        <td class="col-batch">&nbsp;</td>
      </tr>`);
  }

  return { html: rows.join(''), totalGood, totalDamaged, hasFilledInspection };
}

function buildReturnReceiptHtml(input: StandardAccountReturnPdfInput): string {
  const itemResult = itemRowsHtml(input.lines);
  const totalReturned = input.lines.reduce((s, l) => s + Number(l.returnQuantity || 0), 0);
  const rtNo = escapeHtml(input.requestNumber);
  const dest = escapeHtml(destinationLabel(input));
  const status = escapeHtml(statusLabel(input.status));
  const logoUrl = escapeHtml(new URL('/logo/B1G_LOGO_BLACK.png', window.location.origin).toString());

  const signatureImgHtml = input.signatureUrl
    ? `<img class="sig-img" src="${escapeHtml(input.signatureUrl)}" alt="Return signature" />`
    : `<span class="sline"></span>`;

  const totalsExtra = itemResult.hasFilledInspection
    ? ` · Good: ${fmtQty(itemResult.totalGood)} · Damaged: ${fmtQty(itemResult.totalDamaged)}`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Stock Return Receipt – ${rtNo}</title>
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
  .items-table thead th.col-qty,
  .items-table thead th.col-batch { text-align: right; }
  .items-table tbody td {
    padding: 7px 4px;
    border-bottom: 1px solid #ccc;
    vertical-align: top;
  }
  .items-table .col-qty {
    text-align: right;
    font-variant-numeric: tabular-nums;
    width: 72px;
  }
  .items-table .col-batch {
    text-align: right;
    font-size: 10px;
    width: 140px;
    font-family: ui-monospace, monospace;
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
  .sig-img {
    display: block;
    max-height: 64px;
    max-width: 220px;
    object-fit: contain;
    margin-top: 2px;
    background: transparent;
    border: 0;
    padding: 0;
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
      <h1>Stock Return Receipt
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="warehouse-badge">Return to: <span>${dest}</span></div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>

  <div class="page">
    <div class="logo-block">
      <img class="logo-img" src="${logoUrl}" alt="B1G Corporation" />
    </div>

    <div class="doc-title">STOCK RETURN RECEIPT</div>

    <div class="dr-number-row">
      <span class="label">RETURN NUMBER:</span>
      <span class="value">${rtNo}</span>
    </div>
    <div class="meta-row return-to-row">
      <span class="label">RETURN TO:</span>
      <span class="value">${dest}</span>
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
          <th class="col-qty">Good</th>
          <th class="col-qty">Damaged</th>
          <th class="col-batch">Batch (good)</th>
        </tr>
      </thead>
      <tbody>
        ${itemResult.html}
      </tbody>
    </table>
    <div class="totals-note">
      Total returned: ${fmtQty(totalReturned)} unit(s)${totalsExtra}
    </div>

    <div class="delivery-section">
      <div class="section-label">Return Details:</div>
      ${
        input.clientCompanyName?.trim()
          ? `<div class="delivery-field">
        <span class="flabel">${escapeHtml((input.companyFieldLabel?.trim() || 'COMPANY').toUpperCase())}:</span>
        <span class="fvalue">${escapeHtml(input.clientCompanyName.trim())}</span>
      </div>`
          : ''
      }
      <div class="delivery-field">
        <span class="flabel">RETURN TO:</span>
        <span class="fvalue">${dest}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">SUBMITTED AT:</span>
        <span class="fvalue">${escapeHtml(formatDateTime(input.createdAt))}</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">SUBMITTED BY:</span>
        <span class="fvalue">${
          input.createdByName?.trim()
            ? escapeHtml(input.createdByName.trim())
            : '<span class="muted">—</span>'
        }</span>
      </div>
      <div class="delivery-field">
        <span class="flabel">NOTES:</span>
        <span class="fvalue">${
          input.notes?.trim()
            ? escapeHtml(input.notes.trim())
            : '<span class="muted">—</span>'
        }</span>
      </div>
      <div class="delivery-field signature-field">
        <span class="flabel">SIGNATURE:</span>
        <span class="fvalue">${signatureImgHtml}</span>
      </div>
    </div>

    <div class="footer-note">
      ${escapeHtml(input.footerNote?.trim() || 'Standard Account return to warehouse')} · ${escapeHtml(formatDateTime(new Date().toISOString()))}
    </div>
  </div>
</body>
</html>`;
}

/** Opens a printable Stock Return Receipt (HTML → Print / Save PDF). */
export async function exportStandardAccountReturnPdf(
  input: StandardAccountReturnPdfInput
): Promise<void> {
  const signatureUrl = input.signatureUrl
    ? await makeSignatureTransparent(input.signatureUrl)
    : null;

  openPrintableHtml(
    buildReturnReceiptHtml({
      ...input,
      signatureUrl,
    })
  );
}

function flattenReceiptLines(
  receipts: StandardAccountReturnPdfSource['receipts']
): StandardAccountReturnPdfReceiptLine[] {
  if (!receipts?.length) return [];
  return receipts.flatMap((r) => r.lines ?? []);
}

function mapSourceToInput(
  source: StandardAccountReturnPdfSource,
  evidence: { signatureUrl: string | null }
): StandardAccountReturnPdfInput {
  const receiptLines = flattenReceiptLines(source.receipts);
  const fillInspection = shouldFillInspection(source.status, receiptLines.length > 0);

  type Agg = {
    qtyGood: number;
    qtyDamaged: number;
    batchParts: string[];
  };

  const byVariantId = new Map<string, Agg>();
  const byProductKey = new Map<string, Agg>();

  const bump = (map: Map<string, Agg>, key: string, line: StandardAccountReturnPdfReceiptLine) => {
    if (!key) return;
    const existing = map.get(key) ?? { qtyGood: 0, qtyDamaged: 0, batchParts: [] };
    existing.qtyGood += Number(line.qtyGood) || 0;
    existing.qtyDamaged += Number(line.qtyDamaged) || 0;
    const goodQty = Number(line.qtyGood) || 0;
    if (goodQty > 0) {
      existing.batchParts.push(
        formatBatchLabel(line.batchNumber, line.expirationDate, goodQty)
      );
    }
    map.set(key, existing);
  };

  for (const line of receiptLines) {
    if (line.warehouseVariantId) bump(byVariantId, line.warehouseVariantId, line);
    bump(byProductKey, productKey(line.brandName, line.variantName), line);
  }

  return {
    requestNumber: source.request_number,
    status: source.status,
    createdAt: source.created_at,
    notes: source.notes,
    clientCompanyName: source.client_company?.company_name ?? null,
    destinationLocationName: source.destination_location?.name ?? null,
    destinationIsMain: source.destination_location?.is_main ?? null,
    createdByName: source.created_by_user?.full_name ?? null,
    signatureUrl: evidence.signatureUrl,
    footerNote: source.footerNote ?? null,
    companyFieldLabel: source.companyFieldLabel ?? null,
    lines: source.items.map((item) => {
      const brandName = item.variant?.brand?.name ?? null;
      const variantName = item.variant?.name ?? null;
      const base: StandardAccountReturnPdfLine = {
        brandName,
        variantName,
        returnQuantity: item.return_quantity,
      };

      if (!fillInspection) {
        // Pending (or no inspection yet): leave Good / Damaged / Batch blank for handwriting.
        return base;
      }

      const agg =
        (item.warehouse_variant_id
          ? byVariantId.get(item.warehouse_variant_id)
          : undefined) ?? byProductKey.get(productKey(brandName, variantName));

      if (!agg) {
        // Inspected status but no matching receipt line — still avoid printing misleading 0s.
        return base;
      }

      return {
        ...base,
        qtyGood: agg.qtyGood,
        qtyDamaged: agg.qtyDamaged,
        batchLabel: agg.batchParts.length > 0 ? agg.batchParts.join('; ') : null,
      };
    }),
  };
}

/** Resolve signed evidence URLs and open the return receipt PDF for an existing row. */
export async function exportStandardAccountReturnPdfFromSource(
  source: StandardAccountReturnPdfSource
): Promise<void> {
  const signedSignature = await getStandardAccountReturnEvidenceSignedUrl(source.signature_path);

  await exportStandardAccountReturnPdf(
    mapSourceToInput(source, {
      signatureUrl: signedSignature || source.signature_url || null,
    })
  );
}
