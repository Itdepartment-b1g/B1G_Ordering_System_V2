import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, PackageMinus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import {
  CLIENT_ORDER_RETURNS_QUERY_KEY,
  buildReturnedStockByVariantId,
  canShowClientOrderReturns,
  fetchClientOrderReturns,
} from '@/features/orders/client-returns/clientReturnApi';
import type { PreviewClientReturn } from '@/features/orders/client-returns/clientReturnPreview';
import { ReturnedStockDetailDialog } from '@/features/orders/client-returns/ReturnedStockDetailDialog';
import { useAgentInventory } from './hooks';
import {
  buildActiveAgentBrands,
  countLowStockVariants,
  emptyReturnedStock,
  formatVariantTypeLabel,
  getBrandReturnedStock,
  getBrandTotalStock,
  getTypeStock,
  getVariantTypeColor,
  isLowStock,
  sortedVariantTypeEntries,
} from './utils/myInventoryBrandDisplay';

export default function MyInventoryBrandPage() {
  const { brandId = '' } = useParams<{ brandId: string }>();
  const { agentBrands } = useAgentInventory();
  const { user } = useAuth();
  const { hasWarehouseHubLink } = usePermissions();
  const showReturnedColumn = canShowClientOrderReturns(hasWarehouseHubLink, user?.role);

  const [returnedDialog, setReturnedDialog] = useState<{
    variantName: string;
    brandName: string;
    totalReturned: number;
    returns: PreviewClientReturn[];
  } | null>(null);

  const { data: clientReturns = [] } = useQuery({
    queryKey: [CLIENT_ORDER_RETURNS_QUERY_KEY, user?.company_id, user?.id],
    enabled: showReturnedColumn && !!user?.company_id,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: fetchClientOrderReturns,
  });

  const returnedStockByVariantId = useMemo(() => {
    if (!showReturnedColumn) return new Map();
    return buildReturnedStockByVariantId(clientReturns, { holderId: user?.id });
  }, [clientReturns, showReturnedColumn, user?.id]);

  const getReturnedStock = (variantId: string) =>
    returnedStockByVariantId.get(variantId) || emptyReturnedStock();

  const brand = useMemo(() => {
    const active = buildActiveAgentBrands({
      agentBrands,
      clientReturns,
      returnedStockByVariantId,
      showReturnedColumn,
    });
    return active.find((item) => item.id === brandId) || null;
  }, [agentBrands, brandId, clientReturns, returnedStockByVariantId, showReturnedColumn]);

  const totalStock = brand ? getBrandTotalStock(brand) : 0;
  const returned = brand
    ? getBrandReturnedStock(brand, getReturnedStock)
    : { qty: 0, returns: [] as PreviewClientReturn[] };
  const lowStockCount = brand ? countLowStockVariants(brand.allVariants) : 0;
  const typeEntries = brand ? sortedVariantTypeEntries(brand.variantsByType) : [];

  if (!brand) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/my-inventory">
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">Brand not found</p>
            <p className="mt-1 text-sm">It may have no stock, or the link is outdated.</p>
            <Button className="mt-4" asChild>
              <Link to="/my-inventory">Go to My Inventory</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8 md:p-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/my-inventory">
            <ArrowLeft className="h-4 w-4" />
            Back to inventory
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{brand.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {(brand.allVariants || []).length} item
            {(brand.allVariants || []).length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="px-3 py-3 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Total stock
            </p>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums leading-none ${
                lowStockCount > 0 && totalStock > 0 ? 'text-amber-600' : ''
              }`}
            >
              {totalStock}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-3 py-3 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Returned
            </p>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums leading-none ${
                returned.qty > 0 ? 'text-rose-700' : ''
              }`}
            >
              {showReturnedColumn ? returned.qty : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-3 py-3 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Low stock
            </p>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums leading-none ${
                lowStockCount > 0 ? 'text-amber-600' : ''
              }`}
            >
              {lowStockCount}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {typeEntries.map(([type, variants]) => {
          const colors = getVariantTypeColor(type);
          const typeStock = getTypeStock(variants);
          return (
            <div
              key={type}
              className={`overflow-hidden rounded-lg border bg-background ${colors.headerBg}`}
            >
              <div className="flex items-center gap-2 border-b px-3 py-2.5">
                <span className={`text-sm font-semibold ${colors.header}`}>
                  {formatVariantTypeLabel(type, true)}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  ({variants.length})
                </span>
                <span
                  className={`ml-auto text-sm font-semibold tabular-nums ${
                    variants.some((v) => isLowStock(v.stock) && v.stock > 0) ? 'text-amber-600' : ''
                  }`}
                >
                  Total qty: {typeStock}
                </span>
              </div>

              <div className="divide-y bg-background">
                {variants.map((variant) => {
                  const returnedStock = showReturnedColumn ? getReturnedStock(variant.id) : null;
                  return (
                    <div key={variant.id} className="space-y-2 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-sm font-medium leading-snug break-words">
                          {variant.name}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          Price{' '}
                          <span className="font-medium text-foreground">
                            ₱{Number(variant.price || 0).toFixed(2)}
                          </span>
                        </span>
                        <span className="text-muted-foreground/50">|</span>
                        <span className="tabular-nums">
                          DSP{' '}
                          <span className="font-medium text-foreground">
                            {typeof variant.dspPrice === 'number'
                              ? `₱${variant.dspPrice.toFixed(2)}`
                              : '—'}
                          </span>
                        </span>
                        <span className="text-muted-foreground/50">|</span>
                        <span className="tabular-nums">
                          RSP{' '}
                          <span className="font-medium text-foreground">
                            {typeof variant.rspPrice === 'number'
                              ? `₱${variant.rspPrice.toFixed(2)}`
                              : '—'}
                          </span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="tabular-nums">
                          Stock:{' '}
                          <span
                            className={`font-semibold ${
                              isLowStock(variant.stock) && variant.stock > 0 ? 'text-amber-600' : ''
                            }`}
                          >
                            {variant.stock}
                          </span>
                        </span>
                        {returnedStock ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={`h-8 gap-1.5 px-2.5 text-xs ${
                              returnedStock.qty > 0
                                ? 'border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800'
                                : 'text-muted-foreground'
                            }`}
                            onClick={() =>
                              setReturnedDialog({
                                brandName: brand.name,
                                variantName: variant.name,
                                totalReturned: returnedStock.qty,
                                returns: returnedStock.returns,
                              })
                            }
                          >
                            <PackageMinus className="h-3.5 w-3.5" />
                            Returned
                            {returnedStock.qty > 0 ? `: ${returnedStock.qty}` : ': 0'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {showReturnedColumn ? (
        <ReturnedStockDetailDialog
          open={!!returnedDialog}
          onOpenChange={(open) => {
            if (!open) setReturnedDialog(null);
          }}
          brandName={returnedDialog?.brandName}
          variantName={returnedDialog?.variantName || ''}
          totalReturned={returnedDialog?.totalReturned || 0}
          returns={returnedDialog?.returns || []}
        />
      ) : null}
    </div>
  );
}
