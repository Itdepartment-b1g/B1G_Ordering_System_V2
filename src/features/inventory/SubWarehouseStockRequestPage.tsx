import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import {
  SubWarehouseStockRequestDialog,
  type SubWarehouseStockRequest,
  type SubWarehouseStockRequestItem,
} from './components/SubWarehouseStockRequestDialog';
import { SubWarehouseStockRequestList } from './components/SubWarehouseStockRequestList';
import {
  SubWarehouseStockReceiveDialog,
  type ReceiveConfirmPayload,
} from './components/SubWarehouseStockReceiveDialog';
import {
  INTERNAL_STOCK_REQUESTS_QUERY_KEY,
  confirmInternalStockRequestReceive,
  createInternalStockRequest,
  fetchInternalStockRequestById,
  fetchInternalStockRequests,
} from './internalStockRequestsApi';
import { exportSubWarehouseReceivePdf } from './utils/exportSubWarehouseReceivePdf';
import { fetchMainWarehouseStockBoard } from './warehouseStockBoard';
import PageGettingStartedDialog from '@/features/inventory/warehouse-manual/components/PageGettingStartedDialog';

export default function SubWarehouseStockRequestPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { membership } = useWarehouseLocationMembership({
    userId: user?.id,
    isWarehouse: user?.role === 'warehouse',
  });

  const [requestOpen, setRequestOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<SubWarehouseStockRequest | null>(null);

  const myLocationId = membership.locationId || '';

  const {
    data: requests = [],
    isLoading: loadingRequests,
    error: requestsError,
  } = useQuery({
    queryKey: [INTERNAL_STOCK_REQUESTS_QUERY_KEY, 'sub', user?.company_id, myLocationId],
    enabled: !!user?.company_id && !!myLocationId,
    staleTime: 15_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: () => fetchInternalStockRequests({ fromLocationId: myLocationId }),
  });

  /** Do not await on mutation success — awaiting blocks dialog close / Confirming… state. */
  const schedulePostMutationRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: [INTERNAL_STOCK_REQUESTS_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: ['inventory'] });
    void queryClient.invalidateQueries({ queryKey: ['variant-batch-lots'] });
    void queryClient.invalidateQueries({
      queryKey: ['main-warehouse-stock-for-sub-request', user?.company_id],
    });
  };

  // Live updates when main approves / rejects / allocates remaining.
  useEffect(() => {
    if (!user?.company_id || !myLocationId) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: [INTERNAL_STOCK_REQUESTS_QUERY_KEY] });
      }, 250);
    };

    const channel = supabase
      .channel(`internal-stock-requests-sub-${myLocationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'internal_stock_requests',
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as { from_location_id?: string } | null;
          if (row?.from_location_id && row.from_location_id !== myLocationId) return;
          scheduleRefresh();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[SubStockRequests] realtime subscription failed:', status);
        }
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase.removeChannel(channel);
    };
  }, [user?.company_id, myLocationId, queryClient]);

  const { data: mainBrands = [], isLoading: loadingMainBrands } = useQuery({
    queryKey: ['main-warehouse-stock-for-sub-request', user?.company_id],
    enabled: !!user?.company_id && requestOpen,
    queryFn: () => fetchMainWarehouseStockBoard(user!.company_id!),
    staleTime: 30_000,
  });

  const { data: mainLocationName } = useQuery({
    queryKey: ['main-warehouse-location-name', user?.company_id],
    enabled: !!user?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('name')
        .eq('company_id', user!.company_id!)
        .eq('is_main', true)
        .maybeSingle();
      if (error) throw error;
      return data?.name || 'Main warehouse';
    },
    staleTime: 5 * 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { notes: string; items: SubWarehouseStockRequestItem[] }) => {
      return createInternalStockRequest({
        fromLocationId: myLocationId || undefined,
        notes: payload.notes,
        items: payload.items.map((item) => ({
          variant_id: item.variantId,
          quantity: item.requestedQuantity,
        })),
      });
    },
    onSuccess: (result) => {
      setRequestOpen(false);
      toast({
        title: 'Request submitted',
        description: `${result.request_number} sent to main warehouse.`,
      });
      void queryClient.invalidateQueries({ queryKey: [INTERNAL_STOCK_REQUESTS_QUERY_KEY] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not submit request',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  const receiveMutation = useMutation({
    mutationFn: async (payload: ReceiveConfirmPayload) => {
      const lines = payload.lines.map((line) => ({
        variant_id: line.variantId,
        quantity: line.quantityThisReceive,
        ...(line.shortfallReason
          ? {
              shortfall_reason: line.shortfallReason,
              ...(line.shortfallNotes ? { shortfall_notes: line.shortfallNotes } : {}),
            }
          : {}),
      }));
      if (!lines.some((line) => line.quantity > 0)) {
        throw new Error('Enter at least one receive quantity greater than 0.');
      }
      const result = await confirmInternalStockRequestReceive({
        requestId: payload.requestId,
        lines,
        proofImageUrl: payload.proofImageDataUrl,
        signatureUrl: payload.signatureDataUrl,
        notes: payload.notes || undefined,
        proofImageName: payload.proofImageName,
      });
      return { result, payload };
    },
    onSuccess: ({ result, payload }) => {
      setReceiveOpen(false);
      setReceiveTarget(null);
      toast({
        title: result.status === 'fully_received' ? 'Fully received' : 'Partially received',
        description:
          result.status === 'fully_received'
            ? 'All delivered units confirmed. Opening PDF for print/save.'
            : `Receive confirmed. Short remaining: ${result.short_quantity ?? 0}.`,
      });
      schedulePostMutationRefresh();

      const receiverName = user?.full_name || user?.email || 'Sub-warehouse user';
      void (async () => {
        try {
          const updated = await fetchInternalStockRequestById(payload.requestId);
          if (!updated) return;
          const proof = {
            at: new Date().toISOString(),
            notes: payload.notes || undefined,
            proofImageDataUrl: payload.proofImageDataUrl,
            proofImageName: payload.proofImageName,
            signatureDataUrl: payload.signatureDataUrl,
            lines: payload.lines
              .filter((line) => line.quantityThisReceive > 0)
              .map((line) => {
                const item = updated.items.find((i) => i.variantId === line.variantId);
                return {
                  variantId: line.variantId,
                  variantName: item?.variantName || line.variantId,
                  brandName: item?.brandName,
                  quantity: line.quantityThisReceive,
                };
              }),
          };
          await exportSubWarehouseReceivePdf({
            request: updated,
            proof,
            receivedByName: receiverName,
            shortQuantity: result.short_quantity ?? 0,
            statusLabel:
              result.status === 'fully_received' ? 'Fully received' : 'Partially received',
          });
        } catch {
          toast({
            title: 'PDF export failed',
            description: 'Receive was saved, but the PDF window could not be opened.',
            variant: 'destructive',
          });
        }
      })();
    },
    onError: (error: Error) => {
      toast({
        title: 'Could not confirm receive',
        description: error.message || 'Something went wrong.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Request Stock</h1>
          <p className="text-muted-foreground">
            Request inventory from the main warehouse. Confirm receive when main has shipped.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PageGettingStartedDialog />
          <Button onClick={() => setRequestOpen(true)} disabled={!myLocationId}>
            <Plus className="mr-2 h-4 w-4" />
            New stock request
          </Button>
        </div>
      </div>

      {requestsError ? (
        <p className="text-sm text-destructive">
          {(requestsError as Error).message || 'Failed to load stock requests.'}
        </p>
      ) : null}

      {loadingRequests ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading requests…
        </div>
      ) : (
        <SubWarehouseStockRequestList requests={requests} onReceive={(request) => {
          setReceiveTarget(request);
          setReceiveOpen(true);
        }} />
      )}

      <SubWarehouseStockRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        brands={mainBrands}
        loadingBrands={loadingMainBrands}
        sourceLocationName={mainLocationName || 'Main warehouse'}
        submitting={createMutation.isPending}
        onSubmit={async (payload) => {
          await createMutation.mutateAsync(payload);
        }}
      />

      <SubWarehouseStockReceiveDialog
        open={receiveOpen}
        onOpenChange={(open) => {
          setReceiveOpen(open);
          if (!open) setReceiveTarget(null);
        }}
        request={receiveTarget}
        submitting={receiveMutation.isPending}
        onConfirm={async (payload) => {
          await receiveMutation.mutateAsync(payload);
        }}
      />
    </div>
  );
}
