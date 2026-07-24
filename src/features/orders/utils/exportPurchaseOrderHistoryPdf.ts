import {
  computePurchaseOrderShortQuantity,
  sortPurchaseOrderHistoryEvents,
  type PurchaseOrderHistoryEvent,
  type PurchaseOrderHistoryPayload,
} from '../purchaseOrderHistoryTypes';

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

function eventTitle(event: PurchaseOrderHistoryEvent): string {
  switch (event.type) {
    case 'created':
      return 'PO created';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'dispatched':
      return 'Dispatched';
    case 'receive_confirmed':
      return 'Receive confirmed';
    case 'cancelled':
      return 'DR cancelled';
    case 'shortage_opened':
      return 'Under investigation';
    case 'shortage_resolved_redeliver':
      return 'Found & redeliver';
    case 'shortage_resolved_write_off_replace':
      return 'Write off & replace';
    case 'shortage_resolved_write_off':
      return 'Write off';
    default:
      return 'Event';
  }
}

function linesTotal(event: PurchaseOrderHistoryEvent): number {
  return (event.lines ?? []).reduce((s, l) => s + Math.max(0, l.quantity), 0);
}

function eventSummary(event: PurchaseOrderHistoryEvent): string {
  const qty = linesTotal(event);
  switch (event.type) {
    case 'created':
      return qty > 0 ? `Ordered ${qty.toLocaleString()} unit(s)` : 'Purchase order created';
    case 'approved':
      return qty > 0 ? `Approved ${qty.toLocaleString()} unit(s)` : 'Approved for fulfillment';
    case 'dispatched': {
      const fromWh = event.warehouseLocationName?.trim();
      return fromWh
        ? `Dispatched ${qty.toLocaleString()} unit(s) · from ${fromWh}`
        : `Dispatched ${qty.toLocaleString()} unit(s)`;
    }
    case 'receive_confirmed': {
      const fromWh = event.warehouseLocationName?.trim();
      const fromPart = fromWh ? ` · from ${fromWh}` : '';
      return (event.shortQuantity ?? 0) > 0
        ? `Received ${qty.toLocaleString()} · ${(event.shortQuantity ?? 0).toLocaleString()} left on DR${fromPart}`
        : `Received ${qty.toLocaleString()} unit(s) · complete${fromPart}`;
    }
    case 'rejected':
      return 'Purchase order was rejected';
    case 'cancelled':
      return `Cancelled DR · ${qty.toLocaleString()} unit(s)`;
    case 'shortage_opened': {
      const reasons = [
        ...new Set((event.lines ?? []).map((l) => l.reason).filter(Boolean)),
      ] as string[];
      const reasonPart = reasons.length === 1 ? ` · ${reasons[0]}` : '';
      return `${(event.shortQuantity ?? qty).toLocaleString()} unit(s) under investigation${reasonPart}`;
    }
    case 'shortage_resolved_redeliver':
      return `Found ${qty.toLocaleString()} unit(s) · stock restored · PO reopened`;
    case 'shortage_resolved_write_off_replace':
      return `Wrote off ${qty.toLocaleString()} unit(s) · replacement DR allowed`;
    case 'shortage_resolved_write_off':
      return `Wrote off ${qty.toLocaleString()} unit(s) · no redispatch`;
    default:
      return '';
  }
}

