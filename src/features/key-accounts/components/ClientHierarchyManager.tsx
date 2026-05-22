import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Building2, Store, MapPin, ChevronRight, Loader2, LayoutGrid, Table2 } from 'lucide-react';
import {
  AnalyticsTablePagination,
  paginateAnalyticsRows,
} from '@/features/key-accounts/key-accounts-analytics/AnalyticsTablePagination';
import { useToast } from '@/hooks/use-toast';
import type { KeyAccountClient, KeyAccountShop, KeyAccountDeliveryAddress } from '@/types/database.types';
import {
  generateKeyAccountClientCode,
  generateKeyAccountShopCode,
  KEY_ACCOUNT_CLIENT_CATEGORIES,
} from '@/features/key-accounts/keyAccountCodes';
import { KeyAccountShopCorView } from '@/features/key-accounts/components/KeyAccountShopCorView';

type HierarchyViewMode = 'card' | 'table';

function HierarchyViewToolbar({
  viewMode,
  onViewModeChange,
}: {
  viewMode: HierarchyViewMode;
  onViewModeChange: (mode: HierarchyViewMode) => void;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs text-muted-foreground">View</span>
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(v) => {
          if (v === 'card' || v === 'table') onViewModeChange(v);
        }}
        className="border rounded-md p-0.5 bg-muted/30"
      >
        <ToggleGroupItem value="card" aria-label="Card view" className="px-2.5 data-[state=on]:bg-background">
          <LayoutGrid className="h-4 w-4" />
        </ToggleGroupItem>
        <ToggleGroupItem value="table" aria-label="Table view" className="px-2.5 data-[state=on]:bg-background">
          <Table2 className="h-4 w-4" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}

