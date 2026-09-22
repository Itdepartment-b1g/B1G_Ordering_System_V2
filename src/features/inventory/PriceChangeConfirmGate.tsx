import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LayoutGrid, Loader2, Table2, X } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { useAgentInventory } from '@/features/inventory/hooks';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  confirmCompanyPriceChange,
  fetchMyPendingPriceAgreements,
} from '@/features/inventory/companyPriceChangeApi';
import { PriceChangeItemsFlatTable } from '@/features/inventory/PriceChangeItemsFlatTable';
import type { PriceItemsViewMode } from '@/features/inventory/PriceChangeItemsGroupedTable';

function usePreferredPriceItemsView(): [
  PriceItemsViewMode,
  (mode: PriceItemsViewMode) => void,
] {
  const [viewMode, setViewMode] = useState<PriceItemsViewMode>(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches
      ? 'table'
      : 'cards'
  );
  const userOverrideRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)');
    const sync = () => {
      if (userOverrideRef.current) return;
      setViewMode(mq.matches ? 'table' : 'cards');
    };
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const setMode = (mode: PriceItemsViewMode) => {
    userOverrideRef.current = true;
    setViewMode(mode);
  };

  return [viewMode, setMode];
}

function countBrandsAndVariants(items: { brand_id: string | null; brand_name: string }[]) {
  const brandKeys = new Set(
    items.map((i) => i.brand_id || i.brand_name?.trim() || 'unknown')
  );
  return { brandCount: brandKeys.size, variantCount: items.length };
}

/**
 * Pending price agreements for TL / MS.
 * Dialog can be dismissed to keep selling; a floating card stays until they confirm.
 * Bag prices update only after confirm.
 */
