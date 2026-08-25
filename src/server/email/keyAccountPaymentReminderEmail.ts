import { sendMail } from './sendMail';

export type KeyAccountPoPaymentReminderEmailItem = {
  brandName?: string | null;
  variantName?: string | null;
  variantType?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
};

export type KeyAccountPoPaymentReminderEmailParams = {
  to: string;
  poNumber: string;
  greetingName?: string | null;
  clientName?: string | null;
  paymentTerms?: string | null;
  notificationDate?: string | null;
  poViewUrl?: string | null;
  totalAmount?: number | null;
  items?: KeyAccountPoPaymentReminderEmailItem[] | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sectionHeading(label: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin: 0 0 10px 0;">
                            <tr>
                                <td style="width: 3px; background: #5B28D6; border-radius: 2px; line-height: 12px; font-size: 0;">&nbsp;</td>
                                <td style="padding-left: 8px; font-size: 12px; font-weight: 700; color: #6b6b6b; text-transform: uppercase; letter-spacing: 0.06em;">${escapeHtml(label)}</td>
                            </tr>
                        </table>`;
}

function formatPhp(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function generateKeyAccountPoPaymentReminderHTML(data: KeyAccountPoPaymentReminderEmailParams): string {
  const poNumber = escapeHtml(String(data.poNumber || ''));
  const greetingName = escapeHtml(String(data.greetingName || 'there'));
  const clientName = escapeHtml(String(data.clientName || '—'));
  const paymentTerms = escapeHtml(String(data.paymentTerms || '—'));
  const notificationDate = escapeHtml(String(data.notificationDate || '—'));
  const poViewUrl =
    data.poViewUrl?.trim() && /^https?:\/\//i.test(data.poViewUrl.trim())
      ? escapeHtml(data.poViewUrl.trim())
      : '';

  const items = Array.isArray(data.items) ? data.items : [];
  const itemsTotal = items.reduce((sum, it) => {
    const qty = Number(it.quantity) || 0;
    const unit = Number(it.unitPrice) || 0;
    const line = Number(it.lineTotal) || qty * unit;
    return sum + line;
  }, 0);
  const poTotal = data.totalAmount == null ? itemsTotal : Number(data.totalAmount) || itemsTotal;

  const itemsRows =
    items.length > 0
      ? items
          .map((it, index) => {
            const brand = escapeHtml(String(it.brandName || '').trim() || '—');
            const variant = escapeHtml(String(it.variantName || '').trim() || '—');
            const type = it.variantType?.trim()
              ? ` · ${escapeHtml(it.variantType.trim())}`
              : '';
            const qty = Number(it.quantity) || 0;
            const unit = Number(it.unitPrice) || 0;
            const line = Number(it.lineTotal) || qty * unit;
            const isLast = index === items.length - 1;
            const rowBg = index % 2 === 0 ? '#ffffff' : '#fcfcfd';
            const border = isLast ? '' : 'border-bottom: 1px solid #f1f1f1;';
            return `<tr style="background: ${rowBg};">
                                    <td style="padding: 12px; ${border} vertical-align: top;">
                                        <div style="font-weight: 600; color: #111;">${brand}</div>
                                        <div style="font-size: 13px; color: #777; margin-top: 2px;">${variant}${type}</div>
                                    </td>
                                    <td align="right" style="padding: 12px 8px; ${border} vertical-align: top; white-space: nowrap; font-weight: 600; color: #555;">${qty.toLocaleString()}</td>
                                    <td align="right" style="padding: 12px 8px; ${border} vertical-align: top; white-space: nowrap; color: #555;">${formatPhp(unit)}</td>
                                    <td align="right" style="padding: 12px; ${border} vertical-align: top; white-space: nowrap; font-weight: 700; color: #111;">${formatPhp(line)}</td>
                                </tr>`;
          })
          .join('')
      : `<tr><td colspan="4" style="padding: 14px 12px; color: #888; font-size: 13px;">No line items on this PO.</td></tr>`;

  const itemsTable = `
                            <div style="margin: 18px 0 0 0;">
                                ${sectionHeading('Ordered items')}
                                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 14px; color: #333; border: 1px solid #ececec; border-radius: 8px; overflow: hidden;">
                                    <thead>
                                        <tr>
                                            <th align="left" style="padding: 10px 12px; background: #fafafa; border-bottom: 1px solid #ececec; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.04em;">Item</th>
                                            <th align="right" style="padding: 10px 8px; background: #fafafa; border-bottom: 1px solid #ececec; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;">Qty</th>
                                            <th align="right" style="padding: 10px 8px; background: #fafafa; border-bottom: 1px solid #ececec; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;">Unit</th>
                                            <th align="right" style="padding: 10px 12px; background: #fafafa; border-bottom: 1px solid #ececec; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${itemsRows}
                                        <tr>
                                            <td colspan="3" align="right" style="padding: 12px 8px; background: #fafafa; border-top: 1px solid #ececec; font-size: 12px; font-weight: 700; color: #6b6b6b; text-transform: uppercase; letter-spacing: 0.04em;">PO total</td>
                                            <td align="right" style="padding: 12px; background: #fafafa; border-top: 1px solid #ececec; font-weight: 700; color: #5B28D6; white-space: nowrap;">${formatPhp(poTotal)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>`;

  const ctaBlock = poViewUrl
    ? `
            <table cellpadding="0" cellspacing="0" style="margin-top: 22px;">
                <tr>
                    <td>
                        <a href="${poViewUrl}" style="display: inline-block; padding: 12px 22px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px; background: #5B28D6;">
                            View Purchase Order &rarr;
                        </a>
                    </td>
                </tr>
            </table>
        `
    : '';

  return `
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
        <tr>
            <td align="center">
                <table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #eaeaea;border-radius:10px;overflow:hidden;">
                    <tr>
                        <td style="padding:24px 24px 8px 24px;">
                            ${sectionHeading('Payment Reminder')}
                            <h1 style="margin: 0 0 6px 0; font-size: 21px; color: #111; font-weight: 700;">Hi ${greetingName},</h1>
                            <p style="margin: 0 0 14px 0; font-size: 15px; color: #555;">
                                This is an internal reminder for the assigned KAM:
                                <strong>PO ${poNumber}</strong> is expected to be paid based on the selected payment terms.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 0 24px 22px 24px;">
                            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #efefef;border-radius:8px;overflow:hidden;">
                                <tr>
                                    <td style="padding: 12px 14px; background: #fafafa; font-size: 12px; color:#6b6b6b; text-transform: uppercase; letter-spacing:0.06em; font-weight:700;">
                                        Client
                                    </td>
                                    <td style="padding: 12px 14px; font-size: 14px; color:#111; font-weight:600;">
                                        ${clientName}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 14px; background: #fafafa; font-size: 12px; color:#6b6b6b; text-transform: uppercase; letter-spacing:0.06em; font-weight:700;">
                                        Payment terms
                                    </td>
                                    <td style="padding: 12px 14px; font-size: 14px; color:#111; font-weight:600;">
                                        ${paymentTerms}
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 12px 14px; background: #fafafa; font-size: 12px; color:#6b6b6b; text-transform: uppercase; letter-spacing:0.06em; font-weight:700;">
                                        Notify on
                                    </td>
                                    <td style="padding: 12px 14px; font-size: 14px; color:#111; font-weight:600;">
                                        ${notificationDate}
                                    </td>
                                </tr>
                            </table>

                            ${itemsTable}

                            ${ctaBlock}

                            <div style="margin-top: 18px; padding-top: 16px; border-top:1px solid #f0f0f0;">
                                <p style="margin:0;font-size:12px;color:#a3a3a3;">
                                    You can review this PO anytime in Key Account Purchase Orders.
                                </p>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

/** Internal KAM pay-reminder. Fail-soft: returns false on skip/error. */
export async function sendKeyAccountPoPaymentReminderEmail(
  params: KeyAccountPoPaymentReminderEmailParams
): Promise<boolean> {
  if (!params.to?.trim() || !params.poNumber?.trim()) {
    console.warn('⚠️ Skipping KA payment reminder email: missing to or poNumber');
    return false;
  }

  const result = await sendMail({
    to: params.to.trim(),
    subject: `PO ${params.poNumber} payment reminder`,
    html: generateKeyAccountPoPaymentReminderHTML(params),
  });

  if (!result.ok) {
    console.error('⚠️ Failed to send KA PO payment reminder email:', result.error);
    return false;
  }
  return true;
}
