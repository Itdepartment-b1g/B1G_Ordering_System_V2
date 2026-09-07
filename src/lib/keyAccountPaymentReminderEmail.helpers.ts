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
  paidAmount?: number | null;
  discountAmount?: number | null;
  remainingAmount?: number | null;
  items?: KeyAccountPoPaymentReminderEmailItem[] | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPhp(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function mutedLabel(text: string): string {
  return `<div style="font-size:11px;font-weight:700;color:#8a8a8a;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 4px 0;">${escapeHtml(text)}</div>`;
}

function lineAmount(it: KeyAccountPoPaymentReminderEmailItem): number {
  const qty = Number(it.quantity) || 0;
  const unit = Number(it.unitPrice) || 0;
  return Number(it.lineTotal) || qty * unit;
}

function groupItemsByBrand(items: KeyAccountPoPaymentReminderEmailItem[]) {
  const groups = new Map<
    string,
    { brandName: string; total: number; variants: KeyAccountPoPaymentReminderEmailItem[] }
  >();
  const order: string[] = [];

  for (const it of items) {
    const brandName = String(it.brandName || '').trim() || '—';
    let group = groups.get(brandName);
    if (!group) {
      group = { brandName, total: 0, variants: [] };
      groups.set(brandName, group);
      order.push(brandName);
    }
    group.total += lineAmount(it);
    group.variants.push(it);
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    group.total = Math.round(group.total * 100) / 100;
    return group;
  });
}

