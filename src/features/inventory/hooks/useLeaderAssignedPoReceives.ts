import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PoReceiveLine } from '@/features/orders/components/PoBuyerReceiveDialog';
import type { PurchaseOrderHistoryItem } from '@/features/orders/purchaseOrderHistoryTypes';
import type {
  TlPendingReceive,
  TlReceiveListItem,
  TlPoReceiveStatus,
} from '../types/tlPoReceiveTypes';

type PoRow = {
  id: string;
  po_number: string;
  order_date: string;
  expected_delivery_date: string | null;
  total_amount: number | string | null;
  status: string;
  workflow_status: string | null;
  company_id: string;
  warehouse_company_id: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  subtotal: number | string | null;
  tax_rate: number | string | null;
  tax_amount: number | string | null;
  discount: number | string | null;
  purchase_order_items?: Array<{
    variant_id: string;
    quantity: number;
    unit_price?: number;
    variants?: unknown;
  }>;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function deriveStatus(args: {
  hasPendingReceive: boolean;
  shortOpen: number;
  dispatched: number;
  received: number;
}): TlPoReceiveStatus {
  if (args.hasPendingReceive) return 'pending_receive';
  if (args.shortOpen > 0) return 'shortfall_investigation';
  if (args.dispatched > 0 && args.received >= args.dispatched) return 'fully_received';
  if (args.received > 0) return 'fully_received';
  return 'pending_receive';
}

export function useLeaderAssignedPoReceives(
  userId: string | undefined,
  companyId: string | undefined,
  enabled = true
) {
  const [orders, setOrders] = useState<TlReceiveListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled || !userId || !companyId) {
      setOrders([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: poData, error: poErr } = await supabase
          .from('purchase_orders')
          .select(
            `
            id, po_number, order_date, expected_delivery_date, total_amount, status, workflow_status,
            company_id, warehouse_company_id, notes, created_by, created_at, subtotal, tax_rate, tax_amount, discount,
            purchase_order_items (
              variant_id,
              quantity,
              unit_price,
              variants:variant_id (
                name,
                brands:brand_id ( name )
              )
            )
          `
          )
          .eq('assigned_team_leader_id', userId)
          .eq('fulfillment_type', 'warehouse_transfer')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });

        if (poErr) throw poErr;
        if (cancelled) return;

        const pos = (poData || []) as PoRow[];
        if (pos.length === 0) {
          setOrders([]);
          return;
        }

        const poIds = pos.map((p) => p.id);

        const [{ data: deliveries, error: delErr }, { data: discs, error: discErr }] =
          await Promise.all([
            supabase
              .from('purchase_order_deliveries')
              .select(
                'id,purchase_order_id,company_id,dr_number,dispatched_at,status,warehouse_location_id,warehouse_locations:warehouse_location_id(name)'
              )
              .in('purchase_order_id', poIds)
              .neq('status', 'cancelled')
              .order('dispatched_at', { ascending: true }),
            supabase
              .from('purchase_order_delivery_discrepancies')
              .select('purchase_order_id,quantity,status')
              .in('purchase_order_id', poIds)
              .in('status', ['open', 'resolved_redeliver']),
          ]);

        if (delErr) throw delErr;
        if (discErr) {
          console.warn('[TL PO Receive] open shortfall load failed', discErr);
        }
        if (cancelled) return;

        const deliveryRows = (deliveries || []) as Array<{
          id: string;
          purchase_order_id: string;
          company_id: string;
          dr_number: string | null;
          dispatched_at: string | null;
          status: string;
          warehouse_location_id: string | null;
          warehouse_locations?: unknown;
        }>;

        const deliveryIds = deliveryRows.map((d) => d.id);
        const poIdByDelivery: Record<string, string> = {};
        for (const row of deliveryRows) {
          poIdByDelivery[row.id] = String(row.purchase_order_id);
        }

        const progressByPo: Record<
          string,
          { dispatched: number; received: number; shortOpen: number }
        > = {};
        const qtyByPoVariant: Record<string, Record<string, { dispatched: number; received: number }>> =
          {};
        for (const id of poIds) {
          progressByPo[id] = { dispatched: 0, received: 0, shortOpen: 0 };
          qtyByPoVariant[id] = {};
        }

        const linesByDelivery: Record<string, PoReceiveLine[]> = {};

        if (deliveryIds.length > 0) {
          const { data: itemData, error: itemErr } = await supabase
            .from('purchase_order_delivery_items')
            .select(
              'delivery_id,variant_id,quantity_dispatched,quantity_received,variants:variant_id(name,brands:brand_id(name))'
            )
            .in('delivery_id', deliveryIds);
          if (itemErr) throw itemErr;
          if (cancelled) return;

          for (const item of (itemData || []) as Array<{
            delivery_id: string;
            variant_id: string;
            quantity_dispatched?: number;
            quantity_received?: number;
            variants?: unknown;
          }>) {
            const poId = poIdByDelivery[item.delivery_id];
            if (!poId || !progressByPo[poId]) continue;

            const dispatched = Number(item.quantity_dispatched) || 0;
            const received = Number(item.quantity_received) || 0;
            progressByPo[poId].dispatched += dispatched;
            progressByPo[poId].received += received;

            const variantId = String(item.variant_id);
            const bucket = qtyByPoVariant[poId][variantId] || { dispatched: 0, received: 0 };
            bucket.dispatched += dispatched;
            bucket.received += received;
            qtyByPoVariant[poId][variantId] = bucket;

            if (received > 0 || dispatched <= 0) continue;
            const variant = unwrapOne(item.variants as { name?: string; brands?: unknown } | null);
            const brand = unwrapOne(
              (variant?.brands as { name?: string } | { name?: string }[] | null) ?? null
            );
            (linesByDelivery[item.delivery_id] ||= []).push({
              variant_id: variantId,
              quantity_dispatched: dispatched,
              brand_name: brand?.name ?? null,
              variant_name: variant?.name ?? null,
            });
          }
        }

        for (const row of discs || []) {
          const poId = String((row as { purchase_order_id: string }).purchase_order_id);
          if (!progressByPo[poId]) continue;
          const qty = Number((row as { quantity: number }).quantity) || 0;
          const status = String((row as { status?: string }).status || '');
          if (status === 'open') progressByPo[poId].shortOpen += qty;
        }

        const pendingByPo: Record<string, TlPendingReceive> = {};
        for (const row of deliveryRows) {
          if (String(row.status) !== 'dispatched') continue;
          const poId = String(row.purchase_order_id);
          if (pendingByPo[poId]) continue;
          const lines = linesByDelivery[row.id] || [];
          if (lines.length === 0) continue;
          const loc = unwrapOne(
            row.warehouse_locations as { name?: string } | { name?: string }[] | null
          );
          pendingByPo[poId] = {
            deliveryId: String(row.id),
            drNumber: row.dr_number ? String(row.dr_number) : null,
            companyId: String(row.company_id),
            warehouseLocationId: row.warehouse_location_id
              ? String(row.warehouse_location_id)
              : null,
            warehouseLocationName: loc?.name ? String(loc.name) : null,
            lines,
          };
        }

        const latestMetaByPo: Record<
          string,
          {
            drNumber: string | null;
            warehouseLocationId: string | null;
            warehouseLocationName: string | null;
          }
        > = {};
        for (let i = deliveryRows.length - 1; i >= 0; i -= 1) {
          const row = deliveryRows[i];
          const poId = String(row.purchase_order_id);
          if (latestMetaByPo[poId]) continue;
          const loc = unwrapOne(
            row.warehouse_locations as { name?: string } | { name?: string }[] | null
          );
          latestMetaByPo[poId] = {
            drNumber: row.dr_number ? String(row.dr_number) : null,
            warehouseLocationId: row.warehouse_location_id
              ? String(row.warehouse_location_id)
              : null,
            warehouseLocationName: loc?.name ? String(loc.name) : null,
          };
        }

        const creatorIds = Array.from(
          new Set(pos.map((p) => p.created_by).filter(Boolean))
        );
        const nameByCreatorId: Record<string, string> = {};
        const companyNameById: Record<string, string> = {};
        const locNameById: Record<string, string> = {};
        let linkedHubCompanyName: string | null = null;

        const [profilesRes, linkedLocsRes, linkedCompanyRes, ownCompanyRes] = await Promise.all([
          creatorIds.length > 0
            ? supabase.from('profiles').select('id, full_name, company_id').in('id', creatorIds)
            : Promise.resolve({ data: null, error: null }),
          // SECURITY DEFINER — works for team_leader (nested warehouse_locations join does not)
          supabase.rpc('get_linked_warehouse_locations'),
          supabase.rpc('get_linked_warehouse_company'),
          companyId
            ? supabase.from('companies').select('id, company_name').eq('id', companyId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (profilesRes.error) {
          console.warn('[TL PO Receive] allocated-by profiles load failed', profilesRes.error);
        } else {
          for (const row of profilesRes.data || []) {
            const id = String((row as { id: string }).id);
            const name = String((row as { full_name?: string | null }).full_name || '').trim();
            if (id) nameByCreatorId[id] = name || 'Unknown';
          }
        }

        if (linkedLocsRes.error) {
          console.warn('[TL PO Receive] linked warehouse locations load failed', linkedLocsRes.error);
        } else {
          for (const row of (linkedLocsRes.data || []) as Array<{ id?: string; name?: string }>) {
            const id = row.id ? String(row.id) : '';
            const name = String(row.name || '').trim();
            if (id && name) locNameById[id] = name;
          }
        }

        if (linkedCompanyRes.error) {
          // RPC may not be deployed yet — fall back below.
          console.warn('[TL PO Receive] linked warehouse company load failed', linkedCompanyRes.error);
        } else {
          const hub = Array.isArray(linkedCompanyRes.data)
            ? linkedCompanyRes.data[0]
            : linkedCompanyRes.data;
          const hubName = String(
            (hub as { company_name?: string | null } | null)?.company_name || ''
          ).trim();
          if (hubName) linkedHubCompanyName = hubName;
          const hubId = (hub as { id?: string } | null)?.id;
          if (hubId && hubName) companyNameById[String(hubId)] = hubName;
        }

        if (ownCompanyRes.error) {
          console.warn('[TL PO Receive] own company load failed', ownCompanyRes.error);
        } else if (ownCompanyRes.data) {
          const id = String((ownCompanyRes.data as { id: string }).id);
          const name = String(
            (ownCompanyRes.data as { company_name?: string | null }).company_name || ''
          ).trim();
          if (id && name) companyNameById[id] = name;
        }

        // Fill any missing warehouse company names after RLS/RPC is available
        const warehouseCompanyIds = Array.from(
          new Set(pos.map((p) => p.warehouse_company_id).filter(Boolean) as string[])
        ).filter((id) => !companyNameById[id]);
        if (warehouseCompanyIds.length > 0) {
          const { data: warehouseCompanies, error: whCoErr } = await supabase
            .from('companies')
            .select('id, company_name')
            .in('id', warehouseCompanyIds);
          if (whCoErr) {
            console.warn('[TL PO Receive] warehouse company load failed', whCoErr);
          } else {
            for (const row of warehouseCompanies || []) {
              const id = String((row as { id: string }).id);
              const name = String(
                (row as { company_name?: string | null }).company_name || ''
              ).trim();
              if (id && name) companyNameById[id] = name;
            }
          }
        }

        const resolveLocationName = (
          locationId: string | null | undefined,
          embeddedName: string | null | undefined
        ) => {
          if (embeddedName) return embeddedName;
          if (locationId && locNameById[locationId]) return locNameById[locationId];
          return null;
        };

        const mapped: TlReceiveListItem[] = pos.map((po) => {
          const itemsMap = new Map<string, PurchaseOrderHistoryItem>();
          for (const row of po.purchase_order_items || []) {
            const variant = unwrapOne(
              row.variants as
                | { name?: string; brands?: { name?: string } | { name?: string }[] }
                | Array<{ name?: string; brands?: { name?: string } | { name?: string }[] }>
                | null
            );
            const brand = unwrapOne(variant?.brands ?? null);
            const variantId = String(row.variant_id);
            const existing = itemsMap.get(variantId);
            itemsMap.set(variantId, {
              variantId,
              brandName: brand?.name || undefined,
              variantName: variant?.name || 'Item',
              orderedQuantity: (existing?.orderedQuantity || 0) + (Number(row.quantity) || 0),
              dispatchedQuantity: 0,
              receivedQuantity: 0,
            });
          }

          for (const [variantId, qty] of Object.entries(qtyByPoVariant[po.id] || {})) {
            const existing = itemsMap.get(variantId);
            if (existing) {
              existing.dispatchedQuantity = qty.dispatched;
              existing.receivedQuantity = qty.received;
            } else {
              itemsMap.set(variantId, {
                variantId,
                variantName: 'Item',
                orderedQuantity: 0,
                dispatchedQuantity: qty.dispatched,
                receivedQuantity: qty.received,
              });
            }
          }

          const items = Array.from(itemsMap.values());
          const pending = pendingByPo[po.id];
          const progress = progressByPo[po.id] || {
            dispatched: 0,
            received: 0,
            shortOpen: 0,
          };
          const status = deriveStatus({
            hasPendingReceive: !!pending,
            shortOpen: progress.shortOpen,
            dispatched: progress.dispatched,
            received: progress.received,
          });
          const meta = pending
            ? {
                drNumber: pending.drNumber,
                warehouseLocationId: pending.warehouseLocationId,
                warehouseLocationName: pending.warehouseLocationName,
              }
            : latestMetaByPo[po.id] || {
                drNumber: null,
                warehouseLocationId: null,
                warehouseLocationName: null,
              };

          const warehouseLocationName = resolveLocationName(
            meta.warehouseLocationId,
            meta.warehouseLocationName
          );
          const warehouseCompanyName =
            (po.warehouse_company_id && companyNameById[po.warehouse_company_id]) ||
            linkedHubCompanyName ||
            null;

          return {
            id: po.id,
            po_number: po.po_number,
            order_date: po.order_date || po.created_at,
            expected_delivery_date: po.expected_delivery_date || '',
            item_count: items.length,
            total_amount: Number(po.total_amount) || 0,
            status,
            companyId: po.company_id,
            drNumber: meta.drNumber,
            warehouseCompanyName,
            warehouseLocationName,
            allocatedByCompanyName: po.company_id
              ? companyNameById[po.company_id] || null
              : null,
            allocatedByName: po.created_by
              ? nameByCreatorId[po.created_by] || 'Unknown'
              : null,
            items,
            history: [],
            receiveNotes: po.notes,
            pendingReceive: pending,
            poSnapshot: {
              status: po.status,
              notes: po.notes || '',
              created_by: po.created_by,
              created_at: po.created_at,
              subtotal: Number(po.subtotal) || 0,
              tax_rate: Number(po.tax_rate) || 0,
              tax_amount: Number(po.tax_amount) || 0,
              discount: Number(po.discount) || 0,
            },
          };
        });

        if (!cancelled) setOrders(mapped);
      } catch (e: unknown) {
        console.error('[TL PO Receive] load failed', e);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load assigned purchase orders');
          setOrders([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, companyId, enabled, refreshKey]);

  return { orders, loading, error, refresh };
}
