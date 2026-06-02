import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Warehouse } from 'lucide-react';
import { keyAccountDispatchWorkflowActive } from '@/features/key-accounts/keyAccountDispatchWorkflow';

type LocationRow = {
  location_id: string;
  location_name: string;
  status: string;
  dr_number: string | null;
  dispatched_at: string | null;
};

function locationStatusBadgeClass(status: string) {
  switch (status) {
    case 'fulfilled':
      return 'bg-green-600 text-white';
    case 'pending':
      return 'bg-amber-500 text-white';
    default:
      return 'bg-gray-600 text-white';
  }
}

interface KeyAccountPoWarehouseProgressProps {
  purchaseOrderId: string;
  workflowStatus?: string | null;
  fulfillmentType?: string | null;
}

export function KeyAccountPoWarehouseProgress({
  purchaseOrderId,
  workflowStatus,
  fulfillmentType,
}: KeyAccountPoWarehouseProgressProps) {
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (fulfillmentType !== 'warehouse_transfer') {
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [{ data: locRows, error: locErr }, { data: deliveryRows, error: delErr }] =
          await Promise.all([
            supabase
              .from('warehouse_transfer_location_status')
              .select(
                `
                warehouse_location_id,
                status,
                warehouse_locations:warehouse_location_id ( name )
              `
              )
              .eq('purchase_order_id', purchaseOrderId)
              .order('created_at', { ascending: true }),
            keyAccountDispatchWorkflowActive(workflowStatus)
              ? supabase
                  .from('purchase_order_deliveries')
                  .select('warehouse_location_id, dr_number, dispatched_at')
                  .eq('purchase_order_id', purchaseOrderId)
              : Promise.resolve({ data: [], error: null }),
          ]);

        if (locErr) throw locErr;
        if (delErr) throw delErr;
        if (cancelled) return;

        const deliveryByLoc = new Map<string, { dr_number: string | null; dispatched_at: string | null }>();
        for (const d of deliveryRows || []) {
          const locId = String((d as { warehouse_location_id?: string }).warehouse_location_id || '');
          if (!locId) continue;
          deliveryByLoc.set(locId, {
            dr_number: (d as { dr_number?: string | null }).dr_number ?? null,
            dispatched_at: (d as { dispatched_at?: string | null }).dispatched_at ?? null,
          });
        }

        const mapped: LocationRow[] = ((locRows as any[]) || []).map((r) => {
          const locId = String(r.warehouse_location_id);
          const loc = Array.isArray(r.warehouse_locations)
            ? r.warehouse_locations[0]
            : r.warehouse_locations;
          const delivery = deliveryByLoc.get(locId);
          return {
            location_id: locId,
            location_name: loc?.name || 'Warehouse',
            status: String(r.status || 'pending'),
            dr_number: delivery?.dr_number ?? null,
            dispatched_at: delivery?.dispatched_at ?? null,
          };
        });

        setRows(mapped);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [purchaseOrderId, workflowStatus, fulfillmentType]);

  if (fulfillmentType !== 'warehouse_transfer' || (!loading && rows.length <= 1)) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Warehouse className="h-4 w-4" />
          Fulfillment by warehouse
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading warehouse progress…
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.location_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{row.location_name}</p>
                {row.dr_number ? (
                  <p className="text-xs text-muted-foreground font-mono">DR: {row.dr_number}</p>
                ) : row.status === 'fulfilled' ? (
                  <p className="text-xs text-muted-foreground">Dispatched — DR pending sync</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Awaiting fulfillment / dispatch</p>
                )}
                {row.dispatched_at ? (
                  <p className="text-xs text-muted-foreground">
                    Dispatched {new Date(row.dispatched_at).toLocaleString()}
                  </p>
                ) : null}
              </div>
              <Badge className={locationStatusBadgeClass(row.status)}>
                {row.status === 'fulfilled' ? 'Done' : row.status.replace(/_/g, ' ')}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
