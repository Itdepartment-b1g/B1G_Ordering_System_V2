import type { Client } from '../hooks';

function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function detailField(label: string, valueHtml: string): string {
  return `
      <div class="delivery-field">
        <span class="flabel">${escapeHtml(label)}</span>
        <span class="fvalue">${valueHtml || '—'}</span>
      </div>`;
}

function formatWhen(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function buildClientHtml(client: Client): string {
  const name = escapeHtml(client.name || 'Client');
  const email = escapeHtml(client.email || '—');
  const phone = escapeHtml(client.phone || '—');
  const shop = escapeHtml(client.company || '—');
  const city = escapeHtml(client.city || '—');
  const address = escapeHtml(client.address || '—');
  const category = escapeHtml(client.category || 'Open');
  const approval = escapeHtml(client.approvalStatus || '—');
  const contact = escapeHtml(client.contactPerson || '—');
  const tin = escapeHtml(client.tin || '—');
  const lat =
    client.location != null ? escapeHtml(client.location.latitude.toFixed(6)) : '—';
  const lng =
    client.location != null ? escapeHtml(client.location.longitude.toFixed(6)) : '—';
  const photoBlock = client.photo
    ? `<img class="client-photo" src="${escapeHtml(client.photo)}" alt="${name}" />`
    : `<div class="client-photo placeholder">No photo</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Client – ${name}</title>
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
  .client-badge {
    display: inline-block;
    background: #1e3a5f;
    border: 1px solid #3b82f6;
    color: #dbeafe;
    font-size: 12px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 6px;
  }
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
  .header-row {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1.5px solid #000;
  }
  .client-photo {
    width: 96px;
    height: 96px;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid #ccc;
    background: #f3f4f6;
  }
  .client-photo.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #666;
  }
  .header-text h2 {
    margin: 0 0 4px;
    font-size: 18px;
    font-weight: 800;
  }
  .header-text .email {
    margin: 0;
    font-size: 12px;
    color: #444;
  }
  .delivery-section { margin: 8px 0 0; }
  .delivery-section .section-label { font-weight: 700; margin-bottom: 10px; }
  .delivery-field { display: flex; gap: 8px; margin-bottom: 6px; font-size: 11px; }
  .delivery-field .flabel { font-weight: 800; min-width: 140px; flex-shrink: 0; }
  .delivery-field .fvalue { flex: 1; word-break: break-word; }
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
      <h1>Client Profile
        <span class="hint">Use <b>Print</b> (Ctrl/⌘ + P), turn off <b>Headers and footers</b>, then save as PDF.</span>
      </h1>
    </div>
    <div class="toolbar-center">
      <div class="client-badge">${name}</div>
    </div>
    <div class="toolbar-right">
      <button type="button" onclick="window.print()">Print</button>
    </div>
  </div>
  <div class="page">
    <div class="doc-title">CLIENT PROFILE</div>
    <div class="header-row">
      ${photoBlock}
      <div class="header-text">
        <h2>${name}</h2>
        <p class="email">${email}</p>
      </div>
    </div>
    <div class="delivery-section">
      <div class="section-label">Client Details:</div>
      ${detailField('PHONE:', phone)}
      ${detailField('SHOP NAME:', shop)}
      ${detailField('CONTACT PERSON:', contact)}
      ${detailField('CITY:', city)}
      ${detailField('ADDRESS:', address)}
      ${detailField('LONGITUDE:', lng)}
      ${detailField('LATITUDE:', lat)}
      ${detailField('TOTAL ORDERS:', String(client.totalOrders ?? 0))}
      ${detailField('VISITS:', String(client.visitCount ?? 0))}
      ${detailField('CATEGORY:', category)}
      ${detailField('APPROVAL:', approval)}
      ${detailField('TIN:', tin)}
      ${detailField('CREATED AT:', escapeHtml(formatWhen(client.createdAt)))}
      ${detailField('LAST ORDER:', escapeHtml(formatWhen(client.lastOrder)))}
    </div>
    <div class="footer-note">Client profile · ${escapeHtml(new Date().toLocaleString())}</div>
  </div>
</body>
</html>`;
}

export async function exportClientPdf(client: Client): Promise<void> {
  const html = buildClientHtml(client);
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
