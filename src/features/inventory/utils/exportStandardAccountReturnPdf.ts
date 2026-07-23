import { getStandardAccountReturnEvidenceSignedUrl } from './uploadStandardAccountReturnEvidence';

export type StandardAccountReturnPdfLine = {
  brandName?: string | null;
  variantName?: string | null;
  returnQuantity: number;
  inspectedQuantity?: number | null;
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
  items: Array<{
    return_quantity: number;
    inspected_quantity?: number | null;
    variant?: {
      name: string;
      brand?: { name: string } | null;
    } | null;
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

function fmtQty(n: number): string {
  return Number(n || 0).toLocaleString();
}

function statusLabel(status: string | null | undefined): string {
  switch (status) {
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

function itemRowsHtml(lines: StandardAccountReturnPdfLine[]): {
  html: string;
  showInspected: boolean;
} {
  const showInspected = lines.some((l) => l.inspectedQuantity != null);
  const rows = lines.map((line) => {
    const name = `${line.brandName ? `${line.brandName} — ` : ''}${line.variantName || 'Item'}`;
    return `
      <tr>
        <td class="col-desc">${escapeHtml(name)}</td>
        <td class="col-qty">${fmtQty(line.returnQuantity)}</td>
        ${
          showInspected
            ? `<td class="col-qty">${fmtQty(Number(line.inspectedQuantity ?? 0))}</td>`
            : ''
        }
      </tr>`;
  });

  if (rows.length === 0) {
    rows.push(`
      <tr>
        <td class="col-desc">&nbsp;</td>
        <td class="col-qty">&nbsp;</td>
        ${showInspected ? '<td class="col-qty">&nbsp;</td>' : ''}
      </tr>`);
  }

  return { html: rows.join(''), showInspected };
}

function buildReturnReceiptHtml(input: StandardAccountReturnPdfInput): string {
  const itemResult = itemRowsHtml(input.lines);
  const totalReturned = input.lines.reduce((s, l) => s + Number(l.returnQuantity || 0), 0);
  const totalInspected = input.lines.reduce(
    (s, l) => s + Number(l.inspectedQuantity ?? 0),
    0
  );
  const rtNo = escapeHtml(input.requestNumber);
  const dest = escapeHtml(destinationLabel(input));
  const status = escapeHtml(statusLabel(input.status));

  const signatureImgHtml = input.signatureUrl
    ? `<img class="sig-img" src="${escapeHtml(input.signatureUrl)}" alt="Return signature" />`
    : `<span class="sline"></span>`;

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
      <div class="logo-b1g">B1G</div>
      <div class="logo-corp">CORPORATION</div>
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
          ${itemResult.showInspected ? '<th class="col-qty">Inspected</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${itemResult.html}
      </tbody>
    </table>
    <div class="totals-note">
      Total returned: ${fmtQty(totalReturned)} unit(s)${
        itemResult.showInspected
          ? ` · Inspected: ${fmtQty(totalInspected)} unit(s)`
          : ''
      }
    </div>

    <div class="delivery-section">
      <div class="section-label">Return Details:</div>
      ${
        input.clientCompanyName?.trim()
          ? `<div class="delivery-field">
        <span class="flabel">COMPANY:</span>
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
      Standard Account return to warehouse · ${escapeHtml(formatDateTime(new Date().toISOString()))}
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

function mapSourceToInput(
  source: StandardAccountReturnPdfSource,
  evidence: { signatureUrl: string | null }
): StandardAccountReturnPdfInput {
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
    lines: source.items.map((item) => ({
      brandName: item.variant?.brand?.name ?? null,
      variantName: item.variant?.name ?? null,
      returnQuantity: item.return_quantity,
      inspectedQuantity: item.inspected_quantity ?? null,
    })),
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
