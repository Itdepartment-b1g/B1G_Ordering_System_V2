import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PackageMinus, Loader2, Clock, CheckCircle2, XCircle, Hourglass } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

interface ReturnItemRow {
  variant_id: string;
  quantity: number;
  variant?: { id: string; name: string; brand?: { name: string } };
}

interface MyReturnRequest {
  id: string;
  status: string;
  return_date: string;
  created_at: string;
  return_reason: string;
  reason_notes: string | null;
  processed_at: string | null;
  processed_by?: { full_name: string };
  items: ReturnItemRow[];
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { icon: Hourglass, label: 'Pending', variant: 'secondary' },
  approved: { icon: CheckCircle2, label: 'Approved', variant: 'default' },
  rejected: { icon: XCircle, label: 'Rejected', variant: 'destructive' },
};

export default function MyReturnRequestsSection() {
  const { user } = useAuth();
  const [returns, setReturns] = useState<MyReturnRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id || user?.role === 'team_leader') return;

    const fetch = async () => {
      try {
        setLoading(true);
        const { data: returnsData, error } = await supabase
          .from('inventory_returns')
          .select(`
            id,
            status,
            return_date,
            created_at,
            return_reason,
            reason_notes,
            processed_at,
            processed_by:profiles!inventory_returns_processed_by_fkey(full_name)
          `)
          .eq('agent_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;

        if (!returnsData?.length) {
          setReturns([]);
          return;
        }

        const { data: itemsData } = await supabase
          .from('inventory_return_items')
          .select('return_id, variant_id, quantity, variant:variants(id, name, brand:brands(name))')
          .in('return_id', returnsData.map((r: any) => r.id));

        const itemsByReturn = (itemsData || []).reduce<Record<string, ReturnItemRow[]>>(
          (acc, row: any) => {
            const id = row.return_id;
            if (!acc[id]) acc[id] = [];
            acc[id].push({
              variant_id: row.variant_id,
              quantity: row.quantity,
              variant: row.variant,
            });
            return acc;
          },
          {}
        );

        setReturns(
          (returnsData || []).map((r: any) => ({
            ...r,
            items: itemsByReturn[r.id] || [],
          }))
        );
      } catch (err) {
        console.error('Error fetching return requests:', err);
        setReturns([]);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!user?.id || user?.role === 'team_leader') return;

    const channel = supabase
      .channel('my_return_requests_changes')
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'inventory_returns',
          filter: `agent_id=eq.${user.id}`,
        },
        () => {
          // Re-fetch on any change
          supabase
            .from('inventory_returns')
            .select('id, status, return_date, created_at, return_reason, reason_notes, processed_at, processed_by:profiles!inventory_returns_processed_by_fkey(full_name)')
            .eq('agent_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20)
            .then(({ data: returnsData, error }) => {
              if (error) return;
              if (!returnsData?.length) {
                setReturns([]);
                return;
              }
              supabase
                .from('inventory_return_items')
                .select('return_id, variant_id, quantity, variant:variants(id, name, brand:brands(name))')
                .in('return_id', returnsData.map((r: any) => r.id))
                .then(({ data: itemsData }) => {
                  const itemsByReturn = (itemsData || []).reduce<Record<string, ReturnItemRow[]>>(
                    (acc, row: any) => {
                      const id = row.return_id;
                      if (!acc[id]) acc[id] = [];
                      acc[id].push({
                        variant_id: row.variant_id,
                        quantity: row.quantity,
                        variant: row.variant,
                      });
                      return acc;
                    },
                    {}
                  );
                  setReturns(
                    (returnsData || []).map((r: any) => ({
                      ...r,
                      items: itemsByReturn[r.id] || [],
                    }))
                  );
                });
            });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user?.id, user?.role]);

  if (user?.role === 'team_leader' || returns.length === 0) {
    if (loading && user?.role !== 'team_leader') {
      return (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading return requests...</span>
            </div>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="flex items-center gap-2 text-base md:text-lg">
          <PackageMinus className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
          My Return Requests
        </CardTitle>
        <CardDescription>
          Track your return requests to your team leader. Date, time, status, and who processed.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6">
        <div className="space-y-4">
          {returns.map((req) => {
            const config = statusConfig[req.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            return (
              <div key={req.id} className="border rounded-lg p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={config.variant} className="gap-1">
                    <StatusIcon className="h-3 w-3" />
                    {config.label}
                  </Badge>
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(req.created_at), 'MMM d, yyyy')} at{' '}
                    {format(new Date(req.created_at), 'h:mm a')}
                  </span>
                  {req.processed_at && req.processed_by && (
                    <span className="text-sm text-muted-foreground">
                      {req.status === 'approved' ? 'Accepted' : 'Rejected'} by {req.processed_by.full_name} on{' '}
                      {format(new Date(req.processed_at), 'MMM d, h:mm a')}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Reason: <span className="font-medium capitalize">{req.return_reason}</span>
                  {req.reason_notes && ` — ${req.reason_notes}`}
                </p>
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase">Stocks</span>
                  <div className="border rounded-md overflow-hidden mt-2">
                    {(() => {
                      const byBrand = (req.items || []).reduce<Record<string, { total: number; items: ReturnItemRow[] }>>(
                        (acc, item) => {
                          const brandName = item.variant?.brand?.name || 'Other';
                          if (!acc[brandName]) acc[brandName] = { total: 0, items: [] };
                          acc[brandName].items.push(item);
                          acc[brandName].total += item.quantity;
                          return acc;
                        },
                        {}
                      );
                      return (
                        <>
                          {Object.entries(byBrand).map(([brandName, { total, items }]) => (
                            <div key={brandName} className="border-b last:border-b-0">
                              <div className="px-3 py-2 bg-muted/50 font-medium text-sm flex justify-between items-center">
                                <span>{brandName}</span>
                                <span className="font-mono">Total: {total}</span>
                              </div>
                              <div className="divide-y">
                                {items.map((item) => (
                                  <div key={item.variant_id} className="flex justify-between items-center px-4 py-1.5 text-sm">
                                    <span className="text-muted-foreground">{item.variant?.name || '—'}</span>
                                    <span className="font-medium">{item.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
