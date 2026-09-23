import { useMemo, useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Plus, RefreshCw, Send, Undo2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  allocateToSubWarehouse,
  createSubWarehouse,
  fetchMyWarehouseLocation,
  fetchSubWarehouseLocationUsers,
  fetchSubWarehouseLocations,
  fetchSubWarehousePoReserved,
  type SubWarehouseLocationRow,
  type SubWarehouseLocationUserRow,
} from '@/store/slices/warehouse/sub-warehouses';
import { useInventory, type Brand, type Variant } from './InventoryContext';
import { refetchWarehouseAllocationHistory } from './warehouse-allocation-history/hooks/useWarehouseAllocationHistory';
import { useWarehouseLocationMembership } from './useWarehouseLocationMembership';
import { SubWarehouseReturnStockDialog } from './components/SubWarehouseReturnStockDialog';
import { deriveLocationCode } from './internalStockRequestsStore';
import { getMainWarehouseAllocatableQty } from './warehouseStockBoard';
import PageManualDialog from '@/features/inventory/warehouse-manual/components/PageManualDialog';
import PageGettingStartedDialog from '@/features/inventory/warehouse-manual/components/PageGettingStartedDialog';
import SubwarehouseManual from '@/features/inventory/warehouse-manual/components/SubwarehouseManual';

type LocationRow = SubWarehouseLocationRow;
type LocationUserRow = SubWarehouseLocationUserRow;

function getVariantsByTypeEntries(brand: Brand): [string, Variant[]][] {
  const v = brand.variantsByType;
  if (!v) return [];
  if (v instanceof Map) return Array.from(v.entries());
  return Object.entries(v as unknown as Record<string, Variant[]>);
}

function normalizeTypeLabel(typeKey: string): string {
  const t = typeKey.toLowerCase();
  if (t === 'flavor') return 'PODS';
  if (t === 'battery') return 'DEVICE';
  if (t === 'posm') return 'POSM';
  return typeKey.toUpperCase();
}

function getVariantTypeGroupsForBrand(brand: Brand, search: string): [string, Variant[]][] {
  const q = search.trim().toLowerCase();
  const brandMatch = !q || brand.name.toLowerCase().includes(q);
  const entries = getVariantsByTypeEntries(brand)
    .map(([type, variants]) => [type, variants] as [string, Variant[]])
    .filter(([, variants]) => variants.length > 0)
    .sort(([a], [b]) => a.localeCompare(b));

  if (!q) return entries;

  return entries
    .map(([type, variants]) => [
      type,
      brandMatch ? variants : variants.filter((v) => v.name.toLowerCase().includes(q)),
    ] as [string, Variant[]])
    .filter(([, variants]) => variants.length > 0);
}

