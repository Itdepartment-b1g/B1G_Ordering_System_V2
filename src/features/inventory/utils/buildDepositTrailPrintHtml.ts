import { format } from 'date-fns';

type DepositOrderBreakdown = {
  orderNumber: string;
  clientName: string;
  remittedAmount: number;
};

type CashDepositSlipRevision = {
  reason: string;
  changedByName: string;
  createdAt: string;
};

type PrintDeposit = {
  index: number;
  depositDate: string;
  createdAt?: string;
  agentName: string;
  performedByName?: string;
  bankAccount: string;
  referenceNumber?: string | null;
  notes?: string | null;
  status: string;
  displayType: string;
  totalAmt: number;
  depositSlipUrl?: string;
  orders: DepositOrderBreakdown[];
  revisions: CashDepositSlipRevision[];
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function renderDepositSection(item: PrintDeposit): string {
  const statusLabel = item.status === 'verified' ? 'Finance Verified' : 'Pending Verification';
  const ordersRows = item.orders
    .map(
      (o) => `
        <tr>
          <td>${escapeHtml(o.orderNumber)}</td>
          <td>${escapeHtml(o.clientName)}</td>
          <td style="text-align:right">${formatMoney(o.remittedAmount)}</td>
        </tr>`
    )
    .join('');

  const revisionsBlock =
    item.revisions.length > 0
      ? `<p class="meta"><strong>Slip corrections:</strong> ${item.revisions.length}</p>`
      : '';

  return `
    <section class="deposit">
      <h2>Deposit #${item.index + 1} — ${escapeHtml(item.displayType)}</h2>
      <p class="meta"><strong>Status:</strong> ${escapeHtml(statusLabel)}</p>
      <p class="meta"><strong>Date:</strong> ${escapeHtml(format(new Date(item.depositDate), 'MMMM dd, yyyy'))}</p>
      ${
        item.createdAt
          ? `<p class="meta"><strong>Recorded:</strong> ${escapeHtml(format(new Date(item.createdAt), 'MMMM dd, yyyy • h:mm a'))}</p>`
          : ''
      }
      ${item.performedByName ? `<p class="meta"><strong>Deposited by:</strong> ${escapeHtml(item.performedByName)}</p>` : ''}
      <p class="meta"><strong>Agent:</strong> ${escapeHtml(item.agentName)}</p>
      <p class="meta"><strong>Bank:</strong> ${escapeHtml(item.bankAccount)}</p>
      ${item.referenceNumber ? `<p class="meta"><strong>Reference:</strong> ${escapeHtml(item.referenceNumber)}</p>` : ''}
      ${item.notes ? `<p class="meta"><strong>Notes:</strong> ${escapeHtml(item.notes)}</p>` : ''}
      <p class="amount"><strong>Total:</strong> ${formatMoney(item.totalAmt)}</p>
      ${revisionsBlock}
      ${
        item.orders.length > 0
          ? `
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Client</th>
              <th style="text-align:right">Amount</th>
            </tr>
          </thead>
          <tbody>${ordersRows}</tbody>
        </table>`
          : ''
      }
      ${
        item.depositSlipUrl
          ? `<div class="slip"><p class="meta"><strong>Deposit slip</strong></p><img src="${escapeHtml(item.depositSlipUrl)}" alt="Deposit slip" /></div>`
          : ''
      }
    </section>
  `;
}

export function buildDepositTrailPrintHtml(dateLabel: string, deposits: PrintDeposit[]): string {
  const sections = deposits.map(renderDepositSection).join('');
  const printedAt = format(new Date(), 'MMMM dd, yyyy • h:mm a');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Deposit Trail — ${escapeHtml(dateLabel)}</title>
    <style>
      body { font-family: system-ui, sans-serif; color: #111; margin: 24px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .subtitle { color: #555; font-size: 13px; margin-bottom: 24px; }
      .deposit { page-break-inside: avoid; border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
      .deposit h2 { font-size: 16px; margin: 0 0 8px; }
      .meta { font-size: 13px; margin: 4px 0; }
      .amount { font-size: 15px; margin: 12px 0 8px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
      th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
      th { background: #f5f5f5; }
      .slip { margin-top: 12px; }
      .slip img { max-width: 100%; max-height: 420px; object-fit: contain; border: 1px solid #eee; }
      @media print { body { margin: 12px; } }
    </style>
  </head>
  <body>
    <h1>Deposit Trail</h1>
    <p class="subtitle">${escapeHtml(dateLabel)} · Printed ${escapeHtml(printedAt)} · ${deposits.length} deposit(s)</p>
    ${sections}
    <script>
      (function () {
        function triggerPrint() {
          window.focus();
          setTimeout(function () {
            window.print();
          }, 150);
        }

        function waitForImagesThenPrint() {
          var imgs = Array.prototype.slice.call(document.images);
          if (!imgs.length) {
            triggerPrint();
            return;
          }

          var pending = imgs.length;
          function onImageDone() {
            pending -= 1;
            if (pending <= 0) triggerPrint();
          }

          imgs.forEach(function (img) {
            if (img.complete) {
              onImageDone();
            } else {
              img.addEventListener('load', onImageDone, { once: true });
              img.addEventListener('error', onImageDone, { once: true });
            }
          });
        }

        if (document.readyState === 'complete') {
          waitForImagesThenPrint();
        } else {
          window.addEventListener('load', waitForImagesThenPrint, { once: true });
        }
      })();
    </script>
  </body>
</html>`;
}

/** Opens a new tab with the print HTML. Returns false if the browser blocked the popup. */
export function printDepositTrailHtml(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return true;
}
