import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, Plus, RefreshCw, Send, Undo2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
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
import { useInventory, type Brand, type Variant } from './InventoryContext';

type LocationRow = {
  id: string;
  name: string;
  is_main: boolean;
  created_at: string | null;
};

type LocationUserRow = {
  location_id: string;
  user_id: string;
  profile?: { full_name: string | null; email: string | null } | null;
};

type LocationInventoryRow = {
  variant_id: string;
  stock: number;
  variant?: { name: string; variant_type: string; brand?: { name: string } | null } | null;
};

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
  const { toast } = useToast();
  const { brands, loading: loadingBrands, refreshInventory } = useInventory();

  const [createOpen, setCreateOpen] = useState(false);
  const [allocOpen, setAllocOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [returning, setReturning] = useState(false);

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

  const [returnLocationId, setReturnLocationId] = useState('');
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});

  const isWarehouse = user?.role === 'warehouse';

  const { data: myLocation } = useQuery({
    queryKey: ['my-warehouse-location', user?.id],
    enabled: !!user?.id && isWarehouse,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_location_users')
        .select('location_id, warehouse_locations!inner ( id, name, is_main )')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as
        | null
        | {
            location_id: string;
            warehouse_locations: { id: string; name: string; is_main: boolean };
          };
    },
  });

  const isMainWarehouseUser = !!myLocation?.warehouse_locations?.is_main;

  const { data: locations = [], isLoading: loadingLocations } = useQuery({
    queryKey: ['warehouse-locations', user?.company_id],
    enabled: !!user?.company_id && isWarehouse,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_locations')
        .select('id,name,is_main,created_at')
        .eq('company_id', user!.company_id)
        .order('is_main', { ascending: false })
        .order('name');
      if (error) throw error;
      return (data || []) as LocationRow[];
    },
  });

  const { data: locationUsers = [] } = useQuery({
    queryKey: ['warehouse-location-users', user?.company_id],
    enabled: !!user?.company_id && isWarehouse,
    queryFn: async () => {
      // Two-step to avoid nested RLS/embeds being flaky.
      const { data: wlu, error: wluErr } = await supabase
        .from('warehouse_location_users')
        .select('location_id,user_id')
        .order('created_at', { ascending: true });
      if (wluErr) throw wluErr;

      const userIds = Array.from(new Set((wlu || []).map((r: any) => r.user_id).filter(Boolean)));
      if (userIds.length === 0) return [] as LocationUserRow[];

      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id,full_name,email')
        .in('id', userIds);
      if (pErr) throw pErr;

      const map = new Map<string, { full_name: string | null; email: string | null }>();
      (profs || []).forEach((p: any) => map.set(p.id, { full_name: p.full_name ?? null, email: p.email ?? null }));

      return (wlu || []).map((r: any) => ({
        location_id: r.location_id,
        user_id: r.user_id,
        profile: map.get(r.user_id) ?? null,
      })) as LocationUserRow[];
    },
  });

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

  const { data: returnInventory = [], isLoading: loadingReturnInventory } = useQuery({
    queryKey: ['warehouse-location-inventory', returnLocationId],
    enabled: !!returnLocationId && isWarehouse,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouse_location_inventory')
        .select('variant_id,stock,variants:variant_id ( name, variant_type, brands:brand_id ( name ) )')
        .eq('location_id', returnLocationId)
        .order('variant_id');
      if (error) throw error;
      return (data || []) as any as LocationInventoryRow[];
    },
  });

  const onRefresh = async () => {
    await qc.invalidateQueries({ queryKey: ['warehouse-locations'] });
    await qc.invalidateQueries({ queryKey: ['warehouse-location-users'] });
    await refreshInventory();
  };

  const createSubWarehouse = async () => {
    if (!user?.company_id) return;
    if (!createForm.location_name.trim() || !createForm.full_name.trim() || !createForm.email.trim() || !createForm.password) {
      toast({ title: 'Missing fields', description: 'Fill out location name, user name, email, and password.', variant: 'destructive' });
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      toast({ title: 'Config error', description: 'Supabase URL missing', variant: 'destructive' });
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      toast({ title: 'Auth', description: 'Not authenticated', variant: 'destructive' });
      return;
    }

    try {
      setCreating(true);
      const res = await fetch(`${supabaseUrl}/functions/v1/create-sub-warehouse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({
          company_id: user.company_id,
          location_name: createForm.location_name.trim(),
          full_name: createForm.full_name.trim(),
          email: createForm.email.trim(),
          password: createForm.password,
          phone: createForm.phone.trim() || null,
        }),
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to create sub-warehouse');
      }

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
      const available = v.stock - (v.allocatedStock || 0);
      if (it.quantity > available) {
        toast({
          title: 'Insufficient stock',
          description: `${v.name} available is ${available}.`,
          variant: 'destructive',
        });
        return;
      }
    }

    try {
      setAllocating(true);
      const { data, error } = await supabase.rpc('allocate_stock_to_sub_warehouse', {
        p_location_id: selectedLocationId,
        p_items: items,
        p_notes: 'Allocated to sub-warehouse',
      });
      if (error) throw error;
      if (data && (data as any).success === false) throw new Error((data as any).error || 'Allocation failed');

      toast({ title: 'Success', description: 'Stock allocated to sub-warehouse.' });
      setAllocOpen(false);
      setSelectedLocationId('');
      setAllocQuantities({});
      setAllocFilter('');
      // Keep both the main inventory and the sub-warehouse dashboard in sync.
      await onRefresh();
      await qc.invalidateQueries({
        queryKey: ['warehouse-location-inventory-brands', user?.company_id, selectedLocationId],
      });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to allocate stock', variant: 'destructive' });
    } finally {
      setAllocating(false);
    }
  };

  const returnFromLocation = async () => {
    if (!returnLocationId) return;
    const items = Object.entries(returnQuantities)
      .map(([variant_id, quantity]) => ({ variant_id, quantity }))
      .filter((x) => (x.quantity ?? 0) > 0);

    if (items.length === 0) {
      toast({ title: 'Nothing to return', description: 'Enter a quantity for at least one SKU.', variant: 'destructive' });
      return;
    }

    try {
      setReturning(true);
      const { data, error } = await supabase.rpc('return_stock_from_sub_warehouse_to_main', {
        p_location_id: returnLocationId,
        p_items: items,
        p_notes: 'Returned from sub-warehouse',
      });
      if (error) throw error;
      if (data && (data as any).success === false) throw new Error((data as any).error || 'Return failed');

      toast({ title: 'Success', description: 'Stock returned to main warehouse.' });
      setReturnOpen(false);
      setReturnLocationId('');
      setReturnQuantities({});
      // Refresh shared inventory caches, including the dashboard sub-warehouse view.
      await onRefresh();
      await qc.invalidateQueries({
        queryKey: ['warehouse-location-inventory-brands', user?.company_id, returnLocationId],
      });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Failed to return stock', variant: 'destructive' });
    } finally {
      setReturning(false);
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
          <Button variant="outline" onClick={() => void onRefresh()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {isMainWarehouseUser ? (
            <>
              <Button variant="outline" onClick={() => setReturnOpen(true)}>
                <Undo2 className="mr-2 h-4 w-4" />
                Return stock
              </Button>
              <Button variant="outline" onClick={() => setAllocOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                Allocate stock
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create sub-warehouse
              </Button>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              You’re logged in as a <span className="font-medium text-foreground">sub-warehouse</span>. Only the{' '}
              <span className="font-medium text-foreground">Main Warehouse</span> account can create/allocate sub-warehouses.
            </div>
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
              <Input id="sw-name" value={createForm.location_name} onChange={(e) => setCreateForm((f) => ({ ...f, location_name: e.target.value }))} placeholder="e.g. Sub Warehouse - North" />
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
            <Button onClick={() => void createSubWarehouse()} disabled={creating}>
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
      <Dialog
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
                                  const available = v.stock - (v.allocatedStock || 0);
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
      </Dialog>

      {/* Return stock */}
      <Dialog
        open={returnOpen}
        onOpenChange={(open) => {
          setReturnOpen(open);
          if (!open) {
            setReturnLocationId('');
            setReturnQuantities({});
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0">
          <DialogHeader>
            <DialogTitle>Return stock from sub-warehouse</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 flex-1 min-h-0 flex flex-col">
            <div className="space-y-2 shrink-0">
              <Label>Sub-warehouse</Label>
              <Select value={returnLocationId || undefined} onValueChange={setReturnLocationId}>
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

            <div className="overflow-y-auto flex-1 min-h-[200px] max-h-[55vh] space-y-3 pr-1 border rounded-md p-3 bg-muted/20">
              {!returnLocationId ? (
                <p className="text-sm text-muted-foreground text-center py-8">Select a sub-warehouse to list its inventory.</p>
              ) : loadingReturnInventory ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading inventory…
                </div>
              ) : returnInventory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No stock in this sub-warehouse.</p>
              ) : (
                <div className="space-y-2 rounded-lg border bg-background p-3">
                  {returnInventory.map((row) => {
                    const name = row.variant?.name || row.variant_id;
                    return (
                      <div key={row.variant_id} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate" title={name}>
                            {name}
                          </div>
                          <div className="text-xs text-muted-foreground">In sub-warehouse: {row.stock}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Label htmlFor={`ret-${row.variant_id}`} className="text-xs text-muted-foreground whitespace-nowrap">
                            Qty
                          </Label>
                          <Input
                            id={`ret-${row.variant_id}`}
                            type="number"
                            min={0}
                            className="w-24 h-9"
                            value={returnQuantities[row.variant_id] ?? 0}
                            onChange={(e) =>
                              setReturnQuantities((q) => ({
                                ...q,
                                [row.variant_id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                              }))
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t pt-4 mt-2">
            <Button variant="outline" onClick={() => setReturnOpen(false)} disabled={returning}>
              Cancel
            </Button>
            <Button onClick={() => void returnFromLocation()} disabled={returning || !returnLocationId}>
              {returning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Returning…
                </>
              ) : (
                'Return'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