export function PriceChangeConfirmGate() {
  const { user } = useAuth();
  const { hasWarehouseHubLink, hasWarehouseHubLinkLoading } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [acked, setAcked] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [viewMode, setViewMode] = usePreferredPriceItemsView();
  const { refreshInventory } = useAgentInventory();
  const lastPromptedBatchIdRef = useRef<string | null>(null);

  const eligible =
    !!user?.id &&
    !!user?.company_id &&
    hasWarehouseHubLink === true &&
    (user.role === 'team_leader' || user.role === 'mobile_sales');

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['price-agreements', user?.company_id, user?.id],
    queryFn: () => fetchMyPendingPriceAgreements(user!.company_id!, user!.id),
    enabled: eligible && !hasWarehouseHubLinkLoading,
    refetchInterval: eligible ? 5_000 : false,
    refetchOnWindowFocus: true,
  });

  const current = batches[0] ?? null;
  const hasPending = eligible && !isLoading && !!current;

  // Live updates when Super Admin creates/appends price rows or resets agreements
  useEffect(() => {
    if (!eligible || !user?.company_id || !user?.id) return;

    const companyId = user.company_id;
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ['price-agreements', companyId, user.id] });
    };

    const channel = supabase
      .channel(`cpc-confirm-gate-${companyId}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_price_change_items',
          filter: `company_id=eq.${companyId}`,
        },
        refresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_price_change_agreements',
          filter: `company_id=eq.${companyId}`,
        },
        refresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_price_change_batches',
          filter: `company_id=eq.${companyId}`,
        },
        refresh
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [eligible, user?.company_id, user?.id, qc]);

  // First time a pending batch appears (or new batch id): open dialog once
  useEffect(() => {
    if (!current?.id) {
      lastPromptedBatchIdRef.current = null;
      setDialogOpen(false);
      setDismissed(false);
      setAcked(false);
      return;
    }
    if (lastPromptedBatchIdRef.current !== current.id) {
      lastPromptedBatchIdRef.current = current.id;
      setDialogOpen(true);
      setDismissed(false);
      setAcked(false);
    }
  }, [current?.id]);

  // If SA adds/changes prices while dialog is open, force re-ack
  const itemsFingerprint = useMemo(() => {
    if (!current) return '';
    return `${current.id}:${(current.items ?? [])
      .map(
        (i) =>
          `${i.id}:${i.updated_at ?? i.created_at}:${i.new_selling_price}:${i.new_dsp_price}:${i.new_rsp_price}`
      )
      .join('|')}`;
  }, [current]);

  const prevFingerprintRef = useRef<string>('');
  useEffect(() => {
    if (!itemsFingerprint) {
      prevFingerprintRef.current = '';
      return;
    }
    if (prevFingerprintRef.current && prevFingerprintRef.current !== itemsFingerprint) {
      setAcked(false);
    }
    prevFingerprintRef.current = itemsFingerprint;
  }, [itemsFingerprint]);

  const confirmMutation = useMutation({
    mutationFn: (batchId: string) => confirmCompanyPriceChange(batchId),
    onSuccess: (result) => {
      const apply = result.apply_result;
      const stillWaiting =
        apply?.applied === false || (typeof apply?.pending === 'number' && apply.pending > 0);
      toast({
        title: stillWaiting ? 'Confirmed — your bag updated' : 'Confirmed — all bags updated',
        description: stillWaiting
          ? 'Your inventory now uses the new prices. Waiting for remaining Team Leaders and Mobile Sales.'
          : 'Everyone confirmed. Agent bags use the new prices.',
      });
      setAcked(false);
      setDialogOpen(false);
      setDismissed(false);
      prevFingerprintRef.current = '';
      lastPromptedBatchIdRef.current = null;
      qc.invalidateQueries({ queryKey: ['price-agreements'] });
      qc.invalidateQueries({ queryKey: ['price-history'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      void refreshInventory();
    },
    onError: (err: Error) => {
      toast({ title: 'Confirm failed', description: err.message, variant: 'destructive' });
    },
  });

  const dismissForLater = () => {
    setDialogOpen(false);
    setDismissed(true);
    setAcked(false);
  };

  const openFromFloat = () => {
    setDialogOpen(true);
    setDismissed(false);
  };

  if (!hasPending || !current) return null;

  const remaining = batches.length;
  const myAgreement = (current.agreements ?? []).find((a) => a.profile_id === user?.id);
  const { brandCount, variantCount } = countBrandsAndVariants(current.items ?? []);
  const showFloat = dismissed && !dialogOpen;

  return (
    <>
      {showFloat && (
        <div className="fixed top-4 right-4 z-[45] w-[min(100vw-2rem,20rem)] pointer-events-auto">
          <Card
            className="shadow-lg border-amber-200 bg-amber-50/95 backdrop-blur-sm cursor-pointer hover:bg-amber-50 transition-colors"
            onClick={openFromFloat}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openFromFloat();
              }
            }}
          >
            <CardHeader className="p-3 pb-1 space-y-1">
              <CardTitle className="text-sm font-semibold leading-snug text-amber-950">
                Price changes pending
              </CardTitle>
              <CardDescription className="text-xs text-amber-900/80">
                Please review and confirm the price changes
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 pt-1 space-y-2">
              <p className="text-sm font-medium text-amber-950">
                Brand count {brandCount} · Variant count {variantCount}
              </p>
              <p className="text-[11px] text-amber-900/70">
                Your bag still uses previous prices until you confirm. Tap to review.
              </p>
              <Button
                type="button"
                size="sm"
                className="w-full"
                onClick={(e) => {
                  e.stopPropagation();
                  openFromFloat();
                }}
              >
                Review & confirm
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next) dismissForLater();
          else setDialogOpen(true);
        }}
      >
        <AlertDialogContent
          className={[
            'flex flex-col gap-0 overflow-hidden p-0',
            'w-[calc(100%-1rem)]',
            'max-sm:left-2 max-sm:right-2 max-sm:top-2 max-sm:bottom-2',
            'max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-none',
            'max-sm:h-[calc(100dvh-1rem)] max-sm:max-h-[calc(100dvh-1rem)]',
            'sm:max-w-4xl sm:w-[min(56rem,calc(100vw-2rem))]',
            'sm:max-h-[90vh]',
          ].join(' ')}
        >
          <AlertDialogHeader className="shrink-0 space-y-2 p-4 pb-3 text-left sm:p-6 sm:pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <AlertDialogTitle className="text-base sm:text-lg leading-snug pr-1">
                Confirm company price change
              </AlertDialogTitle>
              <div className="flex items-center gap-2">
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={viewMode}
                  onValueChange={(v) => {
                    if (v === 'cards' || v === 'table') setViewMode(v);
                  }}
                  className="justify-end border rounded-md p-0.5"
                  aria-label="Price list view"
                >
                  <ToggleGroupItem value="cards" aria-label="Card view" className="gap-1 px-2 h-8">
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span className="text-xs sm:inline">Cards</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem value="table" aria-label="Table view" className="gap-1 px-2 h-8">
                    <Table2 className="h-3.5 w-3.5" />
                    <span className="text-xs sm:inline">Table</span>
                  </ToggleGroupItem>
                </ToggleGroup>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={dismissForLater}
                  aria-label="Confirm later"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground text-left">
                <p className="text-xs sm:text-sm leading-relaxed">
                  Main Inventory already uses these prices. You can confirm now or later — your bag
                  keeps previous prices until you confirm. A reminder stays on screen until you do.
                </p>
                <p className="font-mono text-foreground font-medium text-xs sm:text-sm break-all">
                  {current.batch_number}
                </p>
                <p className="text-xs sm:text-sm">
                  Created by {current.created_by_name || '—'}
                  {current.created_at
                    ? ` · ${new Date(current.created_at).toLocaleString()}`
                    : ''}
                </p>
                <div className="rounded-md border bg-muted/40 px-3 py-2 space-y-0.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    Change note
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {current.note?.trim() ? current.note : '—'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <Badge variant="outline" className="font-normal">
                    {brandCount} brand{brandCount === 1 ? '' : 's'} · {variantCount} variant
                    {variantCount === 1 ? '' : 's'}
                  </Badge>
                  {remaining > 1 && (
                    <Badge variant="secondary">{remaining} batches waiting</Badge>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 max-sm:flex-1 sm:max-h-[calc(90vh-14rem)]">
            <PriceChangeItemsFlatTable
              batch={current}
              myAgreement={myAgreement}
              compact
              viewMode={viewMode}
            />
          </div>

          <div className="shrink-0 border-t bg-background p-4 space-y-3 sm:p-6 sm:pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-start gap-3">
              <Checkbox
                id="price-change-gate-ack"
                className="mt-0.5"
                checked={acked}
                onCheckedChange={(v) => setAcked(v === true)}
              />
              <Label
                htmlFor="price-change-gate-ack"
                className="text-xs sm:text-sm leading-snug font-normal cursor-pointer"
              >
                I reviewed these prices and agree to sell at the new Selling / DSP / RSP for brands
                and variants I hold.
              </Label>
            </div>

            <AlertDialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-stretch p-0">
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 sm:h-10"
                onClick={dismissForLater}
              >
                Confirm later
              </Button>
              <Button
                className="w-full h-11 text-base sm:h-10 sm:text-sm"
                disabled={!acked || confirmMutation.isPending}
                onClick={() => confirmMutation.mutate(current.id)}
              >
                {confirmMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                )}
                Confirm prices
              </Button>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