export function generateKeyAccountPoPaymentReminderHTML(
  data: KeyAccountPoPaymentReminderEmailParams
): string {
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
  const paid = Number(data.paidAmount) || 0;
  const discount = Number(data.discountAmount) || 0;
  const remaining =
    data.remainingAmount == null
      ? Math.max(0, Math.round((poTotal - paid - discount) * 100) / 100)
      : Math.max(0, Number(data.remainingAmount) || 0);

  const brandGroups = groupItemsByBrand(items);
  const itemsBlock =
    brandGroups.length > 0
      ? brandGroups
          .map((group, groupIndex) => {
            const brand = escapeHtml(group.brandName);
            const variantRows = group.variants
              .map((it, index) => {
                const variant = escapeHtml(String(it.variantName || '').trim() || '—');
                const type = it.variantType?.trim()
                  ? ` <span style="color:#888;">· ${escapeHtml(it.variantType.trim())}</span>`
                  : '';
                const qty = Number(it.quantity) || 0;
                const line = lineAmount(it);
                const border = index === group.variants.length - 1 ? '' : 'border-bottom: 1px solid #efefef;';
                return `<tr>
                                    <td style="padding: 9px 10px; ${border} font-size: 13px; color: #111; vertical-align: top;">
                                        ${variant}${type}
                                    </td>
                                    <td align="right" style="padding: 9px 8px; ${border} font-size: 13px; color: #555; white-space: nowrap; vertical-align: top;">
                                        ${qty.toLocaleString()}
                                    </td>
                                    <td align="right" style="padding: 9px 10px; ${border} font-size: 13px; font-weight: 600; color: #111; white-space: nowrap; vertical-align: top;">
                                        ${formatPhp(line)}
                                    </td>
                                </tr>`;
              })
              .join('');

            return `
                            <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e6e6e6; border-collapse: collapse; margin: ${groupIndex === 0 ? '0' : '12px'} 0 0 0;">
                                <tr>
                                    <td colspan="3" style="background: #111111; padding: 10px 12px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="font-size: 12px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 0.04em;">
                                                    ${brand}
                                                </td>
                                                <td align="right" style="font-size: 13px; font-weight: 700; color: #ffffff; white-space: nowrap;">
                                                    ${formatPhp(group.total)}
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <th align="left" style="padding: 8px 10px; background: #fafafa; font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #ececec;">Variant</th>
                                    <th align="right" style="padding: 8px 8px; background: #fafafa; font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #ececec; white-space: nowrap;">Qty</th>
                                    <th align="right" style="padding: 8px 10px; background: #fafafa; font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #ececec; white-space: nowrap;">Amount</th>
                                </tr>
                                ${variantRows}
                            </table>`;
          })
          .join('')
      : `<div style="padding: 12px 0; color: #888; font-size: 13px;">No line items on this PO.</div>`;

  const totalsRow = (label: string, value: string, opts?: { emphasize?: boolean; topBorder?: boolean }) => {
    const color = opts?.emphasize ? '#111111' : '#111';
    const weight = opts?.emphasize ? '700' : '600';
    const size = opts?.emphasize ? '16px' : '14px';
    const border = opts?.topBorder ? 'border-top: 1px solid #dcdcdc;' : '';
    return `<tr>
                                    <td align="left" style="padding: 10px 8px 10px 0; ${border} font-size: 12px; font-weight: 700; color: #6b6b6b; text-transform: uppercase; letter-spacing: 0.04em;">${escapeHtml(label)}</td>
                                    <td align="right" style="padding: 10px 0; ${border} white-space: nowrap; font-size: ${size}; font-weight: ${weight}; color: ${color};">${value}</td>
                                </tr>`;
  };

  const ctaBlock = poViewUrl
    ? `
                            <table cellpadding="0" cellspacing="0" align="center" style="margin: 22px auto 0 auto;">
                                <tr>
                                    <td align="center" bgcolor="#111111" style="border-radius: 8px; background: #111111;">
                                        <a href="${poViewUrl}" style="display: inline-block; padding: 12px 22px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none;">
                                            View Purchase Order &rarr;
                                        </a>
                                    </td>
                                </tr>
                            </table>
        `
    : '';

  return `
<html>
<body style="margin:0;padding:0;background:#ececec;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ececec;padding:28px 12px;">
        <tr>
            <td align="center">
                <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-collapse:collapse;box-shadow:0 8px 24px rgba(0,0,0,0.08);">
                    <tr>
                        <td align="center" style="padding: 28px 28px 24px 28px; background: #111111;">
                            <div style="font-size: 10px; font-weight: 700; color: #bdbdbd; text-transform: uppercase; letter-spacing: 0.14em; margin: 0 0 6px 0;">
                                Purchase order
                            </div>
                            <div style="font-size: 14px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 10px 0;">
                                Payment reminder
                            </div>
                            <div style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 6px 0;">
                                Hi ${greetingName},
                            </div>
                            <div style="font-size: 13px; color: #d0d0d0; line-height: 1.45; margin: 0 0 14px 0;">
                                Internal reminder for the assigned KAM. PO ${poNumber} still has a remaining balance based on the selected payment terms.
                            </div>
                            <div style="font-size: 12px; font-weight: 700; color: #bdbdbd; text-transform: uppercase; letter-spacing: 0.08em;">
                                Remaining balance
                            </div>
                            <div style="font-size: 28px; font-weight: 700; color: #ffffff; margin-top: 4px;">
                                ${formatPhp(remaining)}
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 26px 28px 28px 28px;">
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 18px;">
                                <tr>
                                    <td valign="top" width="58%" style="padding-right: 12px;">
                                        ${mutedLabel('Client')}
                                        <div style="font-size: 15px; font-weight: 700; color: #111; line-height: 1.35;">${clientName}</div>
                                    </td>
                                    <td valign="top" align="right" width="42%">
                                        ${mutedLabel('Notify on')}
                                        <div style="font-size: 15px; font-weight: 700; color: #111;">${notificationDate}</div>
                                    </td>
                                </tr>
                            </table>

                            <div style="margin-bottom: 18px;">
                                ${mutedLabel('Payment terms')}
                                <div style="font-size: 14px; font-weight: 600; color: #111; line-height: 1.45; white-space: pre-wrap;">${paymentTerms}</div>
                            </div>

                            <div style="margin-bottom: 18px;">
                                ${mutedLabel('Ordered items')}
                                ${itemsBlock}
                            </div>

                            <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e6e6e6; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 14px 16px 8px 16px;">
                                        ${mutedLabel('Payment summary')}
                                        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                                            ${totalsRow('PO total', formatPhp(poTotal))}
                                            ${totalsRow('Paid to date', formatPhp(paid))}
                                            ${totalsRow('Settlement discount', formatPhp(discount))}
                                            ${totalsRow('Remaining balance', formatPhp(remaining), { emphasize: true, topBorder: true })}
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            ${ctaBlock}

                            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px dashed #e2e2e2;">
                                <p style="margin:0;font-size:12px;color:#a3a3a3;text-align:center;line-height:1.45;">
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