export function exportPurchaseOrderHistoryPdf(payload: PurchaseOrderHistoryPayload): void {
  const ordered = payload.items.reduce((s, i) => s + i.orderedQuantity, 0);
  const dispatched = payload.items.reduce((s, i) => s + i.dispatchedQuantity, 0);
  const received = payload.items.reduce((s, i) => s + i.receivedQuantity, 0);
  const short = computePurchaseOrderShortQuantity(payload.items, payload.history);

  const itemRows = payload.items
    .map(
      (item) => `<tr>
      <td>${escapeHtml(item.brandName || '—')}</td>
      <td>${escapeHtml(item.variantName)}</td>
      <td style="text-align:right;">${item.orderedQuantity.toLocaleString()}</td>
      <td style="text-align:right;">${item.dispatchedQuantity.toLocaleString()}</td>
      <td style="text-align:right;">${item.receivedQuantity.toLocaleString()}</td>
    </tr>`
    )
    .join('');

  const historyOldestFirst = sortPurchaseOrderHistoryEvents(payload.history, 'asc');

  const activityHtml = historyOldestFirst
    .map((event) => {
      const lineRows = (event.lines ?? [])
        .map(
          (line) => `<tr>
          <td>${escapeHtml(line.brandName || '—')}</td>
          <td>${escapeHtml(line.variantName)}</td>
          <td>${escapeHtml(line.reason || '—')}</td>
          <td style="text-align:right;">${line.quantity.toLocaleString()}</td>
        </tr>`
        )
        .join('');

      const attachments: string[] = [];
      if (event.proofImageDataUrl) {
        attachments.push(`
          <div class="attach-box">
            <h4>Proof photo</h4>
            <img class="attach" src="${escapeHtml(event.proofImageDataUrl)}" alt="Proof" />
          </div>`);
      }
      if (event.signatureDataUrl) {
        attachments.push(`
          <div class="attach-box">
            <h4>Signature</h4>
            <img class="signature" src="${escapeHtml(event.signatureDataUrl)}" alt="Signature" />
          </div>`);
      }

      return `
      <div class="activity-item">
        <div class="activity-head">
          <div>
            <h4>${escapeHtml(eventTitle(event))}</h4>
            <p class="activity-summary">${escapeHtml(eventSummary(event))}</p>
            <p class="activity-meta">${escapeHtml(formatDateTime(event.at))}${
              event.byName ? ` · ${escapeHtml(event.byName)}` : ''
            }</p>
          </div>
          ${
            (event.type === 'receive_confirmed' || event.type === 'shortage_opened') &&
            (event.shortQuantity ?? 0) > 0
              ? `<span class="pill amber">${
                  event.type === 'shortage_opened'
                    ? `${(event.shortQuantity ?? 0).toLocaleString()} under investigation`
                    : `${(event.shortQuantity ?? 0).toLocaleString()} left on DR`
                }</span>`
              : ''
          }
        </div>
        ${
          event.note
            ? `<div class="notes"><strong>Note:</strong> ${escapeHtml(event.note)}</div>`
            : ''
        }
        ${
          lineRows
            ? `<table class="lines"><thead><tr><th>Brand</th><th>Variant</th><th>Reason</th><th style="text-align:right;">Qty</th></tr></thead><tbody>${lineRows}</tbody></table>`
            : ''
        }
        ${attachments.length ? `<div class="attachments">${attachments.join('')}</div>` : ''}
      </div>`;
    })
    .join('');

  const title = `PO History — ${payload.poNumber}`;
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #f3f4f6; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; background: #111827; color: #fff; }
  .toolbar h1 { margin: 0; font-size: 14px; font-weight: 600; }
  .toolbar button { border: 0; border-radius: 6px; padding: 8px 12px; background: #fff; color: #111827; font-weight: 600; cursor: pointer; }
  .page { max-width: 820px; margin: 24px auto; background: #fff; padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  h2 { margin: 0 0 4px; font-size: 20px; }
  .subtitle { margin: 0 0 18px; color: #6b7280; font-size: 13px; }
  dl.summary { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 0 0 20px; }
  dl.summary dt { font-size: 11px; text-transform: uppercase; color: #6b7280; }
  dl.summary dd { margin: 2px 0 0; font-weight: 600; }
  .section { margin-top: 22px; }
  .section h3 { margin: 0 0 10px; font-size: 13px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  table.lines { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  table.lines th, table.lines td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
  table.lines th { background: #f9fafb; font-size: 11px; }
  .notes { white-space: pre-wrap; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: #f9fafb; margin-top: 8px; font-size: 12px; }
  .attachments { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
  .attach-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; min-height: 120px; page-break-inside: avoid; }
  .attach-box h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; }
  img.attach { max-width: 100%; max-height: 200px; object-fit: contain; display: block; margin: 0 auto; }
  img.signature { max-width: 100%; max-height: 110px; object-fit: contain; display: block; margin: 0 auto; background: #fff; border: 1px solid #f3f4f6; }
  .activity-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px; page-break-inside: avoid; }
  .activity-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 8px; }
  .activity-head h4 { margin: 0 0 4px; font-size: 13px; }
  .activity-summary { margin: 0 0 4px; color: #374151; font-size: 12px; }
  .activity-meta { margin: 0; font-size: 11px; color: #6b7280; }
  .pill { display: inline-block; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
  .pill.amber { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
  .footer { margin-top: 28px; font-size: 10px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .page { margin: 0; box-shadow: none; width: auto; min-height: auto; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <h1>${escapeHtml(title)}</h1>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="page">
    <h2>Purchase Order History</h2>
    <p class="subtitle">Activity timeline with quantities and attachments</p>

    <dl class="summary">
      <div><dt>PO number</dt><dd>${escapeHtml(payload.poNumber)}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(payload.workflowStatus || payload.status)}</dd></div>
      <div><dt>Created</dt><dd>${escapeHtml(formatDateTime(payload.createdAt))}</dd></div>
      <div><dt>Ordered / Dispatched / Received / Short</dt>
        <dd>${ordered.toLocaleString()} / ${dispatched.toLocaleString()} / ${received.toLocaleString()} / ${short.toLocaleString()}</dd>
      </div>
    </dl>

    <div class="section">
      <h3>Order items</h3>
      <table class="lines">
        <thead>
          <tr>
            <th>Brand</th>
            <th>Variant</th>
            <th style="text-align:right;">Ordered</th>
            <th style="text-align:right;">Dispatched</th>
            <th style="text-align:right;">Received</th>
          </tr>
        </thead>
        <tbody>
          ${
            itemRows ||
            `<tr><td colspan="5" style="text-align:center;font-style:italic;color:#6b7280;">No items</td></tr>`
          }
        </tbody>
      </table>
    </div>

    <div class="section">
      <h3>Timeline</h3>
      ${
        activityHtml ||
        `<p style="color:#6b7280;font-style:italic;">No history events.</p>`
      }
    </div>

    <p class="footer">Generated ${escapeHtml(formatDateTime(new Date().toISOString()))}</p>
  </div>
</body>
</html>`;

  openPrintableHtml(title, html);
}
