import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, LayoutGrid, Loader2, Table2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { useAgentInventory } from '@/features/inventory/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

/**
 * Blocking gate for Team Leaders and Mobile Sales with pending price agreements.
 * Shows on any authenticated page until the user confirms (cannot dismiss).
 */
export function PriceChangeConfirmGate() {
  const { user } = useAuth();
  const { hasWarehouseHubLink, hasWarehouseHubLinkLoading } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [acked, setAcked] = useState(false);
  const [viewMode, setViewMode] = usePreferredPriceItemsView();
  const { refreshInventory } = useAgentInventory();

  const eligible =
    !!user?.id &&
    !!user?.company_id &&
    hasWarehouseHubLink === true &&
    (user.role === 'team_leader' || user.role === 'mobile_sales');

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['price-agreements', user?.company_id, user?.id],
    queryFn: () => fetchMyPendingPriceAgreements(user!.company_id!, user!.id),
    enabled: eligible && !hasWarehouseHubLinkLoading,
    refetchInterval: eligible ? 60_000 : false,
  });

  const current = batches[0] ?? null;
  const open = eligible && !isLoading && !!current;

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
      qc.invalidateQueries({ queryKey: ['price-agreements'] });
      qc.invalidateQueries({ queryKey: ['price-history'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      void refreshInventory();
    },
    onError: (err: Error) => {
      toast({ title: 'Confirm failed', description: err.message, variant: 'destructive' });
    },
  });

  if (!open || !current) return null;

  const remaining = batches.length;
  const myAgreement = (current.agreements ?? []).find((a) => a.profile_id === user?.id);

  return (
    <AlertDialog open>
      <AlertDialogContent
        className={[
          'flex flex-col gap-0 overflow-hidden p-0',
          // Mobile: near full viewport
          'w-[calc(100%-1rem)]',
          'max-sm:left-2 max-sm:right-2 max-sm:top-2 max-sm:bottom-2',
          'max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-none',
          'max-sm:h-[calc(100dvh-1rem)] max-sm:max-h-[calc(100dvh-1rem)]',
          // Web: wider so table columns fit; capped height with inner scroll
          'sm:max-w-4xl sm:w-[min(56rem,calc(100vw-2rem))]',
          'sm:max-h-[90vh]',
        ].join(' ')}
      >
        <AlertDialogHeader className="shrink-0 space-y-2 p-4 pb-3 text-left sm:p-6 sm:pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <AlertDialogTitle className="text-base sm:text-lg leading-snug pr-1">
              Confirm company price change
            </AlertDialogTitle>
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
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground text-left">
              <p className="text-xs sm:text-sm leading-relaxed">
                <span className="sm:hidden">
                  Main Inventory already uses these prices. Confirm this list. If Super Admin adds
                  more later, you will confirm again.
                </span>
                <span className="hidden sm:inline">
                  Main Inventory already uses these prices. Confirm once for this list. If Super
                  Admin adds more prices after you confirm, you will need to confirm again. New
                  rows are marked; rows you already confirmed stay labeled Confirmed.
                </span>
              </p>
              <p className="font-mono text-foreground font-medium text-xs sm:text-sm break-all">
                {current.batch_number}
              </p>
              <p className="text-xs sm:text-sm">
                Created by {current.created_by_name || '—'}
                {current.created_at
                  ? ` · ${new Date(current.created_at).toLocaleString()}`
                  : ''}
                {current.note ? ` · ${current.note}` : ''}
              </p>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <Badge variant="outline" className="font-normal">
                  Awaiting your confirm
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

          <AlertDialogFooter className="sm:justify-stretch p-0">
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
  );
}
