import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Crown, Loader2, Users } from 'lucide-react';

export type SalesTargetViewPerson = {
  id: string;
  fullName: string;
  role: 'sales_director' | 'key_account_manager';
  directorName?: string;
};

export type SalesTargetViewStats = {
  month: string;
  monthLabel: string;
  targetRevenue: number | null;
  actualRevenue: number;
  actualOrders: number;
  actualQty: number;
  attainmentPct: number | null;
};

export type SalesTargetPo = {
  id: string;
  poNumber: string;
  poDate: string;
  clientName: string;
  shopName: string;
  balance: number;
  total: number;
};

type SalesTargetActualDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: SalesTargetViewPerson | null;
  stats: SalesTargetViewStats | null;
  purchaseOrders: SalesTargetPo[];
  loading?: boolean;
  error?: string | null;
};

function formatPeso(value: number | null | undefined): string {
  if (value == null) return '—';
  return `₱${Math.round(value).toLocaleString('en-PH')}`;
}

function roleLabel(role: SalesTargetViewPerson['role']): string {
  return role === 'sales_director' ? 'Sales Director' : 'Key Account Manager';
}

/**
 * Drill-down: stat cards + PO table for a person/month.
 */
export function SalesTargetActualDetailDialog({
  open,
  onOpenChange,
  person,
  stats,
  purchaseOrders,
  loading = false,
  error = null,
}: SalesTargetActualDetailDialogProps) {
  const navigate = useNavigate();
  const totalSum = purchaseOrders.reduce((s, po) => s + po.total, 0);
  const balanceSum = purchaseOrders.reduce((s, po) => s + po.balance, 0);

  const openPoOnPurchaseOrdersPage = (poNumber: string) => {
    onOpenChange(false);
    navigate(
      `/key-accounts/purchase-orders?po=${encodeURIComponent(poNumber)}&tab=all`
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Actual sales detail</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {person && (
                <>
                  <span className="text-foreground font-medium">{person.fullName}</span>
                  <Badge variant="secondary" className="gap-1 font-normal">
                    {person.role === 'sales_director' ? (
                      <Crown className="h-3 w-3" />
                    ) : (
                      <Users className="h-3 w-3" />
                    )}
                    {roleLabel(person.role)}
                  </Badge>
                  {stats && (
                    <span className="text-muted-foreground">{stats.monthLabel}</span>
                  )}
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {stats && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Target revenue</CardDescription>
                <CardTitle className="text-lg tabular-nums">
                  {formatPeso(stats.targetRevenue)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Actual revenue</CardDescription>
                <CardTitle className="text-lg tabular-nums">
                  {formatPeso(stats.actualRevenue)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>POs</CardDescription>
                <CardTitle className="text-lg tabular-nums">
                  {stats.actualOrders.toLocaleString('en-PH')}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Units</CardDescription>
                <CardTitle className="text-lg tabular-nums">
                  {stats.actualQty.toLocaleString('en-PH')}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Attainment</CardDescription>
                <CardTitle className="text-lg">
                  {stats.attainmentPct == null ? (
                    <span className="text-muted-foreground text-base font-normal">
                      No target
                    </span>
                  ) : (
                    <span
                      className={
                        stats.attainmentPct >= 100
                          ? 'text-emerald-600'
                          : stats.attainmentPct >= 70
                            ? 'text-amber-600'
                            : undefined
                      }
                    >
                      {stats.attainmentPct}%
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              {stats.attainmentPct != null && (
                <CardContent className="pt-0">
                  <Progress value={Math.min(stats.attainmentPct, 100)} className="h-2" />
                </CardContent>
              )}
            </Card>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Purchase orders</h3>
            <p className="text-xs text-muted-foreground">Click a row to open on Purchase Orders</p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground border rounded-md">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading purchase orders…
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-6 text-center border rounded-md">{error}</p>
          ) : purchaseOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center border rounded-md">
              No POs for this month.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO</TableHead>
                    <TableHead>PO date</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Shop name</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((po) => (
                    <TableRow
                      key={po.id}
                      className="cursor-pointer hover:bg-muted/60"
                      onClick={() => openPoOnPurchaseOrdersPage(po.poNumber)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openPoOnPurchaseOrdersPage(po.poNumber);
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Open ${po.poNumber} on Purchase Orders`}
                    >
                      <TableCell className="font-medium tabular-nums text-primary">
                        <span className="underline underline-offset-4">{po.poNumber}</span>
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {po.poDate}
                      </TableCell>
                      <TableCell>{po.clientName}</TableCell>
                      <TableCell className="text-muted-foreground">{po.shopName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPeso(po.balance)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatPeso(po.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-medium">
                      Totals ({purchaseOrders.length} POs)
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatPeso(balanceSum)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatPeso(totalSum)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
