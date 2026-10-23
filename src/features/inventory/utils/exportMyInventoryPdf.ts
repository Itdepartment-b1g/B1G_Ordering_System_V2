export type MyInventoryPdfLine = {
  brandName: string;
  variantName: string;
  variantType: string | null;
  quantity: number;
  price: number | null;
  dspPrice: number | null;
  rspPrice: number | null;
  status: string;
};

export type MyInventoryPdfInput = {
  heldByName?: string | null;
  printedAt?: string | null;
  lines: MyInventoryPdfLine[];
};

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function typeLabel(type: string | null | undefined): string {
  if (!type?.trim()) return '—';
  const key = type.trim().toLowerCase();
  if (key === 'foc' || key === 'posm' || key === 'ncv') return key.toUpperCase();
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function money(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `₱${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function linesByBrand(lines: MyInventoryPdfLine[]): [string, MyInventoryPdfLine[]][] {
  const sorted = [...lines].sort((a, b) => {
    const brandCmp = a.brandName.localeCompare(b.brandName, undefined, { sensitivity: 'base' });
    if (brandCmp !== 0) return brandCmp;
    const variantCmp = a.variantName.localeCompare(b.variantName, undefined, { sensitivity: 'base' });
    if (variantCmp !== 0) return variantCmp;
    return (a.variantType || '').localeCompare(b.variantType || '', undefined, { sensitivity: 'base' });
  });

  const brands = new Map<string, MyInventoryPdfLine[]>();
  sorted.forEach((line) => {
    const name = line.brandName.trim() || 'Unknown brand';
    const list = brands.get(name) ?? [];
    list.push(line);
    brands.set(name, list);
  });
  return Array.from(brands.entries());
}

function brandBlocksHtml(lines: MyInventoryPdfLine[]): string {
  const brands = linesByBrand(lines);
  if (brands.length === 0) {
    return `<p class="empty">No stock to print.</p>`;
  }

  return brands
    .map(([brandName, brandLines]) => {
      const rows = brandLines
        .map(
          (line) => `
        <tr>
          <td>${escapeHtml(line.variantName || 'Item')}</td>
          <td>${escapeHtml(typeLabel(line.variantType))}</td>
          <td class="num">${Number(line.quantity || 0).toLocaleString()}</td>
          <td class="num">${money(line.price)}</td>
          <td class="num">${money(line.dspPrice)}</td>
          <td class="num">${money(line.rspPrice)}</td>
          <td>${escapeHtml(line.status || '—')}</td>
        </tr>`
        )
        .join('');

      return `
      <section class="brand">
        <h3>${escapeHtml(brandName)}</h3>
        <table>
          <thead>
            <tr>
              <th>Variant</th>
              <th>Variant Type</th>
              <th class="num">Qty</th>
              <th class="num">Price</th>
              <th class="num">DSP</th>
              <th class="num">RSP</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join('');
}

function buildHtml(input: MyInventoryPdfInput): string {
  const lines = input.lines;
  const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const heldBy = input.heldByName?.trim() ? escapeHtml(input.heldByName.trim()) : '—';
  const printedAt = escapeHtml(formatDateTime(input.printedAt || new Date().toISOString()));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>My Inventory</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e5e5; font-family: Arial, Helvetica, sans-serif; color: #000; }
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16px; background: #111827; color: #fff;
  }
  .toolbar h1 { margin: 0; font-size: 13px; font-weight: 600; }
  .toolbar button {
    background: #22c55e; color: #000; border: 0;
    padding: 8px 16px; font-size: 13px; font-weight: 700;
    border-radius: 4px; cursor: pointer;
  }
  .page {
    width: 210mm; min-height: 297mm; margin: 16px auto;
    padding: 12mm 12mm 18mm; background: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18); font-size: 11px;
  }
  .doc-title { text-align: center; font-size: 22px; font-weight: 800; letter-spacing: 0.06em; margin: 0 0 14px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin-bottom: 14px; }
  .meta dt { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #444; }
  .meta dd { margin: 0; font-weight: 700; }
  .brand { margin: 0 0 14px; page-break-inside: avoid; }
  .brand h3 { margin: 0; padding: 6px 8px; border: 1px solid #000; border-bottom: 0; font-size: 13px; background: #f3f4f6; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d1d5db; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; background: #fff; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty { font-style: italic; color: #6b7280; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .page { margin: 0; box-shadow: none; width: auto; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <h1>My Inventory</h1>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="page">
    <h2 class="doc-title">MY INVENTORY</h2>
    <dl class="meta">
      <div><dt>Held by</dt><dd>${heldBy}</dd></div>
      <div><dt>Date</dt><dd>${printedAt}</dd></div>
      <div><dt>Total SKUs</dt><dd>${lines.length.toLocaleString()}</dd></div>
      <div><dt>Total Qty</dt><dd>${totalQty.toLocaleString()}</dd></div>
    </dl>
    ${brandBlocksHtml(lines)}
  </div>
</body>
</html>`;
}

export function exportMyInventoryPdf(input: MyInventoryPdfInput): void {
  const html = buildHtml(input);
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
