import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Package, Search, Edit, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Profile, Company, WarehouseCompanyAssignment } from '@/types/database.types';
import { useAuth } from '@/features/auth';

const SYSTEM_ADMIN_COMPANY_ID = '6a3da573-af53-4def-a665-0f1782c70097';

interface WarehouseWithAssignments extends Profile {
  assignments?: WarehouseCompanyAssignment[];
  assignedClientCompanies?: Company[];
  /** New blank company row used for this warehouse's main inventory */
  inventoryCompany?: Company | null;
}

export function WarehouseAccountsTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [warehouses, setWarehouses] = useState<WarehouseWithAssignments[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [newWarehouse, setNewWarehouse] = useState({
    company_name: '',
    company_email: '',
    full_name: '',
    email: '',
    phone: '',
    password: '',
    client_company_ids: [] as string[],
  });

  const [editWarehouse, setEditWarehouse] = useState({
    id: '',
    inventory_company_name: '',
    full_name: '',
    email: '',
    phone: '',
    client_company_ids: [] as string[],
  });

  useEffect(() => {
    fetchWarehouses();
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('status', 'active')
        .neq('id', SYSTEM_ADMIN_COMPANY_ID)
        .order('company_name');
      if (error) throw error;
      setCompanies(data || []);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    }
  };

  const fetchWarehouses = async () => {
    try {
      setIsLoading(true);
      const { data: whData, error: whErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'warehouse')
        .order('created_at', { ascending: false });
      if (whErr) throw whErr;

      if (!whData?.length) {
        setWarehouses([]);
        return;
      }

      const ids = whData.map((w) => w.id);
      const { data: assignData, error: aErr } = await supabase
        .from('warehouse_company_assignments')
        .select('*')
        .in('warehouse_user_id', ids);
      if (aErr) throw aErr;

      const clientIds = [...new Set((assignData || []).map((a) => a.client_company_id))];
      const invIds = [...new Set(whData.map((w) => w.company_id).filter(Boolean))] as string[];
      const { data: clientCompanies } = await supabase.from('companies').select('*').in('id', clientIds);
      const { data: invCompanies } =
        invIds.length > 0
          ? await supabase.from('companies').select('*').in('id', invIds)
          : { data: [] as Company[] };
      const companyMap = new Map((clientCompanies || []).map((c) => [c.id, c]));
      const invMap = new Map((invCompanies || []).map((c) => [c.id, c]));

      const merged: WarehouseWithAssignments[] = whData.map((w) => {
        const assigns = (assignData || []).filter((a) => a.warehouse_user_id === w.id);
        const clientCos = assigns
          .map((a) => companyMap.get(a.client_company_id))
          .filter(Boolean) as Company[];
        return {
          ...w,
          assignments: assigns as WarehouseCompanyAssignment[],
          assignedClientCompanies: clientCos,
          inventoryCompany: w.company_id ? invMap.get(w.company_id) ?? null : null,
        };
      });

      setWarehouses(merged);
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error loading warehouses', description: e.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newWarehouse.company_name.trim() || !newWarehouse.company_email.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing fields',
        description: 'Warehouse company name and company email are required',
      });
      return;
    }
    if (!newWarehouse.full_name || !newWarehouse.email || !newWarehouse.password) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'User name, email, and password are required' });
      return;
    }
    if (newWarehouse.client_company_ids.length === 0) {
      toast({ variant: 'destructive', title: 'Clients required', description: 'Select at least one client company' });
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      toast({ variant: 'destructive', title: 'Config error', description: 'Supabase URL missing' });
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      toast({ variant: 'destructive', title: 'Auth', description: 'Not authenticated' });
      return;
    }

    try {
      setIsCreating(true);
      const res = await fetch(`${supabaseUrl}/functions/v1/create-warehouse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
        },
        body: JSON.stringify({
          company_name: newWarehouse.company_name.trim(),
          company_email: newWarehouse.company_email.trim(),
          full_name: newWarehouse.full_name,
          email: newWarehouse.email,
          password: newWarehouse.password,
          phone: newWarehouse.phone || null,
          client_company_ids: newWarehouse.client_company_ids,
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to create warehouse account');
      }
      toast({
        title: 'Success',
        description: 'Warehouse company and login created. Sign in as the warehouse user to add brands, variants, and main inventory.',
      });
      setIsDialogOpen(false);
      setNewWarehouse({
        company_name: '',
        company_email: '',
        full_name: '',
        email: '',
        phone: '',
        password: '',
        client_company_ids: [],
      });
      setShowPassword(false);
      fetchWarehouses();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsCreating(false);
    }
  };

  const openEdit = (w: WarehouseWithAssignments) => {
    setEditWarehouse({
      id: w.id,
      inventory_company_name: w.inventoryCompany?.company_name || '—',
      full_name: w.full_name,
      email: w.email,
      phone: w.phone || '',
      client_company_ids: w.assignments?.map((a) => a.client_company_id) || [],
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editWarehouse.id || editWarehouse.client_company_ids.length === 0) {
      toast({ variant: 'destructive', title: 'Invalid', description: 'Select at least one client company' });
      return;
    }
    try {
      setIsCreating(true);
      const { error: pErr } = await supabase
        .from('profiles')
        .update({ full_name: editWarehouse.full_name, phone: editWarehouse.phone || null })
        .eq('id', editWarehouse.id);
      if (pErr) throw pErr;

      const { error: dErr } = await supabase
        .from('warehouse_company_assignments')
        .delete()
        .eq('warehouse_user_id', editWarehouse.id);
      if (dErr) throw dErr;

      const rows = editWarehouse.client_company_ids.map((client_company_id) => ({
        warehouse_user_id: editWarehouse.id,
        client_company_id,
        assigned_by: user?.id,
      }));
      const { error: iErr } = await supabase.from('warehouse_company_assignments').insert(rows);
      if (iErr) throw iErr;

      toast({ title: 'Saved', description: 'Warehouse account updated' });
      setEditDialogOpen(false);
      fetchWarehouses();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setIsCreating(false);
    }
  };

  const toggleClient = (companyId: string, isNew: boolean) => {
    if (isNew) {
      setNewWarehouse((prev) => ({
        ...prev,
        client_company_ids: prev.client_company_ids.includes(companyId)
          ? prev.client_company_ids.filter((id) => id !== companyId)
          : [...prev.client_company_ids, companyId],
      }));
    } else {
      setEditWarehouse((prev) => ({
        ...prev,
        client_company_ids: prev.client_company_ids.includes(companyId)
          ? prev.client_company_ids.filter((id) => id !== companyId)
          : [...prev.client_company_ids, companyId],
      }));
    }
  };

  const filtered = warehouses.filter(
    (w) =>
      w.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.inventoryCompany?.company_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.assignedClientCompanies || []).some((c) =>
        c.company_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Loading warehouse accounts…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase mb-2">
            <Package className="h-3 w-3" />
            Client fulfillment
          </div>
          <h2 className="text-3xl font-black tracking-tight">
            WAREHOUSE <span className="text-primary italic">ACCOUNTS</span>
          </h2>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Each account creates a <strong>new warehouse company</strong> (blank inventory) plus a warehouse login, like adding a company and an
            executive. The user signs in and fills <strong>Main inventory</strong> (and catalog) for that company, then fulfills internal POs for the
            client companies you assign.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Add warehouse account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create warehouse company &amp; account</DialogTitle>
              <DialogDescription>
                Creates a new tenant for central stock (starts empty), a warehouse user who will load inventory, and links to client companies for
                internal transfers.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground pt-1">
                <Building2 className="h-4 w-4" />
                Warehouse company (inventory tenant)
              </div>
              <div className="space-y-2">
                <Label>Company name *</Label>
                <Input
                  placeholder="e.g. B1G Central Warehouse"
                  value={newWarehouse.company_name}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, company_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Company email *</Label>
                <Input
                  type="email"
                  placeholder="contact@warehouse.com"
                  value={newWarehouse.company_email}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, company_email: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-t pt-4">
                <Package className="h-4 w-4" />
                Warehouse user (login)
              </div>
              <div className="space-y-2">
                <Label>Full name *</Label>
                <Input
                  value={newWarehouse.full_name}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={newWarehouse.email}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={newWarehouse.phone}
                  onChange={(e) => setNewWarehouse({ ...newWarehouse, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={newWarehouse.password}
                    onChange={(e) => setNewWarehouse({ ...newWarehouse, password: e.target.value })}
                  />
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? 'Hide' : 'Show'} password
                </Button>
              </div>
              <div className="space-y-2 border-t pt-4">
                <Label>Client companies *</Label>
                <p className="text-xs text-muted-foreground mb-1">
                  Companies that can raise internal POs this warehouse will approve (same idea as executive company access).
                </p>
                <ScrollArea className="h-48 border rounded-md p-2">
                  {companies.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 py-2 px-1 cursor-pointer hover:bg-muted/50 rounded"
                      onClick={() => toggleClient(c.id, true)}
                    >
                      <Checkbox checked={newWarehouse.client_company_ids.includes(c.id)} />
                      <span className="text-sm">{c.company_name}</span>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No warehouse accounts yet.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((w) => (
            <Card key={w.id} className="border-2">
              <CardContent className="pt-6 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold">{w.full_name}</h3>
                    <p className="text-sm text-muted-foreground">{w.email}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openEdit(w)}>
                    <Edit className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                </div>
                <div className="text-sm border-t pt-2">
                  <span className="text-muted-foreground">Inventory company: </span>
                  <span className="font-medium">{w.inventoryCompany?.company_name || '—'}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(w.assignedClientCompanies || []).slice(0, 6).map((c) => (
                    <Badge key={c.id} variant="secondary" className="text-xs">
                      {c.company_name}
                    </Badge>
                  ))}
                  {(w.assignedClientCompanies?.length || 0) > 6 && (
                    <Badge variant="outline">+{(w.assignedClientCompanies?.length || 0) - 6}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit warehouse account</DialogTitle>
            <DialogDescription>Update profile details and which client companies this user fulfills.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Warehouse company (read only)</Label>
              <Input value={editWarehouse.inventory_company_name} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input
                value={editWarehouse.full_name}
                onChange={(e) => setEditWarehouse({ ...editWarehouse, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email (read only)</Label>
              <Input value={editWarehouse.email} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                value={editWarehouse.phone}
                onChange={(e) => setEditWarehouse({ ...editWarehouse, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Client companies</Label>
              <ScrollArea className="h-48 border rounded-md p-2">
                {companies.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 py-2 px-1 cursor-pointer hover:bg-muted/50 rounded"
                    onClick={() => toggleClient(c.id, false)}
                  >
                    <Checkbox checked={editWarehouse.client_company_ids.includes(c.id)} />
                    <span className="text-sm">{c.company_name}</span>
                  </div>
                ))}
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isCreating}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
