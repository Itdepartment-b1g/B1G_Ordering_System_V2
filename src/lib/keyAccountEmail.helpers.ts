import { supabase } from './supabase';

export interface KeyAccountPoFulfilledEmailItem {
    brandName?: string | null;
    variantName?: string | null;
    variantType?: string | null;
    variantId?: string | null;
    /** Ordered qty on the PO line (this warehouse). */
    orderQty?: number | null;
    /** Qty dispatched in this fulfillment. */
    dispatchQty?: number | null;
    /**
     * Legacy alias for dispatch qty. Prefer `dispatchQty`.
     * When only `quantity` is set, it is treated as both order and dispatch qty.
     */
    quantity?: number | null;
}

export interface KeyAccountPoFulfilledEmailParams {
    to: string;
    poNumber: string;
    creatorName?: string | null;
    warehouseLocationName?: string | null;
    items?: KeyAccountPoFulfilledEmailItem[];
    /** Deliver-to (Key Account client selection on the PO). */
    clientName?: string | null;
    shopName?: string | null;
    addressLabel?: string | null;
    fullAddress?: string | null;
    addressCity?: string | null;
    addressProvince?: string | null;
    addressZip?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
    /** Rider / driver photo (signed URL). */
    riderPhotoUrl?: string | null;
    riderName?: string | null;
    riderPlateNumber?: string | null;
    /** Package proof photo URLs (signed). */
    packagePhotoUrls?: string[] | null;
    /** Absolute URL to open this PO on Key Account Purchase Orders (filtered). */
    poViewUrl?: string | null;
    /** Timeline timestamps (ISO). */
    orderedAt?: string | null;
    approvedAt?: string | null;
    fulfilledAt?: string | null;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function safeImageUrl(url: string | null | undefined): string | null {
    const trimmed = url?.trim() || '';
    if (!trimmed) return null;
    if (!/^https?:\/\//i.test(trimmed)) return null;
    return escapeHtml(trimmed);
}

function sectionHeading(label: string): string {
    return `<table cellpadding="0" cellspacing="0" style="margin: 0 0 10px 0;">
                            <tr>
                                <td style="width: 3px; background: #5B28D6; border-radius: 2px; line-height: 12px; font-size: 0;">&nbsp;</td>
                                <td style="padding-left: 8px; font-size: 12px; font-weight: 700; color: #6b6b6b; text-transform: uppercase; letter-spacing: 0.06em;">${escapeHtml(label)}</td>
                            </tr>
                        </table>`;
}

/** Compact Manila date/time for email timeline steps. */
function formatEmailTimelineAt(iso: string | null | undefined): string {
    const raw = iso?.trim();
    if (!raw) return '';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
}

export function generateKeyAccountPoFulfilledHTML(data: KeyAccountPoFulfilledEmailParams): string {
    const greetingName = escapeHtml(data.creatorName?.trim() || 'there');
    const poNumber = escapeHtml(data.poNumber);
    const warehouseLocationName = data.warehouseLocationName?.trim()
        ? escapeHtml(data.warehouseLocationName.trim())
        : null;
    const poViewUrl =
        data.poViewUrl?.trim() && /^https?:\/\//i.test(data.poViewUrl.trim())
            ? escapeHtml(data.poViewUrl.trim())
            : null;

    const locationBlock = warehouseLocationName
        ? `<div style="margin-bottom: 20px;"><p style="margin: 0 0 4px 0; font-size: 14px; color: #555;">Warehouse location: <strong style="color:#111;">${warehouseLocationName}</strong></p></div>`
        : '';

    const ctaBlock = poViewUrl
        ? `<table cellpadding="0" cellspacing="0" style="margin: 4px 0 28px 0;">
                        <tr>
                            <td style="border-radius: 8px; background: #5B28D6;">
                                <a href="${poViewUrl}" style="display: inline-block; padding: 12px 22px; font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 8px;">View Purchase Order &rarr;</a>
                            </td>
                        </tr>
                    </table>`
        : '';

    const deliverRows: Array<{ label: string; value: string }> = [];
    if (data.clientName?.trim()) deliverRows.push({ label: 'Client', value: data.clientName.trim() });
    if (data.shopName?.trim()) deliverRows.push({ label: 'Shop', value: data.shopName.trim() });
    const addressParts = [
        data.addressLabel?.trim(),
        data.fullAddress?.trim(),
        [data.addressCity?.trim(), data.addressProvince?.trim()].filter(Boolean).join(', '),
        data.addressZip?.trim(),
    ].filter(Boolean);
    if (addressParts.length > 0) {
        deliverRows.push({ label: 'Address', value: addressParts.join(' · ') });
    }
    if (data.contactName?.trim()) deliverRows.push({ label: 'Contact', value: data.contactName.trim() });
    if (data.contactPhone?.trim()) deliverRows.push({ label: 'Phone', value: data.contactPhone.trim() });

    const deliverToSection =
        deliverRows.length > 0
            ? `
                    <div style="margin: 0 0 20px 0;">
                        ${sectionHeading('Deliver to')}
                        <div style="background: #F3EEFD; border-radius: 8px; padding: 14px 16px;">
                        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 14px; color: #333;">
                            ${deliverRows
                                .map(
                                    (row) => `<tr>
                                <td style="padding: 4px 12px 4px 0; color: #6b6b6b; vertical-align: top; width: 84px; white-space: nowrap;">${escapeHtml(row.label)}</td>
                                <td style="padding: 4px 0; color: #111; vertical-align: top; font-weight: 600;">${escapeHtml(row.value)}</td>
                            </tr>`
                                )
                                .join('')}
                        </table>
                    </div>
                    </div>`
            : '';

    const items = Array.isArray(data.items)
        ? data.items.filter((it) => {
              const orderQty = Number(it.orderQty ?? it.quantity) || 0;
              const dispatchQty = Number(it.dispatchQty ?? it.quantity) || 0;
              return orderQty > 0 || dispatchQty > 0;
          })
        : [];
    const itemsTotalOrderQty = items.reduce(
        (sum, it) => sum + (Number(it.orderQty ?? it.quantity) || 0),
        0
    );
    const itemsTotalDispatchQty = items.reduce(
        (sum, it) => sum + (Number(it.dispatchQty ?? it.quantity) || 0),
        0
    );
    const itemsTable =
        items.length > 0
            ? `
                    <div style="margin: 0 0 20px 0;">
                        ${sectionHeading('Fulfilled items')}
                        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 14px; color: #333; border: 1px solid #ececec; border-radius: 8px; overflow: hidden;">
                            <thead>
                                <tr>
                                    <th align="left" style="padding: 10px 12px; background: #fafafa; border-bottom: 1px solid #ececec; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.04em;">Item</th>
                                    <th align="right" style="padding: 10px 8px; background: #fafafa; border-bottom: 1px solid #ececec; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;">Order Qty</th>
                                    <th align="right" style="padding: 10px 12px; background: #fafafa; border-bottom: 1px solid #ececec; font-size: 11px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;">Dispatch Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items
                                    .map((it, index) => {
                                        const brand = escapeHtml(String(it.brandName || '').trim() || '—');
                                        const variant = escapeHtml(String(it.variantName || '').trim() || '—');
                                        const type = it.variantType?.trim()
                                            ? ` · ${escapeHtml(it.variantType.trim())}`
                                            : '';
                                        const orderQty = Number(it.orderQty ?? it.quantity) || 0;
                                        const dispatchQty = Number(it.dispatchQty ?? it.quantity) || 0;
                                        const isLast = index === items.length - 1;
                                        const rowBg = index % 2 === 0 ? '#ffffff' : '#fcfcfd';
                                        const border = isLast ? '' : 'border-bottom: 1px solid #f1f1f1;';
                                        return `<tr style="background: ${rowBg};">
                                    <td style="padding: 12px; ${border} vertical-align: top;">
                                        <div style="font-weight: 600; color: #111;">${brand}</div>
                                        <div style="font-size: 13px; color: #777; margin-top: 2px;">${variant}${type}</div>
                                    </td>
                                    <td align="right" style="padding: 12px 8px; ${border} vertical-align: top; white-space: nowrap; font-weight: 600; color: #555;">${orderQty.toLocaleString()}</td>
                                    <td align="right" style="padding: 12px; ${border} vertical-align: top; white-space: nowrap; font-weight: 700; color: #5B28D6;">${dispatchQty.toLocaleString()}</td>
                                </tr>`;
                                    })
                                    .join('')}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td style="padding: 10px 12px; background:#fafafa; border-top: 1px solid #ececec; font-size: 12px; color: #888;">${items.length} SKU${items.length === 1 ? '' : 's'}</td>
                                    <td align="right" style="padding: 10px 8px; background:#fafafa; border-top: 1px solid #ececec; font-size: 12px; color: #888;"><strong style="color:#111;">${itemsTotalOrderQty.toLocaleString()}</strong></td>
                                    <td align="right" style="padding: 10px 12px; background:#fafafa; border-top: 1px solid #ececec; font-size: 12px; color: #888;"><strong style="color:#5B28D6;">${itemsTotalDispatchQty.toLocaleString()}</strong></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>`
            : '';

    const riderPhotoUrl = safeImageUrl(data.riderPhotoUrl);
    const riderName = data.riderName?.trim() ? escapeHtml(data.riderName.trim()) : '';
    const riderPlate = data.riderPlateNumber?.trim() ? escapeHtml(data.riderPlateNumber.trim()) : '';
    const packageUrls = (Array.isArray(data.packagePhotoUrls) ? data.packagePhotoUrls : [])
        .map((u) => safeImageUrl(u))
        .filter((u): u is string => !!u);

    const hasRiderContent = !!(riderPhotoUrl || riderName || riderPlate);
    const riderAvatar = riderPhotoUrl
        ? `<img src="${riderPhotoUrl}" alt="Rider" width="52" height="52" style="display:block; width:52px; height:52px; border-radius:50%; object-fit:cover; border: 2px solid #fff; box-shadow: 0 0 0 1px #E3E3E8;" />`
        : `<div style="width:52px; height:52px; border-radius:50%; background:#EDE7F9; border: 2px solid #fff; box-shadow: 0 0 0 1px #E3E3E8; line-height:52px; text-align:center; font-size:18px; font-weight:700; color:#5B28D6;">${(riderName || 'R').charAt(0).toUpperCase()}</div>`;

    const riderSection = hasRiderContent
        ? `
                    <div style="margin: 0 0 20px 0;">
                        ${sectionHeading('Driver / rider')}
                        <table cellpadding="0" cellspacing="0" style="background:#fafafa; border:1px solid #ececec; border-radius: 10px; padding: 12px;">
                            <tr>
                                <td style="width: 52px; padding-right: 12px;">
                                    ${riderAvatar}
                                </td>
                                <td style="vertical-align: middle;">
                                    ${riderName ? `<div style="font-size:14px; font-weight:700; color:#111;">${riderName}</div>` : ''}
                                    ${riderPlate ? `<div style="font-size:12px; color:#6b6b6b; margin-top:2px;">Plate <span style="font-family: 'SF Mono', Consolas, monospace; font-weight:700; color:#333;">${riderPlate}</span></div>` : ''}
                                </td>
                            </tr>
                        </table>
                    </div>`
        : '';

    const packageSection =
        packageUrls.length > 0
            ? `
                    <div style="margin: 0 0 20px 0;">
                        ${sectionHeading('Package photos')}
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                            <tr>
                                ${packageUrls
                                    .map(
                                        (url, index) => `
                                <td style="padding: 0 ${index < packageUrls.length - 1 ? '8px' : '0'} 0 0; vertical-align: top; width: ${Math.floor(100 / packageUrls.length)}%;">
                                    <img src="${url}" alt="Package proof" style="display: block; width: 100%; max-width: 100%; height: auto; border: 1px solid #ececec; border-radius: 10px; background: #fafafa;" />
                                    <div style="margin-top: 5px; font-size: 11px; color: #999; text-align:center;">Photo ${index + 1} of ${packageUrls.length}</div>
                                </td>`
                                    )
                                    .join('')}
                            </tr>
                        </table>
                    </div>`
            : '';

    const orderedAtLabel = formatEmailTimelineAt(data.orderedAt);
    const approvedAtLabel = formatEmailTimelineAt(data.approvedAt);
    const fulfilledAtLabel = formatEmailTimelineAt(data.fulfilledAt);
    const stepDateHtml = (label: string) =>
        label
            ? `<div style="margin-top:4px; font-size:10px; line-height:1.3; font-weight:500; color:#999;">${escapeHtml(label)}</div>`
            : '';

    const timelineBlock = `<table cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 28px 0;">
                            <tr>
                                <td align="center" style="width: 96px; vertical-align: top;">
                                    <div style="width:22px;height:22px;border-radius:50%;background:#5B28D6;display:inline-block;line-height:22px;text-align:center;color:#fff;font-size:12px;font-weight:700;">&#10003;</div>
                                    <div style="margin-top:6px; font-size:11px; font-weight:600; color:#6b6b6b;">Order Placed</div>
                                    ${stepDateHtml(orderedAtLabel)}
                                </td>
                                <td style="padding: 0 4px; vertical-align: top; padding-top: 10px;">
                                    <div style="height:2px; background:#5B28D6;"></div>
                                </td>
                                <td align="center" style="width: 88px; vertical-align: top;">
                                    <div style="width:22px;height:22px;border-radius:50%;background:#5B28D6;display:inline-block;line-height:22px;text-align:center;color:#fff;font-size:12px;font-weight:700;">&#10003;</div>
                                    <div style="margin-top:6px; font-size:11px; font-weight:600; color:#6b6b6b;">Approved</div>
                                    ${stepDateHtml(approvedAtLabel)}
                                </td>
                                <td style="padding: 0 4px; vertical-align: top; padding-top: 10px;">
                                    <div style="height:2px; background:#5B28D6;"></div>
                                </td>
                                <td align="center" style="width: 118px; vertical-align: top;">
                                    <div style="width:22px;height:22px;border-radius:50%;background:#5B28D6;display:inline-block;line-height:22px;text-align:center;color:#fff;font-size:12px;font-weight:700;box-shadow: 0 0 0 4px #F3EEFD;">&#10003;</div>
                                    <div style="margin-top:6px; font-size:11px; font-weight:700; color:#5B28D6;">Fulfilled</div>
                                    <div style="margin-top:2px; font-size:10px; font-weight:600; color:#888;">Out for Delivery</div>
                                    ${stepDateHtml(fulfilledAtLabel)}
                                </td>
                            </tr>
                        </table>`;

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background: #f0eefb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <span style="display:none; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden;">PO ${poNumber} has been fulfilled by the warehouse.</span>
    <table width="100%" cellpadding="0" cellspacing="0" style="background: #f0eefb; padding: 32px 12px;">
        <tr>
            <td align="center">
                <div style="max-width: 560px; width: 100%;">
                    <div style="height: 4px; background: linear-gradient(90deg, #5B28D6, #4A1FB0); border-radius: 8px 8px 0 0;"></div>
                    <div style="background: #fff; border-radius: 0 0 12px 12px; padding: 32px 28px; text-align: left; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">

                        <table cellpadding="0" cellspacing="0" style="margin: 0 0 18px 0;">
                            <tr>
                                <td style="border: 1px solid #E3E3E8; border-radius: 6px; padding: 4px 10px; font-family: 'SF Mono', Consolas, monospace; font-size: 12px; font-weight: 700; color: #444; letter-spacing: 0.02em;">${poNumber}</td>
                            </tr>
                        </table>

                        <h1 style="margin: 0 0 6px 0; font-size: 21px; color: #111; font-weight: 700;">Warehouse fulfilled your PO</h1>
                        <p style="margin: 0 0 22px 0; font-size: 15px; color: #555;">
                            Hi ${greetingName}, your purchase order has been fulfilled by the ${warehouseLocationName ? `<strong style="color:#111;">${warehouseLocationName}</strong>` : 'warehouse'}.
                        </p>

                        ${timelineBlock}

                        ${locationBlock}
                        ${ctaBlock}
                        ${deliverToSection}
                        ${itemsTable}
                        ${riderSection}
                        ${packageSection}

                        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #f0f0f0;">
                            <p style="margin: 0; font-size: 12px; color: #a3a3a3;">You can review this PO anytime in Key Account Purchase Orders.</p>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

/**
 * Email the Key Account PO creator after warehouse fulfill.
 * Fail-soft: logs errors and does not throw into fulfill UX.
 */
export async function sendKeyAccountPoFulfilledEmail(data: KeyAccountPoFulfilledEmailParams): Promise<void> {
    try {
        if (!data.to?.trim() || !data.poNumber?.trim()) {
            console.warn('⚠️ Skipping KA fulfill email: missing to or poNumber');
            return;
        }

        const apiUrl = `${window.location.origin}/api/send-email`;
        const html = generateKeyAccountPoFulfilledHTML(data);
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: data.to.trim(),
                subject: `PO ${data.poNumber} fulfilled by warehouse`,
                html,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            console.error('⚠️ Failed to send KA PO fulfilled email:', errorData);
            return;
        }

        const result = await response.json().catch(() => null);
        console.log('✅ KA PO fulfilled email sent:', result);
    } catch (error) {
        console.error('⚠️ Error sending KA PO fulfilled email (non-critical):', error);
    }
}

export type NotifyKeyAccountPoCreatorFulfilledOrder = {
    id: string;
    po_number?: string | null;
    company_account_type?: string | null;
    created_by?: string | null;
    created_at?: string | null;
    order_date?: string | null;
    approved_at?: string | null;
    created_by_user?: { full_name?: string | null; email?: string | null } | null;
    client?: { client_name?: string | null } | { client_name?: string | null }[] | null;
    shop?: { shop_name?: string | null } | { shop_name?: string | null }[] | null;
    address?:
        | {
              address_label?: string | null;
              full_address?: string | null;
              city?: string | null;
              province?: string | null;
              zip_code?: string | null;
              contact_name?: string | null;
              contact_phone?: string | null;
          }
        | {
              address_label?: string | null;
              full_address?: string | null;
              city?: string | null;
              province?: string | null;
              zip_code?: string | null;
              contact_name?: string | null;
              contact_phone?: string | null;
          }[]
        | null;
    items?: Array<{
        variant_id?: string | null;
        brand_name?: string | null;
        variant_name?: string | null;
        variant_type?: string | null;
        quantity?: number | null;
        warehouse_location_id?: string | null;
    }> | null;
};

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

function emailItemMatchKey(it: {
    variantId?: string | null;
    brandName?: string | null;
    variantName?: string | null;
}): string {
    const variantId = it.variantId ? String(it.variantId) : '';
    if (variantId) return `id:${variantId}`;
    return `name:${String(it.brandName || '')
        .trim()
        .toLowerCase()}|${String(it.variantName || '')
        .trim()
        .toLowerCase()}`;
}

function mapPoItemsForFulfillEmail(
    items: NotifyKeyAccountPoCreatorFulfilledOrder['items'],
    warehouseLocationId?: string | null
): KeyAccountPoFulfilledEmailItem[] {
    const rows = Array.isArray(items) ? items : [];
    return rows
        .filter((it) => {
            if (!warehouseLocationId) return true;
            const itemLoc = it.warehouse_location_id ? String(it.warehouse_location_id) : '';
            // Include header-only lines (no location) and lines for this warehouse.
            return !itemLoc || itemLoc === String(warehouseLocationId);
        })
        .map((it) => {
            const qty = Number(it.quantity) || 0;
            return {
                variantId: it.variant_id ?? null,
                brandName: it.brand_name ?? null,
                variantName: it.variant_name ?? null,
                variantType: it.variant_type ?? null,
                orderQty: qty,
                dispatchQty: qty,
                quantity: qty,
            };
        })
        .filter((it) => (Number(it.orderQty) || 0) > 0);
}

/**
 * Merge PO ordered lines with this shipment's dispatch qtys.
 * Prefers dispatched rows; looks up order qty from the PO when possible.
 */
function buildFulfilledEmailItems(params: {
    orderItems: NotifyKeyAccountPoCreatorFulfilledOrder['items'];
    warehouseLocationId?: string | null;
    dispatchItems?: KeyAccountPoFulfilledEmailItem[] | null;
}): KeyAccountPoFulfilledEmailItem[] {
    const ordered = mapPoItemsForFulfillEmail(params.orderItems, params.warehouseLocationId);
    const dispatch = Array.isArray(params.dispatchItems)
        ? params.dispatchItems.filter((it) => {
              const dq = Number(it.dispatchQty ?? it.quantity) || 0;
              return dq > 0;
          })
        : [];

    if (dispatch.length === 0) return ordered;

    const orderByKey = new Map<string, KeyAccountPoFulfilledEmailItem>();
    for (const row of ordered) {
        orderByKey.set(emailItemMatchKey(row), row);
    }

    return dispatch.map((ship) => {
        const key = emailItemMatchKey(ship);
        const fromOrder = orderByKey.get(key);
        const dispatchQty = Number(ship.dispatchQty ?? ship.quantity) || 0;
        const orderQty =
            Number(ship.orderQty) ||
            Number(fromOrder?.orderQty) ||
            Number(fromOrder?.quantity) ||
            dispatchQty;
        return {
            variantId: ship.variantId ?? fromOrder?.variantId ?? null,
            brandName: ship.brandName ?? fromOrder?.brandName ?? null,
            variantName: ship.variantName ?? fromOrder?.variantName ?? null,
            variantType: ship.variantType ?? fromOrder?.variantType ?? null,
            orderQty,
            dispatchQty,
            quantity: dispatchQty,
        };
    });
}

function mapDeliverToFromOrder(order: NotifyKeyAccountPoCreatorFulfilledOrder): Pick<
    KeyAccountPoFulfilledEmailParams,
    | 'clientName'
    | 'shopName'
    | 'addressLabel'
    | 'fullAddress'
    | 'addressCity'
    | 'addressProvince'
    | 'addressZip'
    | 'contactName'
    | 'contactPhone'
> {
    const client = unwrapRelation(order.client);
    const shop = unwrapRelation(order.shop);
    const address = unwrapRelation(order.address);
    return {
        clientName: client?.client_name ?? null,
        shopName: shop?.shop_name ?? null,
        addressLabel: address?.address_label ?? null,
        fullAddress: address?.full_address ?? null,
        addressCity: address?.city ?? null,
        addressProvince: address?.province ?? null,
        addressZip: address?.zip_code ?? null,
        contactName: address?.contact_name ?? null,
        contactPhone: address?.contact_phone ?? null,
    };
}

/**
 * Resolve creator email and notify when a Key Account PO location is fulfilled.
 * Skips non-KA POs, missing email, and when the actor is the creator.
 */
export async function notifyKeyAccountPoCreatorOfFulfillment(params: {
    order: NotifyKeyAccountPoCreatorFulfilledOrder;
    actorUserId?: string | null;
    warehouseLocationName?: string | null;
    warehouseLocationId?: string | null;
    /** When provided (e.g. dispatch ship lines), merged with PO order qty. */
    items?: KeyAccountPoFulfilledEmailItem[] | null;
    riderPhotoUrl?: string | null;
    riderName?: string | null;
    riderPlateNumber?: string | null;
    packagePhotoUrls?: string[] | null;
}): Promise<void> {
    const {
        order,
        actorUserId,
        warehouseLocationName,
        warehouseLocationId,
        items,
        riderPhotoUrl,
        riderName,
        riderPlateNumber,
        packagePhotoUrls,
    } = params;

    if (String(order.company_account_type || '') !== 'Key Accounts') return;

    const createdBy = order.created_by ? String(order.created_by) : null;
    if (!createdBy) return;
    if (actorUserId && createdBy === actorUserId) return;

    let to = order.created_by_user?.email?.trim() || '';
    let creatorName = order.created_by_user?.full_name?.trim() || null;

    if (!to) {
        try {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('email, full_name')
                .eq('id', createdBy)
                .maybeSingle();
            if (error) {
                console.warn('⚠️ Could not load PO creator profile for fulfill email:', error);
                return;
            }
            to = profile?.email?.trim() || '';
            creatorName = profile?.full_name?.trim() || creatorName;
        } catch (err) {
            console.warn('⚠️ Failed to resolve PO creator email:', err);
            return;
        }
    }

    if (!to) {
        console.warn('⚠️ Skipping KA fulfill email: creator has no email');
        return;
    }

    const emailItems = buildFulfilledEmailItems({
        orderItems: order.items,
        warehouseLocationId,
        dispatchItems: items,
    });

    const poNumber = String(order.po_number || order.id);
    const poViewUrl = `${window.location.origin}/key-accounts/purchase-orders?search=${encodeURIComponent(poNumber)}&tab=all`;

    await sendKeyAccountPoFulfilledEmail({
        to,
        poNumber,
        creatorName,
        warehouseLocationName,
        items: emailItems,
        ...mapDeliverToFromOrder(order),
        riderPhotoUrl,
        riderName,
        riderPlateNumber,
        packagePhotoUrls,
        poViewUrl,
        orderedAt: order.created_at || order.order_date || null,
        approvedAt: order.approved_at || null,
        fulfilledAt: new Date().toISOString(),
    });
}
