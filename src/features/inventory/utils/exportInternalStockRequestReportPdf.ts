import {
  getItemDeliveredQty,
  getItemReceivedQty,
  getRequestDeliveryTotals,
  type SubWarehouseReceiveProof,
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

function statusLabel(status: SubWarehouseStockRequest['status']): string {
  switch (status) {
    case 'pending_approval':
      return 'Pending approval';
    case 'approved':
      return 'Approved (awaiting delivery)';
    case 'pending_receive':
      return 'Pending receive';
    case 'partially_received':
      return 'Partially received';
    case 'fully_received':
      return 'Fully received';
    case 'rejected':
      return 'Rejected';
    default:
      return status;
  }
}

function resolveReceiveProof(request: SubWarehouseStockRequest): SubWarehouseReceiveProof | null {
  if (request.receiveProofs && request.receiveProofs.length > 0) {
    return request.receiveProofs[request.receiveProofs.length - 1];
  }

  const receiveEvents = (request.history ?? []).filter((e) => e.type === 'receive_confirmed');
  const latest = receiveEvents[receiveEvents.length - 1];
  if (latest && latest.type === 'receive_confirmed') {
    return {
      at: latest.at,
      notes: latest.note || request.receiveNotes,
      proofImageDataUrl: latest.proofImageDataUrl || '',
      signatureDataUrl: latest.signatureDataUrl || '',
      lines: latest.lines,
    };
  }

  if (
    (request.status === 'partially_received' || request.status === 'fully_received') &&
    request.items.some((item) => getItemReceivedQty(item) > 0)
  ) {
    return {
      at: request.createdAt,
      notes: request.receiveNotes,
      proofImageDataUrl: '',
      signatureDataUrl: '',
      lines: request.items
        .filter((item) => getItemReceivedQty(item) > 0)
        .map((item) => ({
          variantId: item.variantId,
          variantName: item.variantName,
          brandName: item.brandName,
          quantity: getItemReceivedQty(item),
        })),
    };
  }

  return null;
}

/** Export is available once main has acted (approve/reject) or receive proof exists. */
export function canExportInternalStockRequestReport(request: SubWarehouseStockRequest): boolean {
  if (request.status === 'rejected') return true;
  if (request.status !== 'pending_approval') return true;
  if (resolveReceiveProof(request)) return true;
  return false;
}

function imgOrMuted(src: string | undefined | null, alt: string, className: string): string {
  if (src && String(src).trim()) {
    return `<img class="${className}" src="${src}" alt="${escapeHtml(alt)}" />`;
  }
  return `<p class="muted">No attachment yet.</p>`;
}

function linesTotalQty(lines: SubWarehouseReleaseLine[] | undefined): number {
  return (lines ?? []).reduce((sum, line) => sum + Math.max(0, line.quantity), 0);
}

function isBoilerplateAllocateNote(note: string | undefined): boolean {
  if (!note?.trim()) return true;
  return /^allocated\s+\d+\s+unit\(s\)\s+of\s+remaining\s+short\.?$/i.test(note.trim());
}

function eventTitle(event: SubWarehouseRequestHistoryEvent): string {
  switch (event.type) {
    case 'created':
      return 'Request created';
    case 'main_allocated':
      return 'Allocated by Main Warehouse';
    case 'approved':
      return 'Approved';
    case 'delivered':
    case 'approved_released':
      return 'Delivered';
    case 'remaining_released':
      return 'Remaining short allocated';
    case 'receive_confirmed':
      return 'Receive confirmed';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Event';
  }
}

function eventSummary(
  event: SubWarehouseRequestHistoryEvent,
  request: SubWarehouseStockRequest
): string {
  if (event.type === 'created') {
    const requested = request.items.reduce((s, i) => s + Math.max(0, i.requestedQuantity), 0);
    return `Requested ${requested.toLocaleString()} unit(s) across ${request.items.length} item(s)`;
  }
  if (event.type === 'main_allocated') {
    const qty = linesTotalQty(event.lines);
    if (qty > 0) {
      return `Main allocated ${qty.toLocaleString()} unit(s) · pending receive`;
    }
    const allocated = request.items.reduce((s, i) => s + Math.max(0, i.requestedQuantity), 0);
    return `Main allocated ${allocated.toLocaleString()} unit(s) · pending receive`;
  }
  if (event.type === 'approved') {
    return 'Approved — awaiting delivery';
  }
  if (event.type === 'delivered' || event.type === 'approved_released') {
    const qty = linesTotalQty(event.lines);
    return `Delivered ${qty.toLocaleString()} unit(s) · ${(event.lines?.length ?? 0).toLocaleString()} item(s)`;
  }
  if (event.type === 'remaining_released') {
    const qty = linesTotalQty(event.lines);
    return `Allocated ${qty.toLocaleString()} unit(s) toward remaining short`;
  }
  if (event.type === 'receive_confirmed') {
    const qty = linesTotalQty(event.lines);
    if (event.shortQuantity > 0) {
      return `Received ${qty.toLocaleString()} unit(s) · ${event.shortQuantity.toLocaleString()} left on request`;
    }
    return `Received ${qty.toLocaleString()} unit(s) · complete`;
  }
  if (event.type === 'rejected') {
    return 'Request was rejected';
  }
  return '';
}

function qtyHeaderForEvent(type: SubWarehouseRequestHistoryEvent['type']): string {
  if (type === 'receive_confirmed') return 'Received';
  if (type === 'remaining_released' || type === 'main_allocated') return 'Allocated';
  if (type === 'delivered' || type === 'approved_released') return 'Delivered';
  if (type === 'rejected') return 'Requested';
  return 'Qty';
}

function resolveEventProof(event: SubWarehouseRequestHistoryEvent): string | undefined {
  if ('proofImageDataUrl' in event) return event.proofImageDataUrl;
  return undefined;
}

function resolveEventSignature(
  event: SubWarehouseRequestHistoryEvent,
  request: SubWarehouseStockRequest
): string | undefined {
  if (event.type === 'delivered' || event.type === 'approved_released') {
    return event.signatureDataUrl || request.approvalSignatureUrl;
  }
  if (event.type === 'rejected') {
    return event.signatureDataUrl || request.rejectionSignatureUrl;
  }
  if ('signatureDataUrl' in event) return event.signatureDataUrl;
  return undefined;
}

function signatureLabelForEvent(type: SubWarehouseRequestHistoryEvent['type']): string {
  switch (type) {
    case 'delivered':
    case 'approved_released':
      return 'Delivery signature';
    case 'remaining_released':
      return 'Allocator signature';
    case 'receive_confirmed':
      return 'Receive signature';
    case 'rejected':
      return 'Rejection signature';
    default:
      return 'Signature';
  }
}

function renderLinesTable(
  lines: SubWarehouseReleaseLine[] | undefined,
  qtyHeader: string
): string {
  if (!lines || lines.length === 0) return '';
  const rows = lines
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.brandName?.trim() || '—')}</td>
        <td>${escapeHtml(line.variantName)}</td>
        <td class="num">${line.quantity.toLocaleString()}</td>
      </tr>`
    )
    .join('');
  return `
    <table class="lines compact">
      <thead>
        <tr>
          <th>Brand</th>
          <th>Variant</th>
          <th style="text-align:right;">${escapeHtml(qtyHeader)}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderEventAttachments(
  event: SubWarehouseRequestHistoryEvent,
  request: SubWarehouseStockRequest
): string {
  const showProof =
    event.type === 'delivered' ||
    event.type === 'approved_released' ||
    event.type === 'remaining_released' ||
    event.type === 'receive_confirmed';
  const showSignature =
    event.type === 'delivered' ||
    event.type === 'approved_released' ||
    event.type === 'remaining_released' ||
    event.type === 'receive_confirmed' ||
    event.type === 'rejected';

  if (!showProof && !showSignature) return '';

  const proof = resolveEventProof(event);
  const signature = resolveEventSignature(event, request);
  const boxes: string[] = [];

  if (showProof) {
    boxes.push(`
      <div class="attach-box">
        <h4>Proof photo</h4>
        ${imgOrMuted(proof, 'Proof photo', 'attach')}
      </div>`);
  }
  if (showSignature) {
    boxes.push(`
      <div class="attach-box">
        <h4>${escapeHtml(signatureLabelForEvent(event.type))}</h4>
        ${imgOrMuted(signature, signatureLabelForEvent(event.type), 'signature')}
      </div>`);
  }

  return `<div class="attachments">${boxes.join('')}</div>`;
}

