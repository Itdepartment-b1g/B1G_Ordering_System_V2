import { supabase } from './supabase';

export interface KeyAccountPoFulfilledEmailItem {
    brandName?: string | null;
    variantName?: string | null;
    variantType?: string | null;
    quantity: number;
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

export function generateKeyAccountPoFulfilledHTML(data: KeyAccountPoFulfilledEmailParams): string {
    const greetingName = escapeHtml(data.creatorName?.trim() || 'there');
    const poNumber = escapeHtml(data.poNumber);
    const locationLine = data.warehouseLocationName?.trim()
        ? `<p style="margin: 0 0 16px 0; font-size: 14px; color: #444;">Warehouse location: <strong>${escapeHtml(data.warehouseLocationName.trim())}</strong></p>`
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
                        <p style="margin: 0 0 10px 0; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.04em;">Deliver to</p>
                        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 14px; color: #333;">
                            ${deliverRows
                                .map(
                                    (row) => `<tr>
                                <td style="padding: 6px 12px 6px 0; color: #666; vertical-align: top; width: 88px;">${escapeHtml(row.label)}</td>
                                <td style="padding: 6px 0; color: #111; vertical-align: top;"><strong>${escapeHtml(row.value)}</strong></td>
                            </tr>`
                                )
                                .join('')}
                        </table>
                    </div>`
            : '';

    const items = Array.isArray(data.items) ? data.items.filter((it) => Number(it.quantity) > 0) : [];
    const itemsTable =
        items.length > 0
            ? `
                    <div style="margin: 0 0 20px 0;">
                        <p style="margin: 0 0 10px 0; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.04em;">Fulfilled items</p>
                        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; font-size: 14px; color: #333;">
                            <thead>
                                <tr>
                                    <th align="left" style="padding: 8px 8px 8px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #666;">Item</th>
                                    <th align="right" style="padding: 8px 0; border-bottom: 1px solid #e5e5e5; font-weight: 600; color: #666;">Dispatch Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items
                                    .map((it) => {
                                        const brand = escapeHtml(String(it.brandName || '').trim() || '—');
                                        const variant = escapeHtml(String(it.variantName || '').trim() || '—');
                                        const type = it.variantType?.trim()
                                            ? ` · ${escapeHtml(it.variantType.trim())}`
                                            : '';
                                        const qty = Number(it.quantity) || 0;
                                        return `<tr>
                                    <td style="padding: 10px 8px 10px 0; border-bottom: 1px solid #eee; vertical-align: top;">
                                        <div style="font-weight: 500; color: #111;">${brand}</div>
                                        <div style="font-size: 13px; color: #666; margin-top: 2px;">${variant}${type}</div>
                                    </td>
                                    <td align="right" style="padding: 10px 0; border-bottom: 1px solid #eee; vertical-align: top; white-space: nowrap;">${qty.toLocaleString()}</td>
                                </tr>`;
                                    })
                                    .join('')}
                            </tbody>
                        </table>
                    </div>`
            : '';

    const riderPhotoUrl = safeImageUrl(data.riderPhotoUrl);
    const riderName = data.riderName?.trim() ? escapeHtml(data.riderName.trim()) : '';
    const riderPlate = data.riderPlateNumber?.trim() ? escapeHtml(data.riderPlateNumber.trim()) : '';
    const packageUrls = (Array.isArray(data.packagePhotoUrls) ? data.packagePhotoUrls : [])
        .map((u) => safeImageUrl(u))
        .filter((u): u is string => !!u);

    const riderMetaBits = [riderName && `Name: <strong>${riderName}</strong>`, riderPlate && `Plate: <strong>${riderPlate}</strong>`]
        .filter(Boolean)
        .join(' · ');

    const riderSection = riderPhotoUrl
        ? `
                    <div style="margin: 0 0 20px 0;">
                        <p style="margin: 0 0 10px 0; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.04em;">Driver / rider</p>
                        ${riderMetaBits ? `<p style="margin: 0 0 10px 0; font-size: 14px; color: #444;">${riderMetaBits}</p>` : ''}
                        <img src="${riderPhotoUrl}" alt="Rider photo" style="display: block; max-width: 100%; width: 280px; height: auto; border: 1px solid #e5e5e5; border-radius: 6px; background: #fafafa;" />
                    </div>`
        : '';

    const packageSection =
        packageUrls.length > 0
            ? `
                    <div style="margin: 0 0 20px 0;">
                        <p style="margin: 0 0 10px 0; font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.04em;">Package photos</p>
                        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                            <tr>
                                ${packageUrls
                                    .map(
                                        (url, index) => `
                                <td style="padding: 0 ${index < packageUrls.length - 1 ? '8px' : '0'} 0 0; vertical-align: top; width: ${Math.floor(100 / packageUrls.length)}%;">
                                    <img src="${url}" alt="Package proof" style="display: block; width: 100%; max-width: 100%; height: auto; border: 1px solid #e5e5e5; border-radius: 6px; background: #fafafa;" />
                                </td>`
                                    )
                                    .join('')}
                            </tr>
                        </table>
                    </div>`
            : '';

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin: 0; padding: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background: #f5f5f5; padding: 24px 12px;">
        <tr>
            <td align="center">
                <div style="max-width: 560px; background: #fff; border-radius: 8px; padding: 28px 24px; text-align: left;">
                    <p style="margin: 0 0 8px 0; font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.04em;">Key Account PO</p>
                    <h1 style="margin: 0 0 16px 0; font-size: 20px; color: #111;">Warehouse fulfilled your PO</h1>
                    <p style="margin: 0 0 16px 0; font-size: 15px; color: #333;">Hi ${greetingName},</p>
                    <p style="margin: 0 0 16px 0; font-size: 15px; color: #333;">
                        Purchase order ${
                          data.poViewUrl?.trim() && /^https?:\/\//i.test(data.poViewUrl.trim())
                            ? `<a href="${escapeHtml(data.poViewUrl.trim())}" style="color: #111; font-weight: 700; text-decoration: underline;">${poNumber}</a>`
                            : `<strong>${poNumber}</strong>`
                        } has been fulfilled by the warehouse.
                    </p>
                    ${locationLine}
                    ${deliverToSection}
                    ${itemsTable}
                    ${riderSection}
                    ${packageSection}
                    <p style="margin: 0; font-size: 13px; color: #999;">You can review this PO in Key Account Purchase Orders.</p>
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
        .map((it) => ({
            brandName: it.brand_name ?? null,
            variantName: it.variant_name ?? null,
            variantType: it.variant_type ?? null,
            quantity: Number(it.quantity) || 0,
        }))
        .filter((it) => it.quantity > 0);
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
    /** When provided (e.g. dispatch ship lines), used instead of order.items. */
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

    const emailItems =
        Array.isArray(items) && items.length > 0
            ? items.filter((it) => Number(it.quantity) > 0)
            : mapPoItemsForFulfillEmail(order.items, warehouseLocationId);

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
    });
}