export function ClientHierarchyManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isKeyAccountManager = user?.role === 'key_account_manager';
  const canCreateClients =
    user?.role === 'sales_admin' ||
    user?.role === 'sales_head' ||
    user?.role === 'sales_director';
  const [clients, setClients] = useState<KeyAccountClient[]>([]);
  const [shops, setShops] = useState<KeyAccountShop[]>([]);
  const [addresses, setAddresses] = useState<KeyAccountDeliveryAddress[]>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('clients');
  const [viewMode, setViewMode] = useState<HierarchyViewMode>('card');
  const [clientsPage, setClientsPage] = useState(1);
  const [shopsPage, setShopsPage] = useState(1);
  const [addressesPage, setAddressesPage] = useState(1);

  // Dialog states
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [shopDialogOpen, setShopDialogOpen] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);

  const [creatingClient, setCreatingClient] = useState(false);
  const [creatingShop, setCreatingShop] = useState(false);

  const [newClient, setNewClient] = useState({
    client_name: '',
    client_category: '' as string,
    contact_person: '',
    contact_email: '',
    contact_phone: '',
    payment_terms: '',
    notes: ''
  });

  const [newShop, setNewShop] = useState({
    shop_name: '',
    city: '',
    region: '',
    province: '',
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    notes: ''
  });

  const [corPdfFile, setCorPdfFile] = useState<File | null>(null);

  const [newAddress, setNewAddress] = useState({
    address_label: '',
    full_address: '',
    city: '',
    region: '',
    province: '',
    zip_code: '',
    contact_name: '',
    contact_phone: '',
    delivery_instructions: '',
    is_default: false
  });

  // Fetch data
  useEffect(() => {
    fetchClients();
  }, [user?.company_id, user?.id, user?.role]);

  useEffect(() => {
    if (selectedClient) {
      fetchShops(selectedClient);
    }
  }, [selectedClient]);

  useEffect(() => {
    if (selectedShop) {
      fetchAddresses(selectedShop);
    }
  }, [selectedShop]);

  useEffect(() => {
    if (!shopDialogOpen) setCorPdfFile(null);
  }, [shopDialogOpen]);

  useEffect(() => {
    setClientsPage(1);
  }, [clients.length]);

  useEffect(() => {
    setShopsPage(1);
  }, [shops.length, selectedClient]);

  useEffect(() => {
    setAddressesPage(1);
  }, [addresses.length, selectedShop]);

  const paginatedClients = useMemo(
    () => paginateAnalyticsRows(clients, clientsPage),
    [clients, clientsPage]
  );
  const paginatedShops = useMemo(
    () => paginateAnalyticsRows(shops, shopsPage),
    [shops, shopsPage]
  );
  const paginatedAddresses = useMemo(
    () => paginateAnalyticsRows(addresses, addressesPage),
    [addresses, addressesPage]
  );

  const selectClient = (clientId: string) => {
    setSelectedClient(clientId);
    setSelectedShop(null);
    setActiveTab('shops');
  };

  const selectShop = (shopId: string) => {
    setSelectedShop(shopId);
    setActiveTab('addresses');
  };

  const fetchClients = async () => {
    setLoading(true);
    try {
      if (!user?.company_id) {
        setClients([]);
        setShops([]);
        setAddresses([]);
        setSelectedClient(null);
        setSelectedShop(null);
        return;
      }

      let query = supabase
        .from('key_account_clients')
        .select('*')
        .eq('company_id', user.company_id)
        .eq('status', 'active')
        .order('client_name');

      if (isKeyAccountManager) {
        const { data: assignments, error: assignmentsError } = await supabase
          .from('kam_client_assignments')
          .select('client_id')
          .eq('company_id', user.company_id)
          .eq('kam_id', user.id);

        if (assignmentsError) throw assignmentsError;

        const assignedClientIds = assignments?.map((assignment) => assignment.client_id) || [];

        if (assignedClientIds.length === 0) {
          setClients([]);
          setShops([]);
          setAddresses([]);
          setSelectedClient(null);
          setSelectedShop(null);
          return;
        }

        query = query.in('id', assignedClientIds);
      }

      const { data, error } = await query;

      if (error) throw error;

      const nextClients = data || [];
      setClients(nextClients);
      setSelectedClient((currentClientId) => {
        if (currentClientId && !nextClients.some((client) => client.id === currentClientId)) {
          setShops([]);
          setAddresses([]);
          setSelectedShop(null);
          return null;
        }

        return currentClientId;
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const fetchShops = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('key_account_shops')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .order('shop_name');

      if (error) throw error;
      setShops(data || []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  const fetchAddresses = async (shopId: string) => {
    try {
      const { data, error } = await supabase
        .from('key_account_delivery_addresses')
        .select('*')
        .eq('shop_id', shopId)
        .eq('is_active', true)
        .order('is_default', { ascending: false });

      if (error) throw error;
      setAddresses(data || []);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  // Create handlers
  const handleCreateClient = async () => {
    if (!user?.company_id || !newClient.client_name.trim() || !newClient.client_category) return;
    setCreatingClient(true);
    try {
      const clientCode = await generateKeyAccountClientCode(user.company_id);
      const { error } = await supabase
        .from('key_account_clients')
        .insert({
          client_name: newClient.client_name.trim(),
          client_category: newClient.client_category,
          client_code: clientCode,
          company_id: user.company_id,
          created_by: user.id,
          industry: null,
          credit_limit: 0,
          contact_person: newClient.contact_person.trim() || null,
          contact_email: newClient.contact_email.trim() || null,
          contact_phone: newClient.contact_phone.trim() || null,
          payment_terms: newClient.payment_terms.trim() || null,
          notes: newClient.notes.trim() || null,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Client created with code ${clientCode}`,
      });
      setClientDialogOpen(false);
      setNewClient({
        client_name: '',
        client_category: '',
        contact_person: '',
        contact_email: '',
        contact_phone: '',
        payment_terms: '',
        notes: '',
      });
      fetchClients();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setCreatingClient(false);
    }
  };

  const handleCreateShop = async () => {
    if (!selectedClient || !newShop.shop_name.trim() || !user?.company_id || !user?.id) return;

    setCreatingShop(true);
    try {
      const shopCode = await generateKeyAccountShopCode(selectedClient);
      const { data: shopRow, error } = await supabase
        .from('key_account_shops')
        .insert({
          shop_name: newShop.shop_name.trim(),
          shop_code: shopCode,
          client_id: selectedClient,
          city: newShop.city.trim() || null,
          region: newShop.region.trim() || null,
          province: newShop.province.trim() || null,
          contact_person: newShop.contact_person.trim() || null,
          contact_phone: newShop.contact_phone.trim() || null,
          contact_email: newShop.contact_email.trim() || null,
          operating_hours: null,
          notes: newShop.notes.trim() || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      if (corPdfFile) {
        if (corPdfFile.size > 15 * 1024 * 1024) {
          throw new Error('COR PDF must be 15MB or smaller');
        }
        if (corPdfFile.type !== 'application/pdf') {
          throw new Error('COR must be a PDF file');
        }
        const timestamp = Date.now();
        const path = `${user.id}/company_${user.company_id}_client_${selectedClient}_shop_${shopRow.id}_cor_${timestamp}.pdf`;
        const { error: upErr } = await supabase.storage.from('ka-shop-cor').upload(path, corPdfFile, {
          contentType: 'application/pdf',
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);
        const { error: corErr } = await supabase
          .from('key_account_shops')
          .update({ cor_pdf_path: path })
          .eq('id', shopRow.id);
        if (corErr) throw corErr;
      }

      toast({
        title: 'Success',
        description: `Shop created with code ${shopCode}`,
      });
      setShopDialogOpen(false);
      setCorPdfFile(null);
      setNewShop({
        shop_name: '',
        city: '',
        region: '',
        province: '',
        contact_person: '',
        contact_phone: '',
        contact_email: '',
        notes: '',
      });
      fetchShops(selectedClient);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setCreatingShop(false);
    }
  };

  const handleCreateAddress = async () => {
    if (!selectedShop) return;
    
    try {
      const { error } = await supabase
        .from('key_account_delivery_addresses')
        .insert({
          address_label: newAddress.address_label.trim(),
          full_address: newAddress.full_address.trim(),
          city: newAddress.city.trim() || null,
          region: newAddress.region.trim() || null,
          province: newAddress.province.trim() || null,
          zip_code: newAddress.zip_code.trim() || null,
          contact_name: newAddress.contact_name.trim() || null,
          contact_phone: newAddress.contact_phone.trim() || null,
          delivery_instructions: newAddress.delivery_instructions.trim() || null,
          receiving_hours: null,
          is_default: newAddress.is_default,
          shop_id: selectedShop
        });

      if (error) throw error;

      toast({ title: 'Success', description: 'Delivery address created successfully' });
      setAddressDialogOpen(false);
      setNewAddress({
        address_label: '', full_address: '', city: '', region: '', province: '',
        zip_code: '', contact_name: '', contact_phone: '', delivery_instructions: '',
        is_default: false
      });
      fetchAddresses(selectedShop);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {isKeyAccountManager ? 'My Key Account Clients' : 'Key Account Client Management'}
        </h2>
        {canCreateClients && (
          <Button onClick={() => setClientDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Client
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Clients ({clients.length})
          </TabsTrigger>
          <TabsTrigger value="shops" className="flex items-center gap-2" disabled={!selectedClient}>
            <Store className="h-4 w-4" />
            Shops ({shops.length})
          </TabsTrigger>
          <TabsTrigger value="addresses" className="flex items-center gap-2" disabled={!selectedShop}>
            <MapPin className="h-4 w-4" />
            Addresses ({addresses.length})
          </TabsTrigger>
        </TabsList>

        {/* Clients Tab */}
        <TabsContent value="clients" className="space-y-4">
        <div className="flex items-center justify-end">

              <HierarchyViewToolbar viewMode={viewMode} onViewModeChange={setViewMode} />

            
          </div>
          {clients.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                {isKeyAccountManager
                  ? 'No clients are currently assigned to you.'
                  : 'No clients yet. Click "Add Client" to create your first Key Account client.'}
              </CardContent>
            </Card>
          ) : (
            <>
              {viewMode === 'card' ? (
                <div className="space-y-3">
                  {paginatedClients.map((client) => (
                    <Card
                      key={client.id}
                      className={`cursor-pointer transition-colors ${selectedClient === client.id ? 'border-primary' : ''}`}
                      onClick={() => selectClient(client.id)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <CardTitle className="text-base">{client.client_name}</CardTitle>
                              <p className="text-sm text-muted-foreground">{client.client_code}</p>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Category:</span>
                            <p>{client.client_category || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Contact:</span>
                            <p>{client.contact_person || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Email:</span>
                            <p>{client.contact_email || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Phone:</span>
                            <p>{client.contact_phone || 'N/A'}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedClients.map((client) => (
                        <TableRow
                          key={client.id}
                          className={`cursor-pointer ${selectedClient === client.id ? 'bg-muted/60' : ''}`}
                          onClick={() => selectClient(client.id)}
                        >
                          <TableCell className="font-medium">{client.client_name}</TableCell>
                          <TableCell className="text-muted-foreground">{client.client_code}</TableCell>
                          <TableCell>{client.client_category || '—'}</TableCell>
                          <TableCell>{client.contact_person || '—'}</TableCell>
                          <TableCell>{client.contact_email || '—'}</TableCell>
                          <TableCell>{client.contact_phone || '—'}</TableCell>
                          <TableCell>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <AnalyticsTablePagination
                page={clientsPage}
                onPageChange={setClientsPage}
                totalRows={clients.length}
              />
            </>
          )}
        </TabsContent>

        {/* Shops Tab */}
        <TabsContent value="shops" className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-md text-muted-foreground">
                Client: {clients.find(c => c.id === selectedClient)?.client_name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <HierarchyViewToolbar viewMode={viewMode} onViewModeChange={setViewMode} />
              <Button onClick={() => setShopDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Shop
              </Button>
            </div>
          </div>

          {shops.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No shops for this client yet. Click "Add Shop" to create one.
              </CardContent>
            </Card>
          ) : (
            <>
              {viewMode === 'card' ? (
                <div className="space-y-3">
                  {paginatedShops.map((shop) => (
                    <Card
                      key={shop.id}
                      className={`cursor-pointer transition-colors ${selectedShop === shop.id ? 'border-primary' : ''}`}
                      onClick={() => selectShop(shop.id)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Store className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <CardTitle className="text-base">{shop.shop_name}</CardTitle>
                              <p className="text-sm text-muted-foreground">{shop.shop_code}</p>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Location:</span>
                            <p>{[shop.city, shop.province].filter(Boolean).join(', ') || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Region:</span>
                            <p>{shop.region || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Contact:</span>
                            <p>{shop.contact_person || 'N/A'}</p>
                          </div>
                          <div className="flex flex-col gap-1.5 sm:col-span-2">
                            <span className="text-muted-foreground">COR (Certificate of Registration):</span>
                            <KeyAccountShopCorView corPdfPath={shop.cor_pdf_path} stopPropagation />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Shop</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Region</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>COR</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedShops.map((shop) => (
                        <TableRow
                          key={shop.id}
                          className={`cursor-pointer ${selectedShop === shop.id ? 'bg-muted/60' : ''}`}
                          onClick={() => selectShop(shop.id)}
                        >
                          <TableCell className="font-medium">{shop.shop_name}</TableCell>
                          <TableCell className="text-muted-foreground">{shop.shop_code}</TableCell>
                          <TableCell>
                            {[shop.city, shop.province].filter(Boolean).join(', ') || '—'}
                          </TableCell>
                          <TableCell>{shop.region || '—'}</TableCell>
                          <TableCell>{shop.contact_person || '—'}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <KeyAccountShopCorView corPdfPath={shop.cor_pdf_path} stopPropagation />
                          </TableCell>
                          <TableCell>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <AnalyticsTablePagination
                page={shopsPage}
                onPageChange={setShopsPage}
                totalRows={shops.length}
              />
            </>
          )}
        </TabsContent>

        {/* Addresses Tab */}
        <TabsContent value="addresses" className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-md text-muted-foreground">
                Shop: {shops.find(s => s.id === selectedShop)?.shop_name}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <HierarchyViewToolbar viewMode={viewMode} onViewModeChange={setViewMode} />
              <Button onClick={() => setAddressDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Address
              </Button>
            </div>
          </div>

          {addresses.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No delivery addresses for this shop yet. Click "Add Address" to create one.
              </CardContent>
            </Card>
          ) : (
            <>
              {viewMode === 'card' ? (
                <div className="space-y-3">
                  {paginatedAddresses.map((address) => (
                    <Card key={address.id}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <MapPin className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                                {address.address_label}
                                {address.is_default ? (
                                  <Badge variant="secondary" className="text-xs font-normal">
                                    Default
                                  </Badge>
                                ) : null}
                              </CardTitle>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2 text-sm">
                          <p>
                            <span className="text-muted-foreground">Address:</span> {address.full_address}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Location:</span>{' '}
                            {[address.city, address.province, address.zip_code].filter(Boolean).join(', ') || 'N/A'}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Contact:</span>{' '}
                            {address.contact_name || 'N/A'}
                            {address.contact_phone ? ` (${address.contact_phone})` : ''}
                          </p>
                          {address.delivery_instructions ? (
                            <p>
                              <span className="text-muted-foreground">Instructions:</span>{' '}
                              {address.delivery_instructions}
                            </p>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Instructions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedAddresses.map((address) => (
                        <TableRow key={address.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            <span className="inline-flex items-center gap-2">
                              {address.address_label}
                              {address.is_default ? (
                                <Badge variant="secondary" className="text-xs font-normal">
                                  Default
                                </Badge>
                              ) : null}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[200px]">{address.full_address}</TableCell>
                          <TableCell>
                            {[address.city, address.province, address.zip_code].filter(Boolean).join(', ') || '—'}
                          </TableCell>
                          <TableCell>{address.contact_name || '—'}</TableCell>
                          <TableCell>{address.contact_phone || '—'}</TableCell>
                          <TableCell className="max-w-[180px] truncate">
                            {address.delivery_instructions || '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <AnalyticsTablePagination
                page={addressesPage}
                onPageChange={setAddressesPage}
                totalRows={addresses.length}
              />
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Client Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Client</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p className="text-xs text-muted-foreground">
              A client code (e.g. CL-2026-0001) is assigned automatically when you save.
            </p>
            <div className="space-y-2">
              <Label htmlFor="client_name">Client Name *</Label>
              <Input id="client_name" value={newClient.client_name} onChange={e => setNewClient({...newClient, client_name: e.target.value})} placeholder="SM Supermalls Inc." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client_category">Category *</Label>
              <Select
                value={newClient.client_category || undefined}
                onValueChange={(v) => setNewClient({ ...newClient, client_category: v })}
              >
                <SelectTrigger id="client_category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {KEY_ACCOUNT_CLIENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact_person">Contact Person</Label>
                <Input id="contact_person" value={newClient.contact_person} onChange={e => setNewClient({...newClient, contact_person: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_phone">Contact Phone</Label>
                <Input id="contact_phone" value={newClient.contact_phone} onChange={e => setNewClient({...newClient, contact_phone: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_email">Contact Email</Label>
              <Input id="contact_email" type="email" value={newClient.contact_email} onChange={e => setNewClient({...newClient, contact_email: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_terms">Payment Terms</Label>
              <Input id="payment_terms" value={newClient.payment_terms} onChange={e => setNewClient({...newClient, payment_terms: e.target.value})} placeholder="Net 30, COD, etc." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={newClient.notes} onChange={e => setNewClient({...newClient, notes: e.target.value})} />
            </div>
            <Button
              onClick={handleCreateClient}
              disabled={creatingClient || !newClient.client_name.trim() || !newClient.client_category}
            >
              {creatingClient ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Client
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Shop Dialog */}
      <Dialog open={shopDialogOpen} onOpenChange={setShopDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Shop</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p className="text-xs text-muted-foreground">
              A shop code (e.g. SH-2026-0001) is assigned automatically when you save.
            </p>
            <div className="space-y-2">
              <Label htmlFor="shop_name">Shop Name *</Label>
              <Input id="shop_name" value={newShop.shop_name} onChange={e => setNewShop({...newShop, shop_name: e.target.value})} placeholder="SM City Cebu" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input id="city" value={newShop.city} onChange={e => setNewShop({...newShop, city: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="province">Province</Label>
                <Input id="province" value={newShop.province} onChange={e => setNewShop({...newShop, province: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input id="region" value={newShop.region} onChange={e => setNewShop({...newShop, region: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shop_contact">Contact Person</Label>
                <Input id="shop_contact" value={newShop.contact_person} onChange={e => setNewShop({...newShop, contact_person: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shop_phone">Contact Phone</Label>
                <Input id="shop_phone" value={newShop.contact_phone} onChange={e => setNewShop({...newShop, contact_phone: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="shop_email">Contact Email</Label>
              <Input id="shop_email" type="email" value={newShop.contact_email} onChange={e => setNewShop({...newShop, contact_email: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shop_cor_pdf">COR (Certificate of Registration) — PDF</Label>
              <Input
                id="shop_cor_pdf"
                type="file"
                accept="application/pdf,.pdf"
                className="cursor-pointer"
                onChange={(e) => setCorPdfFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">Optional. Max 15MB.</p>
            </div>
            <Button
              onClick={handleCreateShop}
              disabled={creatingShop || !newShop.shop_name.trim()}
            >
              {creatingShop ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Shop
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Address Dialog */}
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Delivery Address</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="address_label">Address Label *</Label>
              <Input id="address_label" value={newAddress.address_label} onChange={e => setNewAddress({...newAddress, address_label: e.target.value})} placeholder="Main Receiving, Warehouse Dock, etc." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="full_address">Full Address *</Label>
              <Input id="full_address" value={newAddress.full_address} onChange={e => setNewAddress({...newAddress, full_address: e.target.value})} placeholder="123 Main St, Building A, Floor 2" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="addr_city">City</Label>
                <Input id="addr_city" value={newAddress.city} onChange={e => setNewAddress({...newAddress, city: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr_province">Province</Label>
                <Input id="addr_province" value={newAddress.province} onChange={e => setNewAddress({...newAddress, province: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip_code">Zip Code</Label>
                <Input id="zip_code" value={newAddress.zip_code} onChange={e => setNewAddress({...newAddress, zip_code: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="addr_contact">Receiving Contact</Label>
                <Input id="addr_contact" value={newAddress.contact_name} onChange={e => setNewAddress({...newAddress, contact_name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr_phone">Contact Phone</Label>
                <Input id="addr_phone" value={newAddress.contact_phone} onChange={e => setNewAddress({...newAddress, contact_phone: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instructions">Delivery Instructions</Label>
              <Input id="instructions" value={newAddress.delivery_instructions} onChange={e => setNewAddress({...newAddress, delivery_instructions: e.target.value})} placeholder="Use loading dock B, call before arrival" />
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="is_default" 
                checked={newAddress.is_default}
                onChange={e => setNewAddress({...newAddress, is_default: e.target.checked})}
                className="h-4 w-4"
              />
              <Label htmlFor="is_default" className="font-normal">Set as default delivery address</Label>
            </div>
            <Button onClick={handleCreateAddress} disabled={!newAddress.address_label || !newAddress.full_address}>
              Create Address
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