function renderActivityEvent(
  event: SubWarehouseRequestHistoryEvent,
  request: SubWarehouseStockRequest
): string {
  const lines = 'lines' in event ? event.lines : undefined;
  const summary = eventSummary(event, request);
  const note =
    event.type === 'rejected'
      ? event.note || request.rejectionReason
      : event.note && !isBoilerplateAllocateNote(event.note)
        ? event.note
        : undefined;

  const leftOnRequestBadge =
    event.type === 'receive_confirmed' && event.shortQuantity > 0
      ? `<span class="pill amber">${event.shortQuantity.toLocaleString()} left on request</span>`
      : '';

  return `
    <article class="activity-item">
      <div class="activity-head">
        <div>
          <h4>${escapeHtml(eventTitle(event))}</h4>
          ${summary ? `<p class="activity-summary">${escapeHtml(summary)}</p>` : ''}
          <p class="activity-meta">${escapeHtml(formatDateTime(event.at))}${
            event.byName ? ` · ${escapeHtml(event.byName)}` : ''
          }</p>
        </div>
        ${leftOnRequestBadge}
      </div>
      ${
        lines && lines.length > 0
          ? renderLinesTable(lines, qtyHeaderForEvent(event.type))
          : ''
      }
      ${
        note
          ? `<div class="notes" style="margin-bottom:12px;">${escapeHtml(
              event.type === 'rejected' ? `Reason: ${note}` : note
            )}</div>`
          : ''
      }
      ${renderEventAttachments(event, request)}
    </article>`;
}

