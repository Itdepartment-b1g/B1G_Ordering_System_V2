import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { useAgentInventory } from '@/features/inventory/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  agreementProgress,
  confirmCompanyPriceChange,
  fetchMyPendingPriceAgreements,
} from './companyPriceChangeApi';
import { PriceChangeItemsFlatTable } from './PriceChangeItemsFlatTable';

export default function PriceAgreementPage() {
  const { user } = useAuth();
  const { hasWarehouseHubLink, hasWarehouseHubLinkLoading } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [ackByBatch, setAckByBatch] = useState<Record<string, boolean>>({});
  const { refreshInventory } = useAgentInventory();

  const canAccess =
    hasWarehouseHubLink === true &&
    (user?.role === 'team_leader' || user?.role === 'mobile_sales');

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['price-agreements', user?.company_id, user?.id],
    queryFn: () => fetchMyPendingPriceAgreements(user!.company_id!, user!.id),
    enabled: !!user?.company_id && !!user?.id && canAccess,
  });

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
      qc.invalidateQueries({ queryKey: ['price-agreements'] });
      qc.invalidateQueries({ queryKey: ['price-history'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      void refreshInventory();
    },
    onError: (err: Error) => {
      toast({ title: 'Confirm failed', description: err.message, variant: 'destructive' });
    },
  });

  const roleLabel = useMemo(
    () => (user?.role === 'team_leader' ? 'Team Leader' : 'Mobile Sales'),
    [user?.role]
  );

  if (hasWarehouseHubLinkLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Price agreements</CardTitle>
            <CardDescription>
              Available only for Team Leaders and Mobile Sales in warehouse-linked companies.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Price agreements</h1>
        <p className="text-sm text-muted-foreground mt-1">
          As {roleLabel}, review the flat price list and confirm once. If Super Admin adds more
          changes after you confirm, you will need to confirm again.{' '}
          <Link to="/inventory/price-history" className="underline">
            View price history
          </Link>
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : batches.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No price changes waiting for your confirmation.
          </CardContent>
        </Card>
      ) : (
        batches.map((batch) => {
          const progress = agreementProgress(batch.agreements);
          const acked = !!ackByBatch[batch.id];
          const myAgreement = (batch.agreements ?? []).find((a) => a.profile_id === user?.id);
          return (
            <Card key={batch.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg font-mono">{batch.batch_number}</CardTitle>
                    <CardDescription>
                      Created by {batch.created_by_name || '—'} ·{' '}
                      {batch.created_at
                        ? new Date(batch.created_at).toLocaleString()
                        : ''}
                      {batch.note ? ` · Note: ${batch.note}` : ''}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">{progress.label}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <PriceChangeItemsFlatTable batch={batch} myAgreement={myAgreement} />

                <div className="flex items-start gap-2">
                  <Checkbox
                    id={`ack-${batch.id}`}
                    checked={acked}
                    onCheckedChange={(v) =>
                      setAckByBatch((prev) => ({ ...prev, [batch.id]: v === true }))
                    }
                  />
                  <Label htmlFor={`ack-${batch.id}`} className="text-sm leading-snug font-normal">
                    I reviewed these prices and agree to sell at the new Selling / DSP / RSP for
                    brands and variants I hold.
                  </Label>
                </div>

                <Button
                  disabled={!acked || confirmMutation.isPending}
                  onClick={() => confirmMutation.mutate(batch.id)}
                >
                  {confirmMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Confirm
                </Button>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
