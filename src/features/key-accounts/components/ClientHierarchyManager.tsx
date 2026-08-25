import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useAppDispatch, useAppSelector } from '@/store/store';
import {
  createKAAddress,
  createKAClient,
  createKAShop,
  fetchKAAddresses,
  fetchKAClients,
  fetchKAShops,
  resetAddresses,
  resetClientHierarchy,
  resetShops,
  updateKAAddress,
  updateKAClient,
  updateKAShop,
} from '@/store/slices/key-accounts/client-hierarchy';
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
import { Plus, Building2, Store, MapPin, ChevronRight, Loader2, LayoutGrid, Table2, Pencil, X, FileUp } from 'lucide-react';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  createInitialTableSortCycle,
  getNextTableSortCycleState,
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import {
  DEFAULT_CLIENT_HIERARCHY_ADDRESS_SORT_DIRECTION,
  DEFAULT_CLIENT_HIERARCHY_ADDRESS_SORT_KEY,
  DEFAULT_CLIENT_HIERARCHY_CLIENT_SORT_DIRECTION,
  DEFAULT_CLIENT_HIERARCHY_CLIENT_SORT_KEY,
  DEFAULT_CLIENT_HIERARCHY_SHOP_SORT_DIRECTION,
  DEFAULT_CLIENT_HIERARCHY_SHOP_SORT_KEY,
  sortClientHierarchyAddresses,
  sortClientHierarchyClients,
  sortClientHierarchyShops,
  type ClientHierarchyAddressSortKey,
  type ClientHierarchyClientSortKey,
  type ClientHierarchyShopSortKey,
} from '@/features/key-accounts/utils/clientHierarchySorting';
import { useToast } from '@/hooks/use-toast';
import type { KeyAccountClient, KeyAccountShop, KeyAccountDeliveryAddress } from '@/types/database.types';
import {
  KEY_ACCOUNT_CLIENT_CATEGORIES,
  parsePaymentTerms,
  formatPaymentTerms,
} from '@/features/key-accounts/keyAccountCodes';
import { KeyAccountShopCorView } from '@/features/key-accounts/components/KeyAccountShopCorView';
import { ClientHierarchyImportDialog } from '@/features/key-accounts/components/ClientHierarchyImportDialog';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';

type HierarchyViewMode = 'card' | 'table';
type HierarchyTab = 'clients' | 'shops' | 'addresses';

function matchesHierarchySearch(
  query: string,
  fields: Array<string | null | undefined>
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return fields.some((field) => (field ?? '').toLowerCase().includes(normalized));
}

function filterRowsByCreatedAt<T extends { created_at: string }>(
  rows: T[],
  range: { start?: Date; end?: Date }
): T[] {
  return rows.filter((row) =>
    isDateInRange(new Date(row.created_at), range.start, range.end)
  );
}

function getHierarchySearchPlaceholder(tab: HierarchyTab): string {
  switch (tab) {
    case 'shops':
      return 'Search shop name, code, city, contact…';
    case 'addresses':
      return 'Search label, address, city, contact…';
    default:
      return 'Search name, code, category, contact…';
  }
}

const EMPTY_CLIENT_FORM = {
  client_name: '',
  client_category: '' as string,
  contact_person: '',
  contact_email: '',
  contact_phone: '',
  payment_terms: [] as string[],
  notes: '',
};

const EMPTY_SHOP_FORM = {
  shop_name: '',
  city: '',
  region: '',
  province: '',
  contact_person: '',
  contact_phone: '',
  contact_email: '',
  operating_hours: '',
  notes: '',
};