function buildUnifiedHtml(request: SubWarehouseStockRequest): string {
  const title =
    request.initiationType === 'main_allocation'
      ? `Stock Allocation Report – ${request.requestNumber}`
      : `Stock Request Report – ${request.requestNumber}`;
  const totals = getRequestDeliveryTotals(request.items);
  const totalReceived = totals.received;
  // Match dialog: short displays as 0 until something has been received.
  const shortDisplay = totalReceived > 0 ? totals.short : 0;
  const showDeliveryCols =
    request.status === 'pending_receive' ||
    request.status === 'partially_received' ||
    request.status === 'fully_received' ||
    totals.delivered > 0 ||
    totals.received > 0;

  const historyOldestFirst = [...(request.history ?? [])].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );

  const lineRows = request.items
    .map((item) => {
      const brand = item.brandName?.trim() || '—';
      const delivered = getItemDeliveredQty(item);
      const received = getItemReceivedQty(item);
      const short = Math.max(0, delivered - received);
      const shortCell = totalReceived > 0 ? (short > 0 ? short.toLocaleString() : '0') : '0';
      return `
        <tr>
          <td>${escapeHtml(brand)}</td>
          <td>${escapeHtml(item.variantName)}</td>
          <td class="num">${item.requestedQuantity.toLocaleString()}</td>
          ${
            showDeliveryCols
              ? `<td class="num">${delivered.toLocaleString()}</td>
                 <td class="num">${received.toLocaleString()}</td>
                 <td class="num">${shortCell}</td>`
              : ''
          }
        </tr>`;
    })
    .join('');

  const colCount = showDeliveryCols ? 6 : 3;

  const activityHtml =
    historyOldestFirst.length > 0
      ? historyOldestFirst.map((event) => renderActivityEvent(event, request)).join('')
      : `<p class="muted">No timeline events yet.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: Arial, sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 16px; background: #111827; color: #fff; }
  .toolbar h1 { margin: 0; font-size: 14px; font-weight: 600; }
  .toolbar button { background: #22c55e; color: #000; border: 0; padding: 8px 16px; font-weight: 700; border-radius: 4px; cursor: pointer; }
  .page { width: 210mm; min-height: 297mm; margin: 16px auto; padding: 12mm 10mm; background: #fff; box-shadow: 0 4px 16px rgba(0,0,0,0.18); font-size: 12px; }
  h2 { margin: 0 0 4px; font-size: 18px; }
  .subtitle { margin: 0 0 16px; color: #6b7280; font-size: 12px; border-bottom: 2px solid #fbbf24; padding-bottom: 8px; }
  .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin-bottom: 16px; }
  .summary dt { font-size: 10px; text-transform: uppercase; color: #6b7280; margin-bottom: 2px; }
  .summary dd { margin: 0; font-weight: 600; }
  table.lines { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px; }
  table.lines.compact { margin-bottom: 12px; }
  table.lines th { background: #fef3c7; text-align: left; padding: 8px 10px; border: 1px solid #d1d5db; }
  table.lines td { padding: 8px 10px; border: 1px solid #e5e7eb; }
  table.lines td.num { text-align: right; }
  .section { margin-bottom: 20px; }
  .section h3 { margin: 0 0 10px; font-size: 13px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  .notes { white-space: pre-wrap; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: #f9fafb; }
  .muted { color: #6b7280; font-style: italic; margin: 0; }
  .attachments { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
  .attach-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; min-height: 120px; page-break-inside: avoid; }
  .attach-box h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; }
  img.attach { max-width: 100%; max-height: 200px; object-fit: contain; display: block; margin: 0 auto; }
  img.signature { max-width: 100%; max-height: 110px; object-fit: contain; display: block; margin: 0 auto; background: #fff; border: 1px solid #f3f4f6; }
  .activity-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 12px; page-break-inside: avoid; }
  .activity-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 8px; }
  .activity-head h4 { margin: 0 0 4px; font-size: 13px; }
  .activity-summary { margin: 0 0 4px; color: #374151; }
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
    <h2>${
      request.initiationType === 'main_allocation'
        ? 'Internal Stock Allocation Report'
        : 'Internal Stock Request Report'
    }</h2>
    <p class="subtitle">Activity timeline with quantities and attachments</p>

    <dl class="summary">
      <div><dt>${
        request.initiationType === 'main_allocation' ? 'Allocation number' : 'Request number'
      }</dt><dd>${escapeHtml(request.requestNumber)}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(statusLabel(request.status))}</dd></div>
      <div><dt>Sub-warehouse</dt><dd>${escapeHtml(request.fromLocationName)}</dd></div>
      <div><dt>${
        request.initiationType === 'main_allocation' ? 'Allocated by' : 'Requested by'
      }</dt><dd>${escapeHtml(
        request.initiationType === 'main_allocation'
          ? request.requestedByName
            ? `Main Warehouse · ${request.requestedByName}`
            : 'Main Warehouse'
          : request.requestedByName || '—'
      )}</dd></div>
      <div><dt>Created</dt><dd>${escapeHtml(formatDateTime(request.createdAt))}</dd></div>
      <div><dt>Requested total</dt><dd>${request.items
        .reduce((s, i) => s + i.requestedQuantity, 0)
        .toLocaleString()}</dd></div>
      ${
        showDeliveryCols
          ? `<div><dt>Delivered / Received / Short</dt><dd>${totals.delivered.toLocaleString()} / ${totals.received.toLocaleString()} / ${shortDisplay.toLocaleString()}</dd></div>`
          : ''
      }
    </dl>

    <div class="section">
      <h3>Request items</h3>
      <table class="lines">
        <thead>
          <tr>
            <th>Brand</th>
            <th>Variant</th>
            <th style="text-align:right;">Requested</th>
            ${
              showDeliveryCols
                ? `<th style="text-align:right;">Delivered</th>
                   <th style="text-align:right;">Received</th>
                   <th style="text-align:right;">Short</th>`
                : ''
            }
          </tr>
        </thead>
        <tbody>
          ${
            lineRows ||
            `<tr><td colspan="${colCount}" style="text-align:center;font-style:italic;color:#6b7280;">No items</td></tr>`
          }
        </tbody>
      </table>
    </div>

    <div class="section">
      <h3>Request notes</h3>
      ${
        request.notes
          ? `<div class="notes">${escapeHtml(request.notes)}</div>`
          : `<p class="muted">No request notes.</p>`
      }
    </div>

    <div class="section">
      <h3>Activity timeline</h3>
      ${activityHtml}
    </div>

    <div class="footer">
      Generated from internal stock request · ${escapeHtml(formatDateTime(new Date().toISOString()))}
    </div>
  </div>
</body>
</html>`;
}

/** Opens a printable HTML report with main + sub attachments. */
export async function exportInternalStockRequestReportPdf(
  request: SubWarehouseStockRequest
): Promise<void> {
  openPrintableHtml(
    `Stock Request Report – ${request.requestNumber}`,
    buildUnifiedHtml(request)
  );
}
