import type { AllocationHistoryGroup } from './allocationHistoryMappers';
import { allocationTypeLabel, formatManilaDateTime } from '../table/TableRow';

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function variantTypeLabel(type: string | null): string {
  if (!type) return '—';
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'Flavor';
  if (normalized === 'battery') return 'Battery';
  if (normalized === 'foc') return 'FOC';
  return type;
}

function buildAllocationHistoryHtml(group: AllocationHistoryGroup): string {
  const title = `Allocation – ${formatManilaDateTime(group.createdAt)}`;
  const variantRows =
    group.lines.length === 0
      ? `<tr><td colspan="4" style="text-align:center;font-style:italic;color:#6b7280;">No linked variant lines</td></tr>`
      : group.lines
          .map(
            (line) => `
        <tr>
          <td>${escapeHtml(line.brandName)}</td>
          <td>${escapeHtml(line.variantName)}</td>
          <td>${escapeHtml(variantTypeLabel(line.variantType))}</td>
          <td class="num">${line.quantity.toLocaleString()}</td>
        </tr>`
          )
          .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    background: #e5e7eb;
    font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
    color: #111827;
  }
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 16px;
    background: #111827; color: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  }
  .toolbar h1 { margin: 0; font-size: 13px; font-weight: 600; }
  .toolbar .hint { font-size: 11px; opacity: 0.75; margin-left: 10px; }
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
    padding: 12mm 10mm;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    font-size: 12px;
    line-height: 1.4;
  }
  h2 {
    margin: 0 0 16px;
    font-size: 18px;
    border-bottom: 2px solid #fbbf24;
    padding-bottom: 8px;
  }
  .summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 24px;
    margin-bottom: 24px;
  }
  .summary dt {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
    margin-bottom: 2px;
  }
  .summary dd {
    margin: 0;
    font-weight: 600;
  }
  table.variants {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  table.variants th {
    background: #fef3c7;
    text-align: left;
    padding: 8px 10px;
    border: 1px solid #d1d5db;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  table.variants td {
    padding: 8px 10px;
    border: 1px solid #e5e7eb;
  }
  table.variants td.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.variants tbody tr:nth-child(even) { background: #f9fafb; }
  .section-title {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #374151;
  }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .page { margin: 0; box-shadow: none; width: auto; min-height: auto; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <div>
      <h1>${escapeHtml(title)}</h1>
      <span class="hint">Use <b>Print</b> (or Ctrl/⌘ + P) and choose "Save as PDF".</span>
    </div>
    <button type="button" onclick="window.print()">Print</button>
  </div>
  <div class="page">
    <h2>Allocation History Record</h2>
    <dl class="summary">
      <div><dt>Date</dt><dd>${escapeHtml(formatManilaDateTime(group.createdAt))}</dd></div>
      <div><dt>Allocated To</dt><dd>${escapeHtml(group.allocatedToName)}</dd></div>
      <div><dt>Flow</dt><dd>${escapeHtml(allocationTypeLabel(group.allocationType))}</dd></div>
      <div><dt>Brand</dt><dd>${escapeHtml(group.brandName ?? '—')}</dd></div>
      <div><dt>Allocated By</dt><dd>${escapeHtml(group.allocatedByName)}</dd></div>
      <div><dt>SKUs / Total Units</dt><dd>${group.lineCount} / ${group.totalQuantity.toLocaleString()}</dd></div>
    </dl>
    <p class="section-title">Variants in this session</p>
    <table class="variants">
      <thead>
        <tr>
          <th>Brand</th>
          <th>Variant</th>
          <th>Type</th>
          <th style="text-align:right;">Quantity</th>
        </tr>
      </thead>
      <tbody>
        ${variantRows}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

export async function exportAllocationHistoryPdf(group: AllocationHistoryGroup): Promise<void> {
  const html = buildAllocationHistoryHtml(group);
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
