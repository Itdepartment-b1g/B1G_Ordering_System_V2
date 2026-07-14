import {
  getItemDeliveredQty,
  getItemReceivedQty,
  getRequestDeliveryTotals,
  type SubWarehouseReceiveProof,
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

function latestHistoryEvent(
  request: SubWarehouseStockRequest,
  type: SubWarehouseRequestHistoryEvent['type']
): SubWarehouseRequestHistoryEvent | undefined {
  const events = (request.history ?? []).filter((e) => e.type === type);
  return events[events.length - 1];
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

function buildUnifiedHtml(request: SubWarehouseStockRequest): string {
  const title = `Stock Request Report – ${request.requestNumber}`;
  const totals = getRequestDeliveryTotals(request.items);
  const showDeliveryCols =
    request.status === 'pending_receive' ||
    request.status === 'partially_received' ||
    request.status === 'fully_received' ||
    totals.delivered > 0 ||
    totals.received > 0;

  const approved = latestHistoryEvent(request, 'approved_released');
  const rejected = latestHistoryEvent(request, 'rejected');
  const receiveProof = resolveReceiveProof(request);
  const receiveEvent = latestHistoryEvent(request, 'receive_confirmed');

  const approvalSignature =
    (approved && approved.type === 'approved_released' ? approved.signatureDataUrl : undefined) ||
    request.approvalSignatureUrl;
  const rejectionSignature =
    (rejected && rejected.type === 'rejected' ? rejected.signatureDataUrl : undefined) ||
    request.rejectionSignatureUrl;

  const lineRows = request.items
    .map((item) => {
      const brand = item.brandName?.trim() || '—';
      const delivered = getItemDeliveredQty(item);
      const received = getItemReceivedQty(item);
      const short = Math.max(0, delivered - received);
      return `
        <tr>
          <td>${escapeHtml(brand)}</td>
          <td>${escapeHtml(item.variantName)}</td>
          <td class="num">${item.requestedQuantity.toLocaleString()}</td>
          ${
            showDeliveryCols
              ? `<td class="num">${delivered.toLocaleString()}</td>
                 <td class="num">${received.toLocaleString()}</td>
                 <td class="num">${short > 0 ? short.toLocaleString() : '—'}</td>`
              : ''
          }
        </tr>`;
    })
    .join('');

  const colCount = showDeliveryCols ? 6 : 3;

  const mainDecisionSection =
    request.status === 'rejected'
      ? `
    <div class="section">
      <h3>Main warehouse — Rejection</h3>
      <dl class="summary">
        <div><dt>Rejected at</dt><dd>${escapeHtml(rejected?.at ? formatDateTime(rejected.at) : '—')}</dd></div>
        <div><dt>Rejected by</dt><dd>${escapeHtml(rejected?.byName || '—')}</dd></div>
      </dl>
      <div class="notes" style="margin-bottom:12px;">
        ${escapeHtml(
          (rejected && 'note' in rejected ? rejected.note : undefined) ||
            request.rejectionReason ||
            'No rejection reason.'
        )}
      </div>
      <div class="attach-box">
        <h4>Rejection signature</h4>
        ${imgOrMuted(rejectionSignature, 'Rejection signature', 'signature')}
      </div>
    </div>`
      : `
    <div class="section">
      <h3>Main warehouse — Approval</h3>
      <dl class="summary">
        <div><dt>Approved at</dt><dd>${escapeHtml(approved?.at ? formatDateTime(approved.at) : '—')}</dd></div>
        <div><dt>Approved by</dt><dd>${escapeHtml(approved?.byName || '—')}</dd></div>
      </dl>
      <div class="attach-box">
        <h4>Approval signature</h4>
        ${
          request.status === 'pending_approval'
            ? `<p class="muted">Not approved yet.</p>`
            : imgOrMuted(approvalSignature, 'Approval signature', 'signature')
        }
      </div>
    </div>`;

  const receiveShort =
    receiveEvent && receiveEvent.type === 'receive_confirmed'
      ? receiveEvent.shortQuantity
      : totals.short;

  const subSection = `
    <div class="section">
      <h3>Sub-warehouse — Receive</h3>
      ${
        receiveProof
          ? `<dl class="summary">
        <div><dt>Received at</dt><dd>${escapeHtml(formatDateTime(receiveProof.at))}</dd></div>
        <div><dt>Received by</dt><dd>${escapeHtml(
          (receiveEvent && 'byName' in receiveEvent ? receiveEvent.byName : undefined) ||
            request.requestedByName ||
            '—'
        )}</dd></div>
        ${
          receiveShort != null && receiveShort > 0
            ? `<div><dt>Short after receive</dt><dd>${Number(receiveShort).toLocaleString()}</dd></div>`
            : ''
        }
      </dl>
      <div class="notes" style="margin-bottom:12px;">
        ${
          receiveProof.notes || request.receiveNotes
            ? escapeHtml(receiveProof.notes || request.receiveNotes || '')
            : '<span class="muted" style="font-style:italic;">No receive notes.</span>'
        }
      </div>
      <div class="attachments">
        <div class="attach-box">
          <h4>Proof photo</h4>
          ${imgOrMuted(receiveProof.proofImageDataUrl, 'Receive proof photo', 'attach')}
          ${
            receiveProof.proofImageName
              ? `<p class="muted" style="margin-top:8px;font-style:normal;">${escapeHtml(receiveProof.proofImageName)}</p>`
              : ''
          }
        </div>
        <div class="attach-box">
          <h4>Receive signature</h4>
          ${imgOrMuted(receiveProof.signatureDataUrl, 'Receive signature', 'signature')}
        </div>
      </div>`
          : `<p class="muted">No receive confirmation yet.</p>
      <div class="attachments" style="margin-top:12px;">
        <div class="attach-box"><h4>Proof photo</h4><p class="muted">No attachment yet.</p></div>
        <div class="attach-box"><h4>Receive signature</h4><p class="muted">No attachment yet.</p></div>
      </div>`
      }
    </div>`;

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
  table.lines { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; }
  table.lines th { background: #fef3c7; text-align: left; padding: 8px 10px; border: 1px solid #d1d5db; }
  table.lines td { padding: 8px 10px; border: 1px solid #e5e7eb; }
  table.lines td.num { text-align: right; }
  .section { margin-bottom: 20px; page-break-inside: avoid; }
  .section h3 { margin: 0 0 10px; font-size: 13px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  .notes { white-space: pre-wrap; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: #f9fafb; }
  .muted { color: #6b7280; font-style: italic; margin: 0; }
  .attachments { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .attach-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; min-height: 140px; }
  .attach-box h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; }
  img.attach { max-width: 100%; max-height: 220px; object-fit: contain; display: block; margin: 0 auto; }
  img.signature { max-width: 100%; max-height: 120px; object-fit: contain; display: block; margin: 0 auto; background: #fff; border: 1px solid #f3f4f6; }
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
    <h2>Internal Stock Request Report</h2>
    <p class="subtitle">Main + sub warehouse record with quantities and attachments</p>

    <dl class="summary">
      <div><dt>Request number</dt><dd>${escapeHtml(request.requestNumber)}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(statusLabel(request.status))}</dd></div>
      <div><dt>Sub-warehouse</dt><dd>${escapeHtml(request.fromLocationName)}</dd></div>
      <div><dt>Requested by</dt><dd>${escapeHtml(request.requestedByName || '—')}</dd></div>
      <div><dt>Created</dt><dd>${escapeHtml(formatDateTime(request.createdAt))}</dd></div>
      <div><dt>Requested total</dt><dd>${request.items
        .reduce((s, i) => s + i.requestedQuantity, 0)
        .toLocaleString()}</dd></div>
      ${
        showDeliveryCols
          ? `<div><dt>Delivered / Received / Short</dt><dd>${totals.delivered.toLocaleString()} / ${totals.received.toLocaleString()} / ${totals.short.toLocaleString()}</dd></div>`
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

    ${mainDecisionSection}
    ${subSection}

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