export default function SubWarehousesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { brands, loading: loadingBrands, refreshInventory } = useInventory();
  const { membership } = useWarehouseLocationMembership({
    userId: user?.id,
    isWarehouse: user?.role === 'warehouse',
  });

  const {
    locations,
    locationUsers,
    myLocation,
    poReservedByVariantId,
    poReservedLocationId,
    status: locationsStatus,
  } = useAppSelector((state) => state.warehouseSubWarehouses);

  const [createOpen, setCreateOpen] = useState(false);
  const [allocOpen, setAllocOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [allocating, setAllocating] = useState(false);

  const [createForm, setCreateForm] = useState({
    location_name: '',
    full_name: '',
    email: '',
    password: '',
    phone: '',
  });

  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [allocQuantities, setAllocQuantities] = useState<Record<string, number>>({});
  const [allocFilter, setAllocFilter] = useState('');

  const isWarehouse = user?.role === 'warehouse';

  useEffect(() => {
    if (!user?.id || !isWarehouse) return;
    void dispatch(fetchMyWarehouseLocation());
  }, [dispatch, user?.id, isWarehouse]);

  useEffect(() => {
    if (!user?.company_id || !isWarehouse) return;
    void dispatch(fetchSubWarehouseLocations());
    void dispatch(fetchSubWarehouseLocationUsers());
  }, [dispatch, user?.company_id, isWarehouse]);

  const isMainWarehouseUser = !!myLocation?.warehouse_locations?.is_main;
  const myLocationId = myLocation?.location_id || '';
  const loadingLocations =
    locationsStatus === 'loading' || (locationsStatus === 'idle' && !!user?.company_id && isWarehouse);

  const mainWarehouseLocationId = useMemo(
    () => locations.find((loc) => loc.is_main)?.id ?? null,
    [locations]
  );

  useEffect(() => {
    if (!user?.company_id || !mainWarehouseLocationId || !allocOpen) return;
    void dispatch(fetchSubWarehousePoReserved(mainWarehouseLocationId));
  }, [dispatch, user?.company_id, mainWarehouseLocationId, allocOpen]);

  const visiblePoReserved =
    poReservedLocationId === mainWarehouseLocationId ? poReservedByVariantId : {};

  const getAllocatableQty = useCallback(
    (variant: Variant) => getMainWarehouseAllocatableQty(variant, visiblePoReserved),
    [visiblePoReserved]
  );

  const locationUserByLocationId = useMemo(() => {
    const m = new Map<string, LocationUserRow>();
    for (const row of locationUsers) m.set(row.location_id, row);
    return m;
  }, [locationUsers]);

  const mainBrands = useMemo(() => brands, [brands]);

  const variantById = useMemo(() => {
    const m = new Map<string, Variant>();
    for (const b of mainBrands) {
      for (const v of b.allVariants) m.set(v.id, v);
    }
    return m;
  }, [mainBrands]);

  const allocBrandsFiltered = useMemo(() => {
    return mainBrands.filter((b) => getVariantTypeGroupsForBrand(b, allocFilter).length > 0);
  }, [mainBrands, allocFilter]);

  const allocSummary = useMemo(() => {
    const lines = Object.entries(allocQuantities).filter(([, q]) => (q ?? 0) > 0);
    const totalQty = lines.reduce((s, [, q]) => s + (q ?? 0), 0);
    return { lineCount: lines.length, totalQty };
  }, [allocQuantities]);

  const onRefresh = async () => {
    await Promise.all([
      dispatch(fetchSubWarehouseLocations()),
      dispatch(fetchSubWarehouseLocationUsers()),
      dispatch(fetchMyWarehouseLocation()),
      refreshInventory(),
    ]);
  };

  const openReturnForMyLocation = () => {
    if (!myLocationId) return;
    setReturnOpen(true);
  };

  const createSubWarehouseAccount = async () => {
    if (!user?.company_id) return;
    if (!createForm.location_name.trim() || !createForm.full_name.trim() || !createForm.email.trim() || !createForm.password) {
      toast({ title: 'Missing fields', description: 'Fill out location name, user name, email, and password.', variant: 'destructive' });
      return;
    }

    try {
      setCreating(true);
      await dispatch(
        createSubWarehouse({
          location_name: createForm.location_name.trim(),
          full_name: createForm.full_name.trim(),
          email: createForm.email.trim(),
          password: createForm.password,
          phone: createForm.phone.trim() || null,
        })
      ).unwrap();

      toast({ title: 'Success', description: 'Sub-warehouse and account created.' });
      setCreateOpen(false);
      setCreateForm({ location_name: '', full_name: '', email: '', password: '', phone: '' });
      await onRefresh();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to create sub-warehouse', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const allocateToLocation = async () => {
    if (!selectedLocationId) return;

    const items = Object.entries(allocQuantities)
      .map(([variant_id, quantity]) => ({ variant_id, quantity }))
      .filter((x) => (x.quantity ?? 0) > 0);

    if (items.length === 0) {
      toast({ title: 'Nothing to allocate', description: 'Enter a quantity for at least one SKU.', variant: 'destructive' });
      return;
    }

    // Client-side validation (server still enforces).
    for (const it of items) {
      const v = variantById.get(it.variant_id);
      if (!v) {
        toast({ title: 'Invalid SKU', description: 'One of the selected variants could not be found.', variant: 'destructive' });
        return;
      }
      const available = getAllocatableQty(v);
      if (it.quantity > available) {
        toast({
          title: 'Insufficient stock',
          description: `${v.name} available is ${available} (PO reserved stock cannot be allocated).`,
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setAllocating(true);
      await dispatch(
        allocateToSubWarehouse({
          location_id: selectedLocationId,
          items,
          notes: 'Allocated to sub-warehouse',
        })
      ).unwrap();

      toast({ title: 'Success', description: 'Stock allocated to sub-warehouse.' });
      const allocatedLocationId = selectedLocationId;
      setAllocOpen(false);
      setSelectedLocationId('');
      setAllocQuantities({});
      setAllocFilter('');
      // Keep both the main inventory and the sub-warehouse dashboard in sync.
      await onRefresh();
      await refetchWarehouseAllocationHistory(
        qc,
        user,
        membership.isMain ? null : membership.locationId,
        membership.isMain
      );
      await qc.invalidateQueries({
        queryKey: ['warehouse-location-inventory-brands', user?.company_id, allocatedLocationId],
      });
      // Invalidate the raw location inventory used by the return modal
      await qc.invalidateQueries({
        queryKey: ['warehouse-location-inventory', allocatedLocationId],
      });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to allocate stock', variant: 'destructive' });
    } finally {
      setAllocating(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sub Warehouses</h1>
          <p className="text-muted-foreground">Create sub-warehouses and allocate stock from the main warehouse.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PageGettingStartedDialog />
          <PageManualDialog
            title="Sub Warehouses Manual"
            fullManualHref="/warehouse-manual#subwarehouse"
          >
            <SubwarehouseManual embedded />
          </PageManualDialog>
          <Button variant="outline" onClick={() => void onRefresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {isMainWarehouseUser ? (
            <>
              {/* <Button variant="outline" onClick={() => setAllocOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                Allocate stock
              </Button> */}
              <Button variant="outline" onClick={() => setReturnOpen(true)}>
                <Undo2 className="mr-2 h-4 w-4" />
                Submit return
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create sub-warehouse
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => openReturnForMyLocation()} disabled={!myLocationId}>
                <Undo2 className="mr-2 h-4 w-4" />
                Return stock
              </Button>
              <div className="text-xs text-muted-foreground">
                You’re logged in as a <span className="font-medium text-foreground">sub-warehouse</span>. Only the{' '}
                <span className="font-medium text-foreground">Main Warehouse</span> account can create/allocate sub-warehouses.
              </div>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Locations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingLocations ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading locations…
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locations.map((loc) => {
                    const lu = locationUserByLocationId.get(loc.id);
                    return (
                      <TableRow key={loc.id}>
                        <TableCell className="font-medium">{loc.name}</TableCell>
                        <TableCell>{lu?.profile?.full_name || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{lu?.profile?.email || '—'}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{loc.is_main ? 'Main' : 'Sub'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {locations.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                        No locations found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create sub-warehouse */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create sub-warehouse</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="sw-name">Location name</Label>
              <Input id="sw-name" value={createForm.location_name} onChange={(e) => setCreateForm((f) => ({ ...f, location_name: e.target.value }))} placeholder="e.g. Santa Rosa" />
              {createForm.location_name.trim() ? (
                <p className="text-xs text-muted-foreground">
                  Request code:{' '}
                  <span className="font-mono font-medium text-foreground">
                    {deriveLocationCode(createForm.location_name)}
                  </span>
                  {' '}
                  · request numbers look like{' '}
                  <span className="font-mono">
                    RN-{deriveLocationCode(createForm.location_name)}-0001
                  </span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  A short location code is generated from the name for stock request numbers.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sw-fullname">User full name</Label>
                <Input id="sw-fullname" value={createForm.full_name} onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))} placeholder="Full name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sw-phone">Phone (optional)</Label>
                <Input id="sw-phone" value={createForm.phone} onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))} placeholder="09xx…" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sw-email">Email</Label>
                <Input id="sw-email" type="email" value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} placeholder="sub@warehouse.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sw-pass">Password</Label>
                <Input id="sw-pass" type="password" value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={() => void createSubWarehouseAccount()} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Allocate stock */}
      {/* <Dialog
        open={allocOpen}
        onOpenChange={(open) => {
          setAllocOpen(open);
          if (!open) {
            setSelectedLocationId('');
            setAllocQuantities({});
            setAllocFilter('');
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0">
          <DialogHeader>
            <DialogTitle>Allocate stock to sub-warehouse</DialogTitle>
            <p className="text-sm text-muted-foreground font-normal pt-1">
              Choose a destination, then enter quantities for any SKUs across all brands in one allocation.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2 flex-1 min-h-0 flex flex-col">
            <div className="space-y-2 shrink-0">
              <Label>Sub-warehouse</Label>
              <Select value={selectedLocationId || undefined} onValueChange={setSelectedLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations
                    .filter((l) => !l.is_main)
                    .map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <div className="space-y-2 flex-1">
                <Label htmlFor="alloc-filter">Filter brands or SKUs</Label>
                <Input
                  id="alloc-filter"
                  placeholder="Search by brand or product name…"
                  value={allocFilter}
                  onChange={(e) => setAllocFilter(e.target.value)}
                  disabled={!selectedLocationId || loadingBrands}
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={allocSummary.lineCount === 0}
                  onClick={() => setAllocQuantities({})}
                >
                  Clear quantities
                </Button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 min-h-[200px] max-h-[55vh] border rounded-md p-3 bg-muted/20">
              {!selectedLocationId ? (
                <p className="text-sm text-muted-foreground text-center py-8">Select a sub-warehouse to list inventory.</p>
              ) : loadingBrands ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading brands…
                </div>
              ) : allocBrandsFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {mainBrands.length === 0 ? 'No brands in inventory.' : 'No brands or SKUs match your search.'}
                </p>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {allocBrandsFiltered.map((brand) => {
                    const typeGroups = getVariantTypeGroupsForBrand(brand, allocFilter);
                    const brandQty = brand.allVariants.reduce((sum, v) => sum + (allocQuantities[v.id] ?? 0), 0);
                    return (
                      <AccordionItem key={brand.id} value={brand.id} className="border-b-0">
                        <AccordionTrigger className="py-3 hover:no-underline rounded-md px-2 -mx-2 hover:bg-muted/60">
                          <span className="flex items-center gap-2 min-w-0 text-left">
                            <span className="font-medium truncate">{brand.name}</span>
                            {brandQty > 0 && (
                              <Badge variant="secondary" className="shrink-0">
                                {brandQty} allocated
                              </Badge>
                            )}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pb-4 pt-0">
                          {typeGroups.map(([type, list]) => (
                            <div key={type}>
                              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                {normalizeTypeLabel(type)}
                              </h4>
                              <div className="space-y-2 rounded-lg border bg-background p-3">
                                {list.map((v) => {
                                  const available = getAllocatableQty(v);
                                  return (
                                    <div key={v.id} className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm font-medium truncate" title={v.name}>
                                          {v.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">Available: {available}</div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <Label htmlFor={`alloc-${v.id}`} className="text-xs text-muted-foreground whitespace-nowrap">
                                          Qty
                                        </Label>
                                        <Input
                                          id={`alloc-${v.id}`}
                                          type="number"
                                          min={0}
                                          className="w-24 h-9"
                                          value={allocQuantities[v.id] ?? 0}
                                          onChange={(e) =>
                                            setAllocQuantities((q) => ({
                                              ...q,
                                              [v.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                                            }))
                                          }
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t pt-4 mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground order-2 sm:order-1">
              {selectedLocationId && allocSummary.lineCount > 0 ? (
                <span>
                  <span className="font-medium text-foreground">{allocSummary.lineCount}</span> SKU
                  {allocSummary.lineCount !== 1 ? 's' : ''} · total qty{' '}
                  <span className="font-medium text-foreground">{allocSummary.totalQty}</span>
                </span>
              ) : selectedLocationId ? (
                <span>Enter quantities above to allocate.</span>
              ) : null}
            </div>
            <div className="flex gap-2 order-1 sm:order-2 sm:ml-auto">
              <Button variant="outline" onClick={() => setAllocOpen(false)} disabled={allocating}>
                Cancel
              </Button>
              <Button
                onClick={() => void allocateToLocation()}
                disabled={allocating || !selectedLocationId || allocSummary.lineCount === 0}
              >
                {allocating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Allocating…
                  </>
                ) : (
                  'Allocate'
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog> */}

      <SubWarehouseReturnStockDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        isMainWarehouseUser={isMainWarehouseUser}
        myLocationId={myLocationId || null}
        locations={locations}
        onSuccess={onRefresh}
      />
    </div>
  );
}