const EMPTY_ADDRESS_FORM = {
  address_label: '',
  full_address: '',
  city: '',
  region: '',
  province: '',
  zip_code: '',
  contact_name: '',
  contact_phone: '',
  delivery_instructions: '',
  is_default: false,
};

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
  const dispatch = useAppDispatch();
  const {
    clients,
    shops,
    addresses,
    clientsStatus,
    clientsError,
    shopsError,
    addressesError,
  } = useAppSelector((state) => state.kaClientHierarchy);
  const loading = clientsStatus === 'loading' || clientsStatus === 'idle';
  const isKeyAccountManager = user?.role === 'key_account_manager';
  const canManageClients =
    user?.role === 'sales_admin' ||
    user?.role === 'sales_head' ||
    user?.role === 'sales_director' ||
    user?.role === 'key_account_manager';
  const canCreateClients = canManageClients;
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('clients');
  const [viewMode, setViewMode] = useState<HierarchyViewMode>('card');
  const [clientsPage, setClientsPage] = useState(0);
  const [shopsPage, setShopsPage] = useState(0);
  const [addressesPage, setAddressesPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [clientsSortState, setClientsSortState] = useState<
    TableSortCycleState<ClientHierarchyClientSortKey>
  >(createInitialTableSortCycle);
  const [shopsSortState, setShopsSortState] = useState<
    TableSortCycleState<ClientHierarchyShopSortKey>
  >(createInitialTableSortCycle);
  const [addressesSortState, setAddressesSortState] = useState<
    TableSortCycleState<ClientHierarchyAddressSortKey>
  >(createInitialTableSortCycle);

  // Dialog states
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [shopDialogOpen, setShopDialogOpen] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editingShopId, setEditingShopId] = useState<string | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [editingShopCorPath, setEditingShopCorPath] = useState<string | null>(null);

  const [savingClient, setSavingClient] = useState(false);
  const [savingShop, setSavingShop] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  const [newClient, setNewClient] = useState(EMPTY_CLIENT_FORM);
  const [customPaymentTermInput, setCustomPaymentTermInput] = useState('');

  const [newShop, setNewShop] = useState(EMPTY_SHOP_FORM);

  const [corPdfFile, setCorPdfFile] = useState<File | null>(null);

  const [newAddress, setNewAddress] = useState(EMPTY_ADDRESS_FORM);

  const [searchByTab, setSearchByTab] = useState<Record<HierarchyTab, string>>({
    clients: '',
    shops: '',
    addresses: '',
  });
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'all',
  });
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const createdDateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        dateRangeFilter.preset,
        dateRangeFilter.customStart,
        dateRangeFilter.customEnd
      ),
    [dateRangeFilter]
  );

  const hierarchyTab = (activeTab === 'shops' || activeTab === 'addresses'
    ? activeTab
    : 'clients') as HierarchyTab;

  const searchQuery = searchByTab[hierarchyTab];

  const filteredClients = useMemo(() => {
    const inRange = filterRowsByCreatedAt(clients, createdDateRange);
    return inRange.filter((client) =>
      matchesHierarchySearch(searchByTab.clients, [
        client.client_name,
        client.client_code,
        client.client_category,
        client.contact_person,
        client.contact_email,
        client.contact_phone,
        client.payment_terms,
        client.notes,
      ])
    );
  }, [clients, createdDateRange, searchByTab.clients]);

  const filteredShops = useMemo(() => {
    const inRange = filterRowsByCreatedAt(shops, createdDateRange);
    return inRange.filter((shop) =>
      matchesHierarchySearch(searchByTab.shops, [
        shop.shop_name,
        shop.shop_code,
        shop.city,
        shop.province,
        shop.region,
        shop.contact_person,
        shop.contact_phone,
        shop.contact_email,
        shop.operating_hours,
        shop.notes,
      ])
    );
  }, [shops, createdDateRange, searchByTab.shops]);

  const filteredAddresses = useMemo(() => {
    const inRange = filterRowsByCreatedAt(addresses, createdDateRange);
    return inRange.filter((address) =>
      matchesHierarchySearch(searchByTab.addresses, [
        address.address_label,
        address.full_address,
        address.city,
        address.province,
        address.region,
        address.zip_code,
        address.contact_name,
        address.contact_phone,
        address.delivery_instructions,
      ])
    );
  }, [addresses, createdDateRange, searchByTab.addresses]);

  const searchPlaceholder = useMemo(
    () => getHierarchySearchPlaceholder(hierarchyTab),
    [hierarchyTab]
  );

  const fetchClients = useCallback(() => {
    if (!user?.company_id) {
      dispatch(resetClientHierarchy());
      setSelectedClient(null);
      setSelectedShop(null);
      return;
    }
    dispatch(fetchKAClients());
  }, [user?.company_id, dispatch]);

  const fetchShops = useCallback(
    (clientId: string) => {
      dispatch(fetchKAShops(clientId));
    },
    [dispatch]
  );

  const fetchAddresses = useCallback(
    (shopId: string) => {
      dispatch(fetchKAAddresses(shopId));
    },
    [dispatch]
  );

  // Fetch data
  useEffect(() => {
    fetchClients();
    return () => {
      dispatch(resetClientHierarchy());
    };
  }, [fetchClients, dispatch]);

  useEffect(() => {
    if (clientsStatus !== 'succeeded') return;
    setSelectedClient((currentClientId) => {
      if (currentClientId && !clients.some((client) => client.id === currentClientId)) {
        dispatch(resetShops());
        dispatch(resetAddresses());
        setSelectedShop(null);
        return null;
      }
      return currentClientId;
    });
  }, [clients, clientsStatus, dispatch]);

  useEffect(() => {
    if (clientsError) {
      toast({ variant: 'destructive', title: 'Error', description: clientsError });
    }
  }, [clientsError, toast]);

  useEffect(() => {
    if (shopsError) {
      toast({ variant: 'destructive', title: 'Error', description: shopsError });
    }
  }, [shopsError, toast]);

  useEffect(() => {
    if (addressesError) {
      toast({ variant: 'destructive', title: 'Error', description: addressesError });
    }
  }, [addressesError, toast]);

  useEffect(() => {
    if (selectedClient) {
      fetchShops(selectedClient);
      return;
    }
    dispatch(resetShops());
    dispatch(resetAddresses());
    setSelectedShop(null);
  }, [selectedClient, fetchShops, dispatch]);

  useEffect(() => {
    if (selectedShop) {
      fetchAddresses(selectedShop);
      return;
    }
    dispatch(resetAddresses());
  }, [selectedShop, fetchAddresses, dispatch]);

  const skipClientsSearchReset = useRef(true);
  useEffect(() => {
    if (skipClientsSearchReset.current) {
      skipClientsSearchReset.current = false;
      return;
    }

    setSelectedClient(null);
    setSelectedShop(null);
    dispatch(resetShops());
    dispatch(resetAddresses());
    setSearchByTab((prev) => ({ ...prev, shops: '', addresses: '' }));
    setActiveTab('clients');
  }, [searchByTab.clients]);

  const skipShopsSearchReset = useRef(true);
  useEffect(() => {
    if (skipShopsSearchReset.current) {
      skipShopsSearchReset.current = false;
      return;
    }

    setSelectedShop(null);
    dispatch(resetAddresses());
    setSearchByTab((prev) => ({ ...prev, addresses: '' }));
    setActiveTab((current) => (current === 'addresses' ? 'shops' : current));
  }, [searchByTab.shops]);

  useEffect(() => {
    if (!shopDialogOpen) {
      setCorPdfFile(null);
      setEditingShopId(null);
      setEditingShopCorPath(null);
    }
  }, [shopDialogOpen]);

  useEffect(() => {
    if (!clientDialogOpen) setEditingClientId(null);
  }, [clientDialogOpen]);

  useEffect(() => {
    if (!addressDialogOpen) setEditingAddressId(null);
  }, [addressDialogOpen]);

  useEffect(() => {
    setClientsPage(0);
  }, [
    filteredClients.length,
    searchByTab.clients,
    createdDateRange.start,
    createdDateRange.end,
    pageSize,
    clientsSortState,
  ]);

  useEffect(() => {
    setShopsPage(0);
  }, [
    filteredShops.length,
    selectedClient,
    searchByTab.shops,
    createdDateRange.start,
    createdDateRange.end,
    pageSize,
    shopsSortState,
  ]);

  useEffect(() => {
    setAddressesPage(0);
  }, [
    filteredAddresses.length,
    selectedShop,
    searchByTab.addresses,
    createdDateRange.start,
    createdDateRange.end,
    pageSize,
    addressesSortState,
  ]);

  const { key: clientsSortKey, direction: clientsSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        clientsSortState,
        DEFAULT_CLIENT_HIERARCHY_CLIENT_SORT_KEY,
        DEFAULT_CLIENT_HIERARCHY_CLIENT_SORT_DIRECTION
      ),
    [clientsSortState]
  );
  const { key: shopsSortKey, direction: shopsSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        shopsSortState,
        DEFAULT_CLIENT_HIERARCHY_SHOP_SORT_KEY,
        DEFAULT_CLIENT_HIERARCHY_SHOP_SORT_DIRECTION
      ),
    [shopsSortState]
  );
  const { key: addressesSortKey, direction: addressesSortDirection } = useMemo(
    () =>
      resolveTableSortDirection(
        addressesSortState,
        DEFAULT_CLIENT_HIERARCHY_ADDRESS_SORT_KEY,
        DEFAULT_CLIENT_HIERARCHY_ADDRESS_SORT_DIRECTION
      ),
    [addressesSortState]
  );

  const sortedClients = useMemo(
    () => sortClientHierarchyClients(filteredClients, clientsSortKey, clientsSortDirection),
    [filteredClients, clientsSortKey, clientsSortDirection]
  );
  const sortedShops = useMemo(
    () => sortClientHierarchyShops(filteredShops, shopsSortKey, shopsSortDirection),
    [filteredShops, shopsSortKey, shopsSortDirection]
  );
  const sortedAddresses = useMemo(
    () => sortClientHierarchyAddresses(filteredAddresses, addressesSortKey, addressesSortDirection),
    [filteredAddresses, addressesSortKey, addressesSortDirection]
  );

  const {
    pageCount: clientsPageCount,
    safePage: clientsSafePage,
    pagedItems: paginatedClients,
  } = useMemo(
    () => getListPaginationSlice(sortedClients, clientsPage, pageSize),
    [sortedClients, clientsPage, pageSize]
  );
  const {
    pageCount: shopsPageCount,
    safePage: shopsSafePage,
    pagedItems: paginatedShops,
  } = useMemo(
    () => getListPaginationSlice(sortedShops, shopsPage, pageSize),
    [sortedShops, shopsPage, pageSize]
  );
  const {
    pageCount: addressesPageCount,
    safePage: addressesSafePage,
    pagedItems: paginatedAddresses,
  } = useMemo(
    () => getListPaginationSlice(sortedAddresses, addressesPage, pageSize),
    [sortedAddresses, addressesPage, pageSize]
  );

  const handleClientsSort = (key: ClientHierarchyClientSortKey) => {
    setClientsSortState((current) => getNextTableSortCycleState(current, key));
  };
  const handleShopsSort = (key: ClientHierarchyShopSortKey) => {
    setShopsSortState((current) => getNextTableSortCycleState(current, key));
  };
  const handleAddressesSort = (key: ClientHierarchyAddressSortKey) => {
    setAddressesSortState((current) => getNextTableSortCycleState(current, key));
  };

  const selectClient = (clientId: string) => {
    setSelectedClient(clientId);
    setSelectedShop(null);
    setActiveTab('shops');
  };

  const selectShop = (shopId: string) => {
    setSelectedShop(shopId);
    setActiveTab('addresses');
  };

  const openCreateClientDialog = () => {
    setEditingClientId(null);
    setNewClient(EMPTY_CLIENT_FORM);
    setCustomPaymentTermInput('');
    setClientDialogOpen(true);
  };

  const openEditClientDialog = (client: KeyAccountClient) => {
    setEditingClientId(client.id);
    setNewClient({
      client_name: client.client_name,
      client_category: client.client_category || '',
      contact_person: client.contact_person || '',
      contact_email: client.contact_email || '',
      contact_phone: client.contact_phone || '',
      payment_terms: parsePaymentTerms(client.payment_terms),
      notes: client.notes || '',
    });
    setCustomPaymentTermInput('');
    setClientDialogOpen(true);
  };

  const addCustomClientPaymentTerm = () => {
    const trimmed = customPaymentTermInput.trim();
    if (!trimmed) return;
    setNewClient((prev) => {
      const exists = prev.payment_terms.some((t) => t.toLowerCase() === trimmed.toLowerCase());
      if (exists) return prev;
      return { ...prev, payment_terms: [...prev.payment_terms, trimmed] };
    });
    setCustomPaymentTermInput('');
  };

  const removeClientPaymentTerm = (term: string) => {
    setNewClient((prev) => ({
      ...prev,
      payment_terms: prev.payment_terms.filter((t) => t.toLowerCase() !== term.toLowerCase()),
    }));
  };

  const openCreateShopDialog = () => {
    setEditingShopId(null);
    setEditingShopCorPath(null);
    setNewShop(EMPTY_SHOP_FORM);
    setShopDialogOpen(true);
  };

  const openEditShopDialog = (shop: KeyAccountShop) => {
    setEditingShopId(shop.id);
    setEditingShopCorPath(shop.cor_pdf_path ?? null);
    setNewShop({
      shop_name: shop.shop_name,
      city: shop.city || '',
      region: shop.region || '',
      province: shop.province || '',
      contact_person: shop.contact_person || '',
      contact_phone: shop.contact_phone || '',
      contact_email: shop.contact_email || '',
      operating_hours: shop.operating_hours || '',
      notes: shop.notes || '',
    });
    setShopDialogOpen(true);
  };

  const openCreateAddressDialog = () => {
    setEditingAddressId(null);
    setNewAddress(EMPTY_ADDRESS_FORM);
    setAddressDialogOpen(true);
  };

  const openEditAddressDialog = (address: KeyAccountDeliveryAddress) => {
    setEditingAddressId(address.id);
    setNewAddress({
      address_label: address.address_label,
      full_address: address.full_address,
      city: address.city || '',
      region: address.region || '',
      province: address.province || '',
      zip_code: address.zip_code || '',
      contact_name: address.contact_name || '',
      contact_phone: address.contact_phone || '',
      delivery_instructions: address.delivery_instructions || '',
      is_default: address.is_default,
    });
    setAddressDialogOpen(true);
  };

  const uploadShopCorPdf = async (shopId: string, clientId: string) => {
    if (!corPdfFile || !user?.company_id || !user?.id) return null;
    if (corPdfFile.size > 15 * 1024 * 1024) {
      throw new Error('COR PDF must be 15MB or smaller');
    }
    if (corPdfFile.type !== 'application/pdf') {
      throw new Error('COR must be a PDF file');
    }
    const timestamp = Date.now();
    const path = `${user.id}/company_${user.company_id}_client_${clientId}_shop_${shopId}_cor_${timestamp}.pdf`;
    const { error: upErr } = await supabase.storage.from('ka-shop-cor').upload(path, corPdfFile, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (upErr) throw new Error(upErr.message);
    return path;
  };

  const handleSaveClient = async () => {
    if (!user?.company_id || !newClient.client_name.trim() || !newClient.client_category) return;
    setSavingClient(true);
    try {
      const payload = {
        client_name: newClient.client_name.trim(),
        client_category: newClient.client_category,
        contact_person: newClient.contact_person.trim() || null,
        contact_email: newClient.contact_email.trim() || null,
        contact_phone: newClient.contact_phone.trim() || null,
        payment_terms: formatPaymentTerms(newClient.payment_terms) || null,
        notes: newClient.notes.trim() || null,
      };

      if (editingClientId) {
        await dispatch(updateKAClient({ clientId: editingClientId, ...payload })).unwrap();
        toast({ title: 'Success', description: 'Client updated successfully' });
      } else {
        const result = await dispatch(createKAClient(payload)).unwrap();
        toast({
          title: 'Success',
          description: isKeyAccountManager
            ? `Client created with code ${result.client.client_code} and assigned to you`
            : `Client created with code ${result.client.client_code}`,
        });
      }

      setClientDialogOpen(false);
      setNewClient(EMPTY_CLIENT_FORM);
      setCustomPaymentTermInput('');
      setEditingClientId(null);
      fetchClients();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setSavingClient(false);
    }
  };

  const handleSaveShop = async () => {
    if (!selectedClient || !newShop.shop_name.trim() || !user?.company_id || !user?.id) return;

    setSavingShop(true);
    try {
      const shopPayload = {
        shop_name: newShop.shop_name.trim(),
        city: newShop.city.trim() || null,
        region: newShop.region.trim() || null,
        province: newShop.province.trim() || null,
        contact_person: newShop.contact_person.trim() || null,
        contact_phone: newShop.contact_phone.trim() || null,
        contact_email: newShop.contact_email.trim() || null,
        operating_hours: newShop.operating_hours.trim() || null,
        notes: newShop.notes.trim() || null,
      };

      if (editingShopId) {
        let corPdfPath = editingShopCorPath;
        if (corPdfFile) {
          corPdfPath = await uploadShopCorPdf(editingShopId, selectedClient);
        }

        await dispatch(
          updateKAShop({
            shopId: editingShopId,
            ...shopPayload,
            ...(corPdfPath !== editingShopCorPath ? { cor_pdf_path: corPdfPath } : {}),
          })
        ).unwrap();
        toast({ title: 'Success', description: 'Shop updated successfully' });
      } else {
        const result = await dispatch(createKAShop({ clientId: selectedClient, ...shopPayload })).unwrap();

        if (corPdfFile) {
          const path = await uploadShopCorPdf(result.shop.id, selectedClient);
          await dispatch(
            updateKAShop({
              shopId: result.shop.id,
              ...shopPayload,
              cor_pdf_path: path,
            })
          ).unwrap();
        }

        toast({ title: 'Success', description: `Shop created with code ${result.shop.shop_code}` });
      }

      setShopDialogOpen(false);
      setCorPdfFile(null);
      setNewShop(EMPTY_SHOP_FORM);
      setEditingShopId(null);
      setEditingShopCorPath(null);
      fetchShops(selectedClient);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setSavingShop(false);
    }
  };

  const handleSaveAddress = async () => {
    if (!selectedShop || !newAddress.address_label.trim() || !newAddress.full_address.trim()) return;

    setSavingAddress(true);
    try {
      const payload = {
        address_label: newAddress.address_label.trim(),
        full_address: newAddress.full_address.trim(),
        city: newAddress.city.trim() || null,
        region: newAddress.region.trim() || null,
        province: newAddress.province.trim() || null,
        zip_code: newAddress.zip_code.trim() || null,
        contact_name: newAddress.contact_name.trim() || null,
        contact_phone: newAddress.contact_phone.trim() || null,
        delivery_instructions: newAddress.delivery_instructions.trim() || null,
        is_default: newAddress.is_default,
      };

      if (editingAddressId) {
        await dispatch(updateKAAddress({ addressId: editingAddressId, ...payload })).unwrap();
        toast({ title: 'Success', description: 'Delivery address updated successfully' });
      } else {
        await dispatch(createKAAddress({ shopId: selectedShop, ...payload })).unwrap();
        toast({ title: 'Success', description: 'Delivery address created successfully' });
      }

      setAddressDialogOpen(false);
      setNewAddress(EMPTY_ADDRESS_FORM);
      setEditingAddressId(null);
      fetchAddresses(selectedShop);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setSavingAddress(false);
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
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-2xl font-bold">
            {isKeyAccountManager ? 'My Key Account Clients' : 'Key Account Client Management'}
          </h2>
          {canCreateClients && (
            <Button onClick={openCreateClientDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Add Client
            </Button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) =>
              setSearchByTab((prev) => ({ ...prev, [hierarchyTab]: e.target.value }))
            }
            className="w-full sm:flex-1"
          />
          <DateRangeFilterPopover
            value={dateRangeFilter}
            onChange={setDateRangeFilter}
            triggerClassName="w-full sm:w-[220px] justify-between h-10 shrink-0"
            align="end"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Clients ({filteredClients.length})
          </TabsTrigger>
          <TabsTrigger value="shops" className="flex items-center gap-2" disabled={!selectedClient}>
            <Store className="h-4 w-4" />
            Shops ({filteredShops.length})
          </TabsTrigger>
          <TabsTrigger value="addresses" className="flex items-center gap-2" disabled={!selectedShop}>
            <MapPin className="h-4 w-4" />
            Addresses ({filteredAddresses.length})
          </TabsTrigger>
        </TabsList>

        {/* Clients Tab */}
        <TabsContent value="clients" className="space-y-4">
        <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setImportDialogOpen(true)}>
                <FileUp className="mr-2 h-4 w-4" />
                Import
              </Button>
              <HierarchyViewToolbar viewMode={viewMode} onViewModeChange={setViewMode} />
          </div>
          {clients.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                {isKeyAccountManager
                  ? 'No clients are currently assigned to you. Click "Add Client" to create one — it will be assigned to you automatically.'
                  : 'No clients yet. Click "Add Client" to create your first Key Account client.'}
              </CardContent>
            </Card>
          ) : filteredClients.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No clients match your search or date filter.
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
                          <div className="flex items-center gap-1">
                            {canManageClients && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                aria-label={`Edit ${client.client_name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditClientDialog(client);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
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
                          <div>
                            <span className="text-muted-foreground">Payment Terms:</span>
                            <p>{client.payment_terms || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Notes:</span>
                            <p className="whitespace-pre-wrap break-words">{client.notes || 'N/A'}</p>
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
                        <SortableTableHead
                          label="Client"
                          sortKey="clientName"
                          sortDirection={getTableSortDisplayDirection(clientsSortState, 'clientName')}
                          onSort={handleClientsSort}
                        />
                        <SortableTableHead
                          label="Code"
                          sortKey="code"
                          sortDirection={getTableSortDisplayDirection(clientsSortState, 'code')}
                          onSort={handleClientsSort}
                        />
                        <SortableTableHead
                          label="Category"
                          sortKey="category"
                          sortDirection={getTableSortDisplayDirection(clientsSortState, 'category')}
                          onSort={handleClientsSort}
                        />
                        <SortableTableHead
                          label="Contact"
                          sortKey="contact"
                          sortDirection={getTableSortDisplayDirection(clientsSortState, 'contact')}
                          onSort={handleClientsSort}
                        />
                        <SortableTableHead
                          label="Email"
                          sortKey="email"
                          sortDirection={getTableSortDisplayDirection(clientsSortState, 'email')}
                          onSort={handleClientsSort}
                        />
                        <SortableTableHead
                          label="Phone"
                          sortKey="phone"
                          sortDirection={getTableSortDisplayDirection(clientsSortState, 'phone')}
                          onSort={handleClientsSort}
                        />
                        <SortableTableHead
                          label="Payment Terms"
                          sortKey="paymentTerms"
                          sortDirection={getTableSortDisplayDirection(clientsSortState, 'paymentTerms')}
                          onSort={handleClientsSort}
                        />
                        <SortableTableHead
                          label="Notes"
                          sortKey="notes"
                          sortDirection={getTableSortDisplayDirection(clientsSortState, 'notes')}
                          onSort={handleClientsSort}
                        />
                        <SortableTableHead
                          label="Created At"
                          sortKey="createdAt"
                          sortDirection={getTableSortDisplayDirection(clientsSortState, 'createdAt')}
                          onSort={handleClientsSort}
                        />
                        <TableHead className="w-20 text-right">Actions</TableHead>
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
                          <TableCell>{client.payment_terms || '—'}</TableCell>
                          <TableCell className="max-w-[200px] whitespace-pre-wrap break-words">
                            {client.notes || '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {client.created_at
                              ? format(new Date(client.created_at), 'MMM d, yyyy')
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            {canManageClients && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Edit ${client.client_name}`}
                                onClick={() => openEditClientDialog(client)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {filteredClients.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <ListPagination
                    pageSize={pageSize}
                    safePage={clientsSafePage}
                    pageCount={clientsPageCount}
                    onPageSizeChange={setPageSize}
                    onPrevious={() => setClientsPage((page) => Math.max(0, page - 1))}
                    onNext={() =>
                      setClientsPage((page) => Math.min(clientsPageCount - 1, page + 1))
                    }
                  />
                </div>
              )}
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
              <Button onClick={openCreateShopDialog}>
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
          ) : filteredShops.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No shops match your search or date filter.
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
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              aria-label={`Edit ${shop.shop_name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditShopDialog(shop);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <ChevronRight className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
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
                          <div>
                            <span className="text-muted-foreground">Phone:</span>
                            <p>{shop.contact_phone || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Email:</span>
                            <p>{shop.contact_email || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Operating Hours:</span>
                            <p>{shop.operating_hours || 'N/A'}</p>
                          </div>
                          <div className="sm:col-span-3">
                            <span className="text-muted-foreground">Notes:</span>
                            <p className="whitespace-pre-wrap break-words">{shop.notes || 'N/A'}</p>
                          </div>
                          <div className="flex flex-col gap-1.5 sm:col-span-3">
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
                        <SortableTableHead
                          label="Shop"
                          sortKey="shopName"
                          sortDirection={getTableSortDisplayDirection(shopsSortState, 'shopName')}
                          onSort={handleShopsSort}
                        />
                        <SortableTableHead
                          label="Code"
                          sortKey="code"
                          sortDirection={getTableSortDisplayDirection(shopsSortState, 'code')}
                          onSort={handleShopsSort}
                        />
                        <SortableTableHead
                          label="Location"
                          sortKey="location"
                          sortDirection={getTableSortDisplayDirection(shopsSortState, 'location')}
                          onSort={handleShopsSort}
                        />
                        <SortableTableHead
                          label="Region"
                          sortKey="region"
                          sortDirection={getTableSortDisplayDirection(shopsSortState, 'region')}
                          onSort={handleShopsSort}
                        />
                        <SortableTableHead
                          label="Contact"
                          sortKey="contact"
                          sortDirection={getTableSortDisplayDirection(shopsSortState, 'contact')}
                          onSort={handleShopsSort}
                        />
                        <SortableTableHead
                          label="Phone"
                          sortKey="phone"
                          sortDirection={getTableSortDisplayDirection(shopsSortState, 'phone')}
                          onSort={handleShopsSort}
                        />
                        <SortableTableHead
                          label="Email"
                          sortKey="email"
                          sortDirection={getTableSortDisplayDirection(shopsSortState, 'email')}
                          onSort={handleShopsSort}
                        />
                        <SortableTableHead
                          label="Operating Hours"
                          sortKey="operatingHours"
                          sortDirection={getTableSortDisplayDirection(shopsSortState, 'operatingHours')}
                          onSort={handleShopsSort}
                        />
                        <SortableTableHead
                          label="Notes"
                          sortKey="notes"
                          sortDirection={getTableSortDisplayDirection(shopsSortState, 'notes')}
                          onSort={handleShopsSort}
                        />
                        <SortableTableHead
                          label="COR"
                          sortKey="cor"
                          sortDirection={getTableSortDisplayDirection(shopsSortState, 'cor')}
                          onSort={handleShopsSort}
                        />
                        <SortableTableHead
                          label="Created At"
                          sortKey="createdAt"
                          sortDirection={getTableSortDisplayDirection(shopsSortState, 'createdAt')}
                          onSort={handleShopsSort}
                        />
                        <TableHead className="w-20 text-right">Actions</TableHead>
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
                          <TableCell>{shop.contact_phone || '—'}</TableCell>
                          <TableCell>{shop.contact_email || '—'}</TableCell>
                          <TableCell>{shop.operating_hours || '—'}</TableCell>
                          <TableCell className="max-w-[160px] whitespace-pre-wrap break-words">
                            {shop.notes || '—'}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <KeyAccountShopCorView corPdfPath={shop.cor_pdf_path} stopPropagation />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {shop.created_at
                              ? format(new Date(shop.created_at), 'MMM d, yyyy')
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Edit ${shop.shop_name}`}
                              onClick={() => openEditShopDialog(shop)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {filteredShops.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <ListPagination
                    pageSize={pageSize}
                    safePage={shopsSafePage}
                    pageCount={shopsPageCount}
                    onPageSizeChange={setPageSize}
                    onPrevious={() => setShopsPage((page) => Math.max(0, page - 1))}
                    onNext={() => setShopsPage((page) => Math.min(shopsPageCount - 1, page + 1))}
                  />
                </div>
              )}
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
              <Button onClick={openCreateAddressDialog}>
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
          ) : filteredAddresses.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No addresses match your search or date filter.
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
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            aria-label={`Edit ${address.address_label}`}
                            onClick={() => openEditAddressDialog(address)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Address:</span>
                            <p className="whitespace-pre-wrap break-words">{address.full_address || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Location:</span>
                            <p>
                              {[address.city, address.province, address.region, address.zip_code]
                                .filter(Boolean)
                                .join(', ') || 'N/A'}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Contact:</span>
                            <p>{address.contact_name || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Phone:</span>
                            <p>{address.contact_phone || 'N/A'}</p>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-muted-foreground">Delivery Instructions:</span>
                            <p className="whitespace-pre-wrap break-words">
                              {address.delivery_instructions || 'N/A'}
                            </p>
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
                        <SortableTableHead
                          label="Label"
                          sortKey="label"
                          sortDirection={getTableSortDisplayDirection(addressesSortState, 'label')}
                          onSort={handleAddressesSort}
                        />
                        <SortableTableHead
                          label="Address"
                          sortKey="address"
                          sortDirection={getTableSortDisplayDirection(addressesSortState, 'address')}
                          onSort={handleAddressesSort}
                        />
                        <SortableTableHead
                          label="Location"
                          sortKey="location"
                          sortDirection={getTableSortDisplayDirection(addressesSortState, 'location')}
                          onSort={handleAddressesSort}
                        />
                        <SortableTableHead
                          label="Contact"
                          sortKey="contact"
                          sortDirection={getTableSortDisplayDirection(addressesSortState, 'contact')}
                          onSort={handleAddressesSort}
                        />
                        <SortableTableHead
                          label="Phone"
                          sortKey="phone"
                          sortDirection={getTableSortDisplayDirection(addressesSortState, 'phone')}
                          onSort={handleAddressesSort}
                        />
                        <SortableTableHead
                          label="Instructions"
                          sortKey="instructions"
                          sortDirection={getTableSortDisplayDirection(addressesSortState, 'instructions')}
                          onSort={handleAddressesSort}
                        />
                        <SortableTableHead
                          label="Created At"
                          sortKey="createdAt"
                          sortDirection={getTableSortDisplayDirection(addressesSortState, 'createdAt')}
                          onSort={handleAddressesSort}
                        />
                        <TableHead className="w-20 text-right">Actions</TableHead>
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
                            {[address.city, address.province, address.region, address.zip_code]
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </TableCell>
                          <TableCell>{address.contact_name || '—'}</TableCell>
                          <TableCell>{address.contact_phone || '—'}</TableCell>
                          <TableCell className="max-w-[180px] truncate">
                            {address.delivery_instructions || '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground">
                            {address.created_at
                              ? format(new Date(address.created_at), 'MMM d, yyyy')
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Edit ${address.address_label}`}
                              onClick={() => openEditAddressDialog(address)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {filteredAddresses.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <ListPagination
                    pageSize={pageSize}
                    safePage={addressesSafePage}
                    pageCount={addressesPageCount}
                    onPageSizeChange={setPageSize}
                    onPrevious={() => setAddressesPage((page) => Math.max(0, page - 1))}
                    onNext={() =>
                      setAddressesPage((page) => Math.min(addressesPageCount - 1, page + 1))
                    }
                  />
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Client Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClientId ? 'Edit Client' : 'Create New Client'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!editingClientId ? (
              <p className="text-xs text-muted-foreground">
                A client code (e.g. CL-2026-0001) is assigned automatically when you save.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Code: {clients.find((c) => c.id === editingClientId)?.client_code ?? '—'}
              </p>
            )}
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
              <Label>Payment Terms</Label>
              {newClient.payment_terms.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {newClient.payment_terms.map((term) => (
                    <Badge key={term} variant="secondary" className="gap-1 pr-1 font-normal">
                      {term}
                      <button
                        type="button"
                        className="rounded-sm p-0.5 hover:bg-muted-foreground/20"
                        onClick={() => removeClientPaymentTerm(term)}
                        aria-label={`Remove ${term}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No payment terms added yet.</p>
              )}
              <div className="flex gap-2">
                <Input
                  id="payment_terms_custom"
                  value={customPaymentTermInput}
                  onChange={(e) => setCustomPaymentTermInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomClientPaymentTerm();
                    }
                  }}
                  placeholder="e.g. Net 30, COD…"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addCustomClientPaymentTerm}
                  disabled={!customPaymentTermInput.trim()}
                >
                  Add
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={newClient.notes} onChange={e => setNewClient({...newClient, notes: e.target.value})} />
            </div>
            <Button
              onClick={handleSaveClient}
              disabled={savingClient || !newClient.client_name.trim() || !newClient.client_category}
            >
              {savingClient ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingClientId ? 'Save Changes' : 'Create Client'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shop Dialog */}
      <Dialog open={shopDialogOpen} onOpenChange={setShopDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingShopId ? 'Edit Shop' : 'Create New Shop'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!editingShopId ? (
              <p className="text-xs text-muted-foreground">
                A shop code (e.g. SH-2026-0001) is assigned automatically when you save.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Code: {shops.find((s) => s.id === editingShopId)?.shop_code ?? '—'}
              </p>
            )}
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
              <Label htmlFor="operating_hours">Operating Hours</Label>
              <Input
                id="operating_hours"
                value={newShop.operating_hours}
                onChange={e => setNewShop({ ...newShop, operating_hours: e.target.value })}
                placeholder="Mon–Sat 9AM–9PM"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shop_cor_pdf">COR (Certificate of Registration) — PDF</Label>
              {editingShopCorPath ? (
                <div className="mb-2">
                  <KeyAccountShopCorView corPdfPath={editingShopCorPath} />
                </div>
              ) : null}
              <Input
                id="shop_cor_pdf"
                type="file"
                accept="application/pdf,.pdf"
                className="cursor-pointer"
                onChange={(e) => setCorPdfFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                {editingShopId ? 'Upload a new PDF to replace the current COR. ' : ''}
                Optional. Max 15MB.
              </p>
            </div>
            <Button
              onClick={handleSaveShop}
              disabled={savingShop || !newShop.shop_name.trim()}
            >
              {savingShop ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingShopId ? 'Save Changes' : 'Create Shop'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Address Dialog */}
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAddressId ? 'Edit Delivery Address' : 'Create Delivery Address'}</DialogTitle>
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
            <Button
              onClick={handleSaveAddress}
              disabled={savingAddress || !newAddress.address_label || !newAddress.full_address}
            >
              {savingAddress ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editingAddressId ? 'Save Changes' : 'Create Address'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ClientHierarchyImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        tab="clients"
        companyId={user?.company_id}
        userId={user?.id}
        selectedClientId={selectedClient}
        selectedShopId={selectedShop}
        onImported={fetchClients}
      />
    </div>
  );
}
