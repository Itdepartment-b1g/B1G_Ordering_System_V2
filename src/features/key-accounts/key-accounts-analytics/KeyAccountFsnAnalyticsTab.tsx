import { useEffect, useMemo, useState } from 'react';
import { Filter, Loader2, Search, Warehouse } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAppDispatch, useAppSelector } from '@/store/store';
import { fetchKAFsnCatalog, fetchKAFsnSetup } from '@/store/slices/key-accounts/analytics';
import { WarehouseFsnPanel } from '@/features/inventory/components/WarehouseFsnPanel';
import { FSN_PERIOD_DAYS_OPTIONS, type FsnPeriodDays } from '@/features/inventory/warehouseFsnAnalysis';
import {
  brandsFromFsnCatalog,
  computeKeyAccountFsnFromDelivered,
  type KeyAccountFsnItem,
  type KeyAccountFsnOrder,
} from './keyAccountFsnAnalysis';

type KeyAccountFsnAnalyticsTabProps = {
  orders: KeyAccountFsnOrder[];
  items: KeyAccountFsnItem[];
};

export default function KeyAccountFsnAnalyticsTab({ orders, items }: KeyAccountFsnAnalyticsTabProps) {
  const { toast } = useToast();
  const dispatch = useAppDispatch();
  const locations = useAppSelector((state) => state.kaAnalytics.fsnLocations);
  const fsnSetupStatus = useAppSelector((state) => state.kaAnalytics.fsnSetupStatus);
  const fsnSetupError = useAppSelector((state) => state.kaAnalytics.fsnSetupError);
  const fsnCatalog = useAppSelector((state) => state.kaAnalytics.fsnCatalog);
  const fsnCatalogStatus = useAppSelector((state) => state.kaAnalytics.fsnCatalogStatus);
  const fsnCatalogError = useAppSelector((state) => state.kaAnalytics.fsnCatalogError);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [periodDays, setPeriodDays] = useState<FsnPeriodDays>(90);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void dispatch(fetchKAFsnSetup());
  }, [dispatch]);

  useEffect(() => {
    if (fsnSetupStatus !== 'failed' || !fsnSetupError) return;
    toast({
      variant: 'destructive',
      title: 'Error loading FSN setup',
      description: fsnSetupError,
    });
  }, [fsnSetupStatus, fsnSetupError, toast]);

  useEffect(() => {
    if (locations.length === 0) {
      setSelectedLocationId('');
      return;
    }
    setSelectedLocationId((current) => {
      if (current && locations.some((loc) => loc.id === current)) return current;
      const main = locations.find((loc) => loc.is_main);
      return (main ?? locations[0]).id;
    });
  }, [locations]);

  useEffect(() => {
    if (!selectedLocationId) return;
    void dispatch(fetchKAFsnCatalog(selectedLocationId));
  }, [dispatch, selectedLocationId]);

  useEffect(() => {
    if (fsnCatalogStatus !== 'failed' || !fsnCatalogError) return;
    toast({
      variant: 'destructive',
      title: 'Error loading warehouse stock',
      description: fsnCatalogError,
    });
  }, [fsnCatalogStatus, fsnCatalogError, toast]);

  const catalogBrands = useMemo(() => brandsFromFsnCatalog(fsnCatalog), [fsnCatalog]);
  const loadingSetup = fsnSetupStatus === 'loading' || fsnSetupStatus === 'idle';
  const loadingCatalog = fsnCatalogStatus === 'loading';

  const locationLabel = useMemo(() => {
    const loc = locations.find((l) => l.id === selectedLocationId);
    if (!loc) return 'No warehouse selected';
    return loc.is_main ? `Main: ${loc.name}` : `Sub: ${loc.name}`;
  }, [locations, selectedLocationId]);

  const fsnRows = useMemo(() => {
    if (!selectedLocationId || catalogBrands.length === 0) return [];
    return computeKeyAccountFsnFromDelivered({
      orders,
      items,
      catalogBrands,
      warehouseLocationId: selectedLocationId,
      periodDays,
    });
  }, [orders, items, catalogBrands, selectedLocationId, periodDays]);

  if (loadingSetup) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading FSN analysis…
        </CardContent>
      </Card>
    );
  }

  if (locations.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          No linked warehouse hub found. Connect your company to a warehouse to run FSN analysis.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>FSN Analysis</CardTitle>
        <CardDescription>
          Fast / Slow / Non-moving SKUs from delivered Key Account purchase orders, by warehouse location.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <Card className="h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Warehouse className="h-3.5 w-3.5" />
                  Warehouse
                </Label>
                <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.is_main ? `Main — ${loc.name}` : loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Period</Label>
                <Select
                  value={String(periodDays)}
                  onValueChange={(v) => setPeriodDays(Number(v) as FsnPeriodDays)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FSN_PERIOD_DAYS_OPTIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        Last {d} days
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="fsn-search">Search SKUs</Label>
                <div className="relative">
                  <Search
                    className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="fsn-search"
                    className="pl-8"
                    placeholder="Brand or variant…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <WarehouseFsnPanel
            rows={fsnRows}
            loading={loadingCatalog}
            error={null}
            periodDays={periodDays}
            onPeriodDaysChange={setPeriodDays}
            locationLabel={locationLabel}
            search={search}
            hidePeriodSelector
            dataSourceDescription="Delivered Key Account POs only (fulfilled + delivered workflow). Supplier POs excluded."
            movementMetricLabel="delivered"
            showLocationStock
          />
        </div>
      </CardContent>
    </Card>
  );
}
