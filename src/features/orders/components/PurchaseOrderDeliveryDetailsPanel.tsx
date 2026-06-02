import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { keyAccountDispatchWorkflowActive } from '@/features/key-accounts/keyAccountDispatchWorkflow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronsUpDown, Loader2, Truck } from 'lucide-react';

function resolveWarehouseLocationName(
  loc: { name: string } | { name: string }[] | null | undefined
): string | null {
  if (!loc) return null;
  const row = Array.isArray(loc) ? loc[0] : loc;
  return row?.name?.trim() || null;
}

export type PurchaseOrderDeliveryRow = {
  id: string;
  warehouse_location_id?: string | null;
  warehouse_locations?: { name: string } | { name: string }[] | null;
  created_by_profile:
    | {
        full_name: string | null;
        email: string | null;
      }
    | Array<{
        full_name: string | null;
        email: string | null;
      }>
    | null;
  rider_name: string | null;
  rider_plate_number: string | null;
  rider_photo_url: string | null;
  warehouse_signature_url: string | null;
  status: string | null;
  dr_number?: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
};

export function keyAccountDeliveryDetailsEnabled(order: {
  workflow_status?: string | null;
  status?: string | null;
  key_account_client_id?: string | null;
}): boolean {
  if (!order.key_account_client_id) return false;
  if (!keyAccountDispatchWorkflowActive(order.workflow_status)) return false;
  const status = String(order.status || '');
  return status === 'fulfilled' || status === 'partially_fulfilled';
}

interface PurchaseOrderDeliveryDetailsPanelProps {
  purchaseOrderId: string;
  /** When false, renders nothing (e.g. PO not yet physically dispatched). */
  enabled: boolean;
  /** Fallback when location join is null (e.g. get_linked_warehouse_locations). */
  warehouseNamesById?: Record<string, string>;
}

export function PurchaseOrderDeliveryDetailsPanel({
  purchaseOrderId,
  enabled,
  warehouseNamesById = {},
}: PurchaseOrderDeliveryDetailsPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PurchaseOrderDeliveryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (loaded || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from('purchase_order_deliveries')
        .select(
          'id,warehouse_location_id,warehouse_locations:warehouse_location_id(name),created_by_profile:profiles!purchase_order_deliveries_created_by_fkey(full_name,email),rider_name,rider_plate_number,rider_photo_url,warehouse_signature_url,status,dr_number,dispatched_at,delivered_at'
        )
        .eq('purchase_order_id', purchaseOrderId)
        .order('dispatched_at', { ascending: false });
      if (qErr) throw qErr;
      setRows((data as PurchaseOrderDeliveryRow[]) || []);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load delivery details');
    } finally {
      setLoading(false);
    }
  }, [purchaseOrderId, loaded, loading]);

  if (!enabled) return null;

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4" />
          Dispatch & delivery
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Collapsible
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (next) void load();
          }}
        >
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between gap-2">
              <span>View dispatch record</span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3 data-[state=closed]:animate-none">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!loading && loaded && rows.length === 0 && (
              <p className="text-sm text-muted-foreground">No dispatch record found for this PO.</p>
            )}
            {rows.map((row) => {
              const profile = Array.isArray(row.created_by_profile)
                ? row.created_by_profile[0]
                : row.created_by_profile;
              const actorName = profile?.full_name || profile?.email || '—';
              const fulfillingWarehouse =
                resolveWarehouseLocationName(row.warehouse_locations) ||
                (row.warehouse_location_id
                  ? warehouseNamesById[row.warehouse_location_id]
                  : null) ||
                '—';

              return (
                  <div key={row.id} className="rounded-md border bg-muted/20 p-3 space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      {/* Left column */}
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Fulfilled / signed by</Label>
                          <p className="font-medium">{actorName}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Rider</Label>
                          <p className="font-medium">{row.rider_name || '—'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <p className="font-medium capitalize">{row.status || '—'}</p>
                        </div>
                        {row.dr_number ? (
                          <div>
                            <Label className="text-xs text-muted-foreground">DR number</Label>
                            <p className="font-medium font-mono">{row.dr_number}</p>
                          </div>
                        ) : null}

                      </div>
                      {/* Right column */}
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Warehouse</Label>
                          <p className="font-medium">{fulfillingWarehouse}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Plate</Label>
                          <p className="font-medium">{row.rider_plate_number || '—'}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Dispatched</Label>
                          <p className="font-medium">
                            {row.dispatched_at ? new Date(row.dispatched_at).toLocaleString() : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                    {row.rider_photo_url ? (
                      <div>
                        <Label className="text-xs text-muted-foreground">Rider photo</Label>
                        <div className="mt-1 rounded border overflow-hidden max-w-xs bg-background">
                          <img
                            src={row.rider_photo_url}
                            alt="Rider"
                            className="max-h-40 w-full object-contain"
                          />
                        </div>
                      </div>
                    ) : null}
                    {row.warehouse_signature_url ? (
                      <div>
                        <Label className="text-xs text-muted-foreground">Warehouse signature</Label>
                        <div className="mt-1 rounded border overflow-hidden max-w-xs bg-background">
                          <img
                            src={row.warehouse_signature_url}
                            alt="Warehouse signature"
                            className="max-h-32 w-full object-contain"
                          />
                        </div>
                      </div>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      Proof images use signed URLs; if they fail to load later, links may have expired and need
                      refresh from storage.
                    </p>
                  </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
