import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Trash2,
  Package,
  Building2,
  Store,
  MapPin,
  Loader2,
  Save,
  CreditCard,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type {
  KeyAccountClient,
  KeyAccountShop,
  KeyAccountDeliveryAddress,
  KeyAccountPoPaymentMode,
} from '@/types/database.types';
import { uploadKeyAccountPaymentProof } from '@/features/key-accounts/kaPaymentProofUpload';
import {
  KeyAccountAddAddressDialog,
  KeyAccountAddShopDialog,
} from '@/features/key-accounts/components/KeyAccountShopAddressDialogs';
import { KeyAccountPaymentProofUploadField } from '@/features/key-accounts/components/KeyAccountPaymentProofPreview';

const CLIENT_PAGE_SIZE = 10;

interface POItem {
  id: string;
  brandId: string;
  brandName: string;
  variantId: string;
  variantName: string;
  variantType: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  warehouseLocationId?: string;
}

interface Warehouse {
  id: string;
  company_id: string; // hub company_id
  company_name?: string; // hub company name (display)
  location_id: string; // warehouse_locations.id
  location_name: string; // warehouse_locations.name
  is_main: boolean;
}

/**
 * Key Account Purchase Order Page
 * Allows KAMs to create POs with client/shop/address selection
 * and warehouse transfer fulfillment
 */
export function KeyAccountPurchaseOrderPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Loading states
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingMoreClients, setLoadingMoreClients] = useState(false);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Data states
  const [clients, setClients] = useState<KeyAccountClient[]>([]);
  const [clientsHasMore, setClientsHasMore] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<KeyAccountClient | null>(null);
  const kamAssignedClientIdsRef = useRef<string[] | null>(null);
  const clientFetchGenRef = useRef(0);
  const [shops, setShops] = useState<KeyAccountShop[]>([]);
  const [addresses, setAddresses] = useState<KeyAccountDeliveryAddress[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [linkedWarehouseCompanyId, setLinkedWarehouseCompanyId] = useState<string | null>(null);
  const [brands, setBrands] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  /** Available-to-order qty by `${variantId}::${locationId}` */
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  /** On-hand (physical) qty by same key — for stock modal breakdown */
  const [onHandMap, setOnHandMap] = useState<Record<string, number>>({});
  /** Open PO holds (hard + soft) by same key */
  const [reservedMap, setReservedMap] = useState<Record<string, number>>({});
  const [stockLoading, setStockLoading] = useState(false);

  // UI state: warehouse stock modal
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [shopDialogOpen, setShopDialogOpen] = useState(false);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Selection states
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [selectedAddressId, setSelectedAddressId] = useState<string>('');
  const [selectedWarehouseLocationId, setSelectedWarehouseLocationId] = useState<string>('');
  const [sourceMode, setSourceMode] = useState<'single' | 'multi'>('single');
  const [activeWarehouseTabId, setActiveWarehouseTabId] = useState<string>('');

  // Form states
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [taxRate, setTaxRate] = useState(0); // Default 12% VAT
  const [discount, setDiscount] = useState(0);

  /** Consignment = float stock to client now; payment deferred (warehouse still fulfills). */
  const [isConsignment, setIsConsignment] = useState(false);
  const [paymentTermsSource, setPaymentTermsSource] = useState<'client' | 'custom'>('client');
  const [paymentTermsCustom, setPaymentTermsCustom] = useState('');
  const [paymentMode, setPaymentMode] = useState<KeyAccountPoPaymentMode>('full');
  const [paymentMethod, setPaymentMethod] = useState<'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE'>('BANK_TRANSFER');
  const [bankType, setBankType] = useState<'Unionbank' | 'BPI' | 'PBCOM'>('BPI');
  const [splitFirstAmount, setSplitFirstAmount] = useState('');
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);

  // Item management
  const [items, setItems] = useState<POItem[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState<string>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemUnitPrice, setItemUnitPrice] = useState(0);

  // Derived data
  const selectedShop = shops.find((s) => s.id === selectedShopId);
  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);
  const activeLocationId =
    sourceMode === 'multi' ? activeWarehouseTabId : selectedWarehouseLocationId;

  const stockViewLocationId = activeLocationId;

  const selectedWarehouse = warehouses.find((w) => w.location_id === stockViewLocationId);

  const warehouseLabel = (locationId?: string) => {
    if (!locationId) return '—';
    const w = warehouses.find((x) => x.location_id === locationId);
    if (!w) return '—';
    return `${w.location_name}${w.is_main ? ' (Main)' : ''}`;
  };

  const mainWarehouseLocationId = useMemo(() => {
    const main = warehouses.find((w) => w.is_main);
    return main?.location_id || '';
  }, [warehouses]);

  const stockBadgeClass = (stock: number) => {
    if (stock <= 0) return 'bg-destructive text-destructive-foreground';
    if (stock <= 10) return 'bg-amber-400 text-amber-950 dark:bg-amber-500 dark:text-amber-950';
    return 'bg-emerald-600 text-white';
  };

  const stockKey = (variantId: string, locationId: string) => `${variantId}::${locationId}`;

  const getVariantStock = (variantId: string, locationId: string) => {
    if (!variantId || !locationId) return null;
    return stockMap[stockKey(variantId, locationId)] ?? null;
  };

  const getVariantOnHand = (variantId: string, locationId: string) => {
    if (!variantId || !locationId) return null;
    return onHandMap[stockKey(variantId, locationId)] ?? null;
  };

  const getVariantReserved = (variantId: string, locationId: string) => {
    if (!variantId || !locationId) return 0;
    return reservedMap[stockKey(variantId, locationId)] ?? 0;
  };

  const stockedVariantIdsForActiveLocation = useMemo(() => {
    if (!activeLocationId) return new Set<string>();
    const ids = new Set<string>();
    for (const v of variants) {
      const stock = getVariantStock(v.id, activeLocationId);
      if (stock !== null) ids.add(v.id);
    }
    return ids;
  }, [variants, activeLocationId, stockMap]);

  const visibleVariants = useMemo(() => {
    if (!activeLocationId) return variants;
    return variants.filter((v) => stockedVariantIdsForActiveLocation.has(v.id));
  }, [variants, stockedVariantIdsForActiveLocation, activeLocationId]);

  const visibleBrands = useMemo(() => {
    if (!activeLocationId) return brands;
    const brandIds = new Set<string>();
    for (const v of visibleVariants) {
      if (v.brand_id) brandIds.add(v.brand_id);
    }
    return brands.filter((b) => brandIds.has(b.id));
  }, [brands, visibleVariants, activeLocationId]);

  const displayedItems = useMemo(() => {
    if (sourceMode !== 'multi') return items;
    return items.filter((i) => i.warehouseLocationId === activeWarehouseTabId);
  }, [items, sourceMode, activeWarehouseTabId]);

  const filteredShops = useMemo(
    () => shops.filter((s) => s.client_id === selectedClientId),
    [shops, selectedClientId]
  );

  const filteredAddresses = useMemo(
    () => addresses.filter((a) => a.shop_id === selectedShopId),
    [addresses, selectedShopId]
  );

  const filteredVariants = useMemo(
    () => visibleVariants.filter((v) => v.brand_id === selectedBrandId),
    [visibleVariants, selectedBrandId]
  );

  // Calculations
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount - discount;

  const resolvedPaymentTerms = useMemo(() => {
    if (paymentTermsSource === 'custom') return paymentTermsCustom.trim();
    return (selectedClient?.payment_terms || '').trim();
  }, [paymentTermsSource, paymentTermsCustom, selectedClient?.payment_terms]);

  // Fetch warehouses on mount; clients load via search/pagination effect below
  useEffect(() => {
    fetchWarehouses();
  }, []);

  // Debounced searchable client list (10 at a time)
  useEffect(() => {
    const handle = window.setTimeout(() => {
      void fetchClients({ search: clientSearch, append: false });
    }, clientSearch.trim() ? 300 : 0);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchClients closes over latest user/search
  }, [clientSearch, user?.company_id, user?.id, user?.role]);

  // Fetch shops when client changes
  useEffect(() => {
    if (selectedClientId) {
      fetchShops(selectedClientId);
      setSelectedShopId('');
      setSelectedAddressId('');
      setPaymentTermsSource('client');
      setPaymentTermsCustom('');
    }
  }, [selectedClientId]);

  // Fetch addresses when shop changes
  useEffect(() => {
    if (selectedShopId) {
      fetchAddresses(selectedShopId);
      setSelectedAddressId('');
    }
  }, [selectedShopId]);

  // Auto-select default address
  useEffect(() => {
    if (filteredAddresses.length > 0 && !selectedAddressId) {
      const defaultAddress = filteredAddresses.find((a) => a.is_default);
      if (defaultAddress) {
        setSelectedAddressId(defaultAddress.id);
      }
    }
  }, [filteredAddresses, selectedAddressId]);

  // Reset variant when brand changes
  useEffect(() => {
    setSelectedVariantId('');
  }, [selectedBrandId]);

  const loadWarehouseAvailableStock = async () => {
    if (!linkedWarehouseCompanyId) {
      setStockMap({});
      setOnHandMap({});
      setReservedMap({});
      return;
    }
    if (!variants || variants.length === 0) {
      setStockMap({});
      setOnHandMap({});
      setReservedMap({});
      return;
    }

    const variantIds = variants.map((v) => v.id).filter(Boolean);
    if (variantIds.length === 0) {
      setStockMap({});
      setOnHandMap({});
      setReservedMap({});
      return;
    }

    setStockLoading(true);
    try {
      // Preferred: SECURITY DEFINER RPC (includes soft open POs across linked tenants)
      const { data: rpcRows, error: rpcErr } = await supabase.rpc(
        'get_linked_warehouse_available_stock',
        {
          p_warehouse_company_id: linkedWarehouseCompanyId,
          p_variant_ids: variantIds,
        }
      );

      if (!rpcErr && Array.isArray(rpcRows)) {
        const nextAvail: Record<string, number> = {};
        const nextOnHand: Record<string, number> = {};
        const nextReserved: Record<string, number> = {};
        for (const row of rpcRows as any[]) {
          if (!row?.variant_id || !row?.location_id) continue;
          const key = stockKey(String(row.variant_id), String(row.location_id));
          const hard = Math.max(0, Number(row.hard_reserved || 0));
          const soft = Math.max(0, Number(row.soft_reserved || 0));
          nextAvail[key] = Math.max(0, Number(row.available || 0));
          nextOnHand[key] = Math.max(0, Number(row.on_hand || 0));
          nextReserved[key] = hard + soft;
        }
        setStockMap(nextAvail);
        setOnHandMap(nextOnHand);
        setReservedMap(nextReserved);
        return;
      }

      if (rpcErr) {
        console.warn('[KA Create PO] available stock RPC unavailable, using fallback', rpcErr.message);
      }

      const [
        { data: mainInvData, error: mainInvErr },
        { data: locInvData, error: locInvErr },
        { data: reservedData },
        { data: softReservedData },
      ] = await Promise.all([
        supabase
          .from('main_inventory')
          .select('variant_id, stock, allocated_stock')
          .eq('company_id', linkedWarehouseCompanyId)
          .in('variant_id', variantIds),
        supabase
          .from('warehouse_location_inventory')
          .select('variant_id, location_id, stock')
          .eq('company_id', linkedWarehouseCompanyId)
          .in('variant_id', variantIds),
        supabase
          .from('warehouse_transfer_reservations')
          .select('variant_id, warehouse_location_id, quantity_reserved, quantity_fulfilled, status')
          .eq('warehouse_company_id', linkedWarehouseCompanyId)
          .in('variant_id', variantIds)
          .in('status', ['reserved', 'partial']),
        supabase
          .from('warehouse_transfer_soft_reservations')
          .select('variant_id, warehouse_location_id, quantity_committed, status')
          .eq('warehouse_company_id', linkedWarehouseCompanyId)
          .in('variant_id', variantIds)
          .eq('status', 'active'),
      ]);

      if (mainInvErr) throw mainInvErr;
      if (locInvErr) throw locInvErr;

      const reservedByLocVar: Record<string, number> = {};
      for (const row of reservedData || []) {
        const remaining = Math.max(
          0,
          Number((row as any).quantity_reserved || 0) - Number((row as any).quantity_fulfilled || 0)
        );
        if (remaining <= 0) continue;
        const key = stockKey(String((row as any).variant_id), String((row as any).warehouse_location_id));
        reservedByLocVar[key] = (reservedByLocVar[key] || 0) + remaining;
      }
      for (const row of softReservedData || []) {
        const committed = Math.max(0, Number((row as any).quantity_committed || 0));
        if (committed <= 0) continue;
        const key = stockKey(String((row as any).variant_id), String((row as any).warehouse_location_id));
        reservedByLocVar[key] = (reservedByLocVar[key] || 0) + committed;
      }

      const nextAvail: Record<string, number> = {};
      const nextOnHand: Record<string, number> = {};
      const nextReserved: Record<string, number> = {};

      if (mainWarehouseLocationId && mainInvData) {
        for (const row of mainInvData as any[]) {
          const key = stockKey(String(row.variant_id), mainWarehouseLocationId);
          const stock = Number(row.stock || 0);
          const allocated = Number(row.allocated_stock || 0);
          const reserved = reservedByLocVar[key] || 0;
          nextOnHand[key] = Math.max(0, stock);
          nextReserved[key] = reserved;
          nextAvail[key] = Math.max(0, stock - allocated - reserved);
        }
      }

      if (locInvData) {
        for (const row of locInvData as any[]) {
          const locId = String(row.location_id);
          // Main location stock comes from main_inventory (already mapped above).
          if (mainWarehouseLocationId && locId === mainWarehouseLocationId) continue;
          const key = stockKey(String(row.variant_id), locId);
          const stock = Number(row.stock || 0);
          const reserved = reservedByLocVar[key] || 0;
          nextOnHand[key] = Math.max(0, stock);
          nextReserved[key] = reserved;
          nextAvail[key] = Math.max(0, stock - reserved);
        }
      }

      setStockMap(nextAvail);
      setOnHandMap(nextOnHand);
      setReservedMap(nextReserved);
    } catch (e: any) {
      setStockMap({});
      setOnHandMap({});
      setReservedMap({});
      toast({
        variant: 'destructive',
        title: 'Error loading warehouse stock',
        description: e?.message || 'Failed to load warehouse stock',
      });
    } finally {
      setStockLoading(false);
    }
  };

  // Load stock for all linked warehouse locations (supports single + multi source modes)
  useEffect(() => {
    void loadWarehouseAvailableStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedWarehouseCompanyId, variants, mainWarehouseLocationId]);

  // Refresh ATP when opening the stock modal so open POs are reflected immediately
  useEffect(() => {
    if (!stockModalOpen) return;
    void loadWarehouseAvailableStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockModalOpen]);

  // Single-warehouse mode: keep item locations aligned with the selected warehouse
  useEffect(() => {
    if (sourceMode !== 'single' || !selectedWarehouseLocationId) return;
    setItems((prev) =>
      prev.map((i) => ({ ...i, warehouseLocationId: selectedWarehouseLocationId }))
    );
  }, [sourceMode, selectedWarehouseLocationId]);

  async function resolveKamAssignedClientIds(): Promise<string[] | null> {
    if (user?.role !== 'key_account_manager') return null;
    if (kamAssignedClientIdsRef.current) return kamAssignedClientIdsRef.current;

    const { data: assignments, error: assignErr } = await supabase
      .from('kam_client_assignments')
      .select('client_id')
      .eq('kam_id', user.id);

    if (assignErr) throw assignErr;

    const clientIds = (assignments ?? []).map((a) => a.client_id).filter(Boolean);
    kamAssignedClientIdsRef.current = clientIds;
    return clientIds;
  }

  async function fetchClients(opts: { search?: string; append?: boolean } = {}) {
    if (!user?.company_id) return;

    const search = (opts.search ?? clientSearch).trim();
    const append = opts.append ?? false;
    const offset = append ? clients.length : 0;
    const fetchGen = append ? clientFetchGenRef.current : ++clientFetchGenRef.current;

    if (append) {
      setLoadingMoreClients(true);
    } else {
      setLoadingClients(true);
    }

    try {
      const kamClientIds = await resolveKamAssignedClientIds();
      if (kamClientIds && kamClientIds.length === 0) {
        if (fetchGen !== clientFetchGenRef.current) return;
        setClients([]);
        setClientsHasMore(false);
        return;
      }

      let query = supabase
        .from('key_account_clients')
        .select('*')
        .eq('company_id', user.company_id)
        .eq('status', 'active')
        .order('client_name')
        .range(offset, offset + CLIENT_PAGE_SIZE - 1);

      if (kamClientIds) {
        query = query.in('id', kamClientIds);
      }

      if (search) {
        // Strip chars that break PostgREST `.or()` filter parsing
        const safe = search.replace(/[,.()]/g, ' ').replace(/%/g, '').trim();
        if (safe) {
          query = query.or(`client_name.ilike.%${safe}%,client_code.ilike.%${safe}%`);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      if (fetchGen !== clientFetchGenRef.current) return;

      const rows = (data || []) as KeyAccountClient[];
      setClients((prev) => {
        if (!append) return rows;
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...rows.filter((c) => !seen.has(c.id))];
      });
      setClientsHasMore(rows.length === CLIENT_PAGE_SIZE);
    } catch (error: any) {
      if (fetchGen !== clientFetchGenRef.current) return;
      toast({
        variant: 'destructive',
        title: 'Error loading clients',
        description: error.message,
      });
      if (!append) {
        setClients([]);
        setClientsHasMore(false);
      }
    } finally {
      if (fetchGen === clientFetchGenRef.current) {
        setLoadingClients(false);
        setLoadingMoreClients(false);
      }
    }
  }

  function handleSelectClient(client: KeyAccountClient) {
    setSelectedClientId(client.id);
    setSelectedClient(client);
    setClientPickerOpen(false);
  }

  async function fetchShops(clientId: string) {
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
      toast({
        variant: 'destructive',
        title: 'Error loading shops',
        description: error.message,
      });
    }
  }

  async function fetchAddresses(shopId: string) {
    try {
      const { data, error } = await supabase
        .from('key_account_delivery_addresses')
        .select('*')
        .eq('shop_id', shopId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('address_label');

      if (error) throw error;
      setAddresses(data || []);
      return (data || []) as KeyAccountDeliveryAddress[];
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading addresses',
        description: error.message,
      });
      return [];
    }
  }

  const handleShopCreated = async (shop: KeyAccountShop) => {
    if (!selectedClientId) return;
    await fetchShops(selectedClientId);
    setSelectedShopId(shop.id);
    setSelectedAddressId('');
  };

  const handleAddressCreated = async (address: KeyAccountDeliveryAddress) => {
    if (!selectedShopId) return;
    await fetchAddresses(selectedShopId);
    setSelectedAddressId(address.id);
  };

  async function fetchWarehouses() {
    if (!user?.company_id) return;

    try {
      // Resolve linked warehouse hub (same approach as old warehouse-connected PO flow)
      const { data: hubCompanyId, error: hubErr } = await supabase.rpc('get_linked_warehouse_company_id', {});

      if (hubErr) throw hubErr;
      const hubId = (hubCompanyId as string | null) ?? null;
      setLinkedWarehouseCompanyId(hubId);

      if (!hubId) {
        setWarehouses([]);
        setSelectedWarehouseLocationId('');
        // Still clear catalog if no hub is linked
        setBrands([]);
        setVariants([]);
        return;
      }

      // Fetch warehouse company name for display
      const { data: whCompany, error: whCompanyErr } = await supabase
        .from('companies')
        .select('id, company_name')
        .eq('id', hubId)
        .maybeSingle();

      if (whCompanyErr) throw whCompanyErr;

      // Load ALL linked warehouse locations (main + sub-warehouses), like the Super Admin PO flow
      const { data: locations, error: locErr } = await supabase.rpc('get_linked_warehouse_locations', {});
      if (locErr) throw locErr;
      const rows = (locations as any[]) || [];

      const formattedWarehouses: Warehouse[] = rows.map((loc) => ({
        id: `${hubId}:${loc.id}`,
        company_id: hubId,
        company_name: whCompany?.company_name || 'Warehouse',
        location_id: loc.id,
        location_name: loc.name,
        is_main: !!loc.is_main,
      }));

      setWarehouses(formattedWarehouses);

      if (formattedWarehouses.length > 0) {
        const main = formattedWarehouses.find((w) => w.is_main);
        const defaultLoc = (main || formattedWarehouses[0]).location_id;
        if (!selectedWarehouseLocationId) {
          setSelectedWarehouseLocationId(defaultLoc);
        }
        if (!activeWarehouseTabId) {
          setActiveWarehouseTabId(defaultLoc);
        }
      }

      // Load catalog from the linked hub (brands/variants in public schema)
      await fetchBrandsAndVariants(hubId);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading warehouses',
        description: error.message,
      });
    } finally {
      setLoadingWarehouses(false);
    }
  }

  async function fetchBrandsAndVariants(catalogCompanyId: string) {
    try {
      // Match old warehouse-connected PO flow: use public.brands + public.variants with hub company_id
      const [{ data: brandsData, error: brandsError }, { data: variantsData, error: variantsError }] =
        await Promise.all([
          supabase
            .from('brands')
            .select('id, name')
            .eq('company_id', catalogCompanyId)
            .eq('is_active', true)
            .order('name'),
          supabase
            .from('variants')
            .select('id, name, variant_type, brand_id')
            .eq('company_id', catalogCompanyId)
            .eq('is_active', true)
            .order('name'),
        ]);

      if (brandsError) throw brandsError;
      if (variantsError) throw variantsError;

      setBrands(brandsData || []);
      setVariants(variantsData || []);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading products',
        description: error.message,
      });
    }
  }

  function addItem() {
    const locId = activeLocationId;
    if (!locId) {
      toast({
        variant: 'destructive',
        title: 'Warehouse required',
        description:
          sourceMode === 'multi'
            ? 'Select a warehouse tab before adding items.'
            : 'Select a source warehouse before adding items.',
      });
      return;
    }

    if (!selectedBrandId || !selectedVariantId || itemQuantity <= 0 || itemUnitPrice <= 0) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please select a brand, variant, enter a valid quantity, and set a unit price.',
      });
      return;
    }

    const brand = visibleBrands.find((b) => b.id === selectedBrandId);
    const variant = visibleVariants.find((v) => v.id === selectedVariantId);

    if (!brand || !variant) return;

    const unitPrice = itemUnitPrice;
    const stockAtLocation = getVariantStock(selectedVariantId, locId);
    const available = stockAtLocation !== null && stockAtLocation !== undefined ? stockAtLocation : 0;

    const existingForLine = items.filter(
      (i) => i.variantId === selectedVariantId && i.warehouseLocationId === locId
    );
    const qtyAlreadyOnPo = existingForLine.reduce((s, i) => s + i.quantity, 0);
    const newTotalQty = qtyAlreadyOnPo + itemQuantity;

    if (newTotalQty > available) {
      const locName = warehouseLabel(locId);
      toast({
        variant: 'destructive',
        title: 'Insufficient stock',
        description:
          qtyAlreadyOnPo > 0
            ? `This variant already has ${qtyAlreadyOnPo} on the order at ${locName}. Only ${available} available (${available - qtyAlreadyOnPo} more allowed).`
            : `Only ${available} available at ${locName} for this variant.`,
      });
      return;
    }

    const stableId = existingForLine[0]?.id ?? crypto.randomUUID();
    const withoutLine = items.filter(
      (i) => !(i.variantId === selectedVariantId && i.warehouseLocationId === locId)
    );
    const mergedItem: POItem = {
      id: stableId,
      brandId: selectedBrandId,
      brandName: brand.name,
      variantId: selectedVariantId,
      variantName: variant.name,
      variantType: variant.variant_type,
      quantity: newTotalQty,
      unitPrice,
      totalPrice: unitPrice * newTotalQty,
      warehouseLocationId: locId,
    };

    setItems([...withoutLine, mergedItem]);

    // Reset item form
    setSelectedBrandId('');
    setSelectedVariantId('');
    setItemQuantity(1);
    setItemUnitPrice(0);
  }

  function removeItem(itemId: string) {
    setItems(items.filter((i) => i.id !== itemId));
  }

  async function handleSubmit() {
    if (!selectedClientId || !selectedShopId || !selectedAddressId || !linkedWarehouseCompanyId) {
      toast({
        variant: 'destructive',
        title: 'Missing information',
        description: 'Please select a client, shop, and delivery address.',
      });
      return;
    }

    if (sourceMode === 'single' && !selectedWarehouseLocationId) {
      toast({
        variant: 'destructive',
        title: 'Warehouse required',
        description: 'Please select a source warehouse.',
      });
      return;
    }

    if (sourceMode === 'multi') {
      const missingLoc = items.find((i) => !i.warehouseLocationId);
      if (missingLoc) {
        toast({
          variant: 'destructive',
          title: 'Warehouse required',
          description: 'Each line must be assigned to a warehouse.',
        });
        return;
      }
    }

    if (items.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No items',
        description: 'Please add at least one item to the order.',
      });
      return;
    }

    if (!user?.company_id) {
      toast({ variant: 'destructive', title: 'Session error', description: 'Missing company context.' });
      return;
    }

    if (!isConsignment && !resolvedPaymentTerms) {
      toast({
        variant: 'destructive',
        title: 'Payment terms required',
        description:
          paymentTermsSource === 'client'
            ? 'This client has no saved payment terms. Switch to custom terms or update the client profile.'
            : 'Enter payment terms for this order.',
      });
      return;
    }

    if (!isConsignment && paymentMethod === 'BANK_TRANSFER' && !bankType) {
      toast({ variant: 'destructive', title: 'Bank required', description: 'Select a bank for bank transfer.' });
      return;
    }

    if (!isConsignment && !paymentProofFile) {
      toast({
        variant: 'destructive',
        title: 'Payment proof required',
        description: 'Please upload an image of the payment proof.',
      });
      return;
    }

    if (!expectedDeliveryDate) {
      toast({
        variant: 'destructive',
        title: 'Expected delivery date required',
        description: 'Please set the expected delivery date.',
      });
      return;
    }

    const computedSubtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const computedTaxAmount = computedSubtotal * (taxRate / 100);
    const computedTotal = computedSubtotal + computedTaxAmount - discount;
    const orderTotalRounded = Math.round(computedTotal * 100) / 100;

    let firstPaymentAmount = orderTotalRounded;
    if (!isConsignment && paymentMode === 'split') {
      const raw = parseFloat(String(splitFirstAmount).replace(/,/g, ''));
      if (!Number.isFinite(raw) || raw <= 0) {
        toast({
          variant: 'destructive',
          title: 'First payment amount',
          description: 'Enter a valid first payment amount for split payment.',
        });
        return;
      }
      firstPaymentAmount = Math.round(raw * 100) / 100;
      if (firstPaymentAmount >= orderTotalRounded) {
        toast({
          variant: 'destructive',
          title: 'Split payment',
          description: 'First payment must be less than the order total. Use full payment if paying everything now.',
        });
        return;
      }
    }

    setSubmitting(true);

    try {
      // Generate PO number using existing DB function
      const { data: poNumber, error: poNumberErr } = await supabase.rpc('generate_po_number', {});
      if (poNumberErr) throw poNumberErr;

      const isDirector = user?.role === 'sales_director';
      const isSalesHead = user?.role === 'sales_head';
      const isKam = user?.role === 'key_account_manager';

      const orderData = {
        company_id: user?.company_id,
        po_number: poNumber,
        supplier_id: null,
        fulfillment_type: 'warehouse_transfer',
        warehouse_company_id: linkedWarehouseCompanyId,
        warehouse_location_id: sourceMode === 'single' ? selectedWarehouseLocationId : null,
        key_account_client_id: selectedClientId,
        key_account_shop_id: selectedShopId,
        key_account_address_id: selectedAddressId,
        kam_id: isKam || isDirector || isSalesHead ? user?.id : null,
        company_account_type: 'Key Accounts',
        workflow_status: isDirector || isSalesHead ? 'admin_pending' : 'kam_pending',
        order_date: orderDate,
        expected_delivery_date: expectedDeliveryDate,
        notes: notes,
        subtotal: computedSubtotal,
        tax_rate: taxRate,
        tax_amount: computedTaxAmount,
        discount: discount,
        total_amount: computedTotal,
        status: 'pending',
        created_by: user?.id,
        po_order_kind: isConsignment ? 'consignment' : 'standard',
        key_account_payment_terms: resolvedPaymentTerms || null,
        // Keep mode so unpaid badge + later "Record payment" work for consignment.
        key_account_payment_mode: isConsignment ? 'full' : paymentMode,
        key_account_payment_status: 'unpaid',
      };

      // Create the purchase order
      const { data: poData, error: poError } = await supabase
        .from('purchase_orders')
        .insert(orderData)
        .select('id')
        .single();

      if (poError) throw poError;

      // Create order items
      const orderItems = items.map((item) => ({
        company_id: user?.company_id,
        purchase_order_id: poData.id,
        variant_id: item.variantId,
        warehouse_location_id:
          sourceMode === 'single'
            ? selectedWarehouseLocationId
            : item.warehouseLocationId || null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
      }));

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      const { logPurchaseOrderEvent } = await import('@/features/orders/purchaseOrderEventsApi');
      void logPurchaseOrderEvent({
        purchaseOrderId: poData.id,
        eventType: 'created',
        lines: items.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
          variant_name: item.variantName,
          brand_name: item.brandName,
        })),
        createdBy: user?.id,
      });

      if (!isConsignment) {
        if (!user.company_id) {
          throw new Error('Missing company context for payment proof upload.');
        }
        if (!paymentProofFile) {
          throw new Error('Payment proof is required.');
        }
        const proofPath = await uploadKeyAccountPaymentProof(user.company_id, poData.id, paymentProofFile);

        const { error: payErr } = await supabase.from('purchase_order_key_account_payments').insert({
          purchase_order_id: poData.id,
          company_id: user.company_id,
          amount: paymentMode === 'full' ? orderTotalRounded : firstPaymentAmount,
          payment_method: paymentMethod,
          bank_type: paymentMethod === 'BANK_TRANSFER' ? bankType : null,
          proof_storage_path: proofPath,
        });
        if (payErr) throw payErr;
      }

      toast({
        title: 'Order created successfully',
        description: isConsignment
          ? `Consignment PO created for ${selectedClient?.client_name} (payment deferred)`
          : `Purchase Order created for ${selectedClient?.client_name}`,
      });

      setConfirmOpen(false);
      navigate('/key-accounts/purchase-orders');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error creating order',
        description: error.message,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const paymentMethodLabel =
    paymentMethod === 'BANK_TRANSFER'
      ? `Bank transfer (${bankType})`
      : paymentMethod === 'GCASH'
        ? 'GCash'
        : paymentMethod === 'CASH'
          ? 'Cash'
          : 'Cheque';

  const firstPaymentPreview =
    paymentMode === 'full'
      ? total
      : Math.round((parseFloat(String(splitFirstAmount).replace(/,/g, '')) || 0) * 100) / 100;

  if (loadingWarehouses) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const selectedClientLabel = selectedClient
    ? `${selectedClient.client_name} (${selectedClient.client_code})`
    : 'Choose a client...';

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create Key Account Order</h1>
        <p className="text-muted-foreground">
          Create a purchase order for your assigned clients with warehouse fulfillment. Turn on
          Consignment to float stock without payment proof at create.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Client & Delivery Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5" />
                Client & Delivery Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Client Select */}
              <div className="space-y-2">
                <Label>Select Client *</Label>
                <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientPickerOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span
                        className={cn(
                          'truncate text-left',
                          !selectedClient && 'text-muted-foreground'
                        )}
                      >
                        {selectedClientLabel}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search client name or code..."
                        value={clientSearch}
                        onValueChange={setClientSearch}
                      />
                      <CommandList>
                        {loadingClients && clients.length === 0 ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <>
                            <CommandEmpty>No client found.</CommandEmpty>
                            <CommandGroup>
                              {clients.map((client) => (
                                <CommandItem
                                  key={client.id}
                                  value={`${client.client_name} ${client.client_code || ''}`}
                                  onSelect={() => handleSelectClient(client)}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4 shrink-0',
                                      selectedClientId === client.id ? 'opacity-100' : 'opacity-0'
                                    )}
                                  />
                                  <span className="truncate">
                                    {client.client_name} ({client.client_code})
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                            {clientsHasMore && (
                              <div className="border-t p-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="w-full"
                                  disabled={loadingMoreClients || loadingClients}
                                  onMouseDown={(e) => {
                                    // Keep popover open while loading more
                                    e.preventDefault();
                                  }}
                                  onClick={() => void fetchClients({ append: true })}
                                >
                                  {loadingMoreClients ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Loading...
                                    </>
                                  ) : (
                                    'See more'
                                  )}
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Shop Select */}
              {selectedClientId && (
                <div className="space-y-2">
                  <Label>Select Shop *</Label>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <Select value={selectedShopId} onValueChange={setSelectedShopId}>
                      <SelectTrigger className="sm:flex-1 w-full">
                        <SelectValue placeholder="Choose a shop..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredShops.map((shop) => (
                          <SelectItem key={shop.id} value={shop.id}>
                            {shop.shop_name} - {shop.city}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 w-full sm:w-auto"
                      onClick={() => setShopDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add shop
                    </Button>
                  </div>
                  {filteredShops.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No shops for this client yet. Use Add shop to create one here.
                    </p>
                  )}
                </div>
              )}

              {/* Address Select */}
              {selectedShopId && (
                <div className="space-y-2">
                  <Label>Delivery Address *</Label>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                    <Select value={selectedAddressId} onValueChange={setSelectedAddressId}>
                      <SelectTrigger className="sm:flex-1 w-full">
                        <SelectValue placeholder="Choose a delivery address..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredAddresses.map((address) => (
                          <SelectItem key={address.id} value={address.id}>
                            {address.address_label} {address.is_default && '(Default)'}-{' '}
                            {address.full_address}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 w-full sm:w-auto"
                      onClick={() => setAddressDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add address
                    </Button>
                  </div>
                  {filteredAddresses.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No delivery addresses for this shop yet. Use Add address to create one here.
                    </p>
                  )}
                  {selectedAddress && (
                    <div className="text-sm text-muted-foreground mt-2 p-3 bg-muted rounded-md">
                      <p className="font-medium">{selectedAddress.full_address}</p>
                      <p>
                        {selectedAddress.city}, {selectedAddress.province} {selectedAddress.zip_code}
                      </p>
                      <p>Contact: {selectedAddress.contact_name} - {selectedAddress.contact_phone}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Warehouse Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5" />
                Source Warehouse
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Source mode</Label>
                <RadioGroup
                  value={sourceMode}
                  onValueChange={(v) => setSourceMode(v as 'single' | 'multi')}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                >
                  <label
                    className={cn(
                      'flex items-center gap-2 rounded-md border bg-background p-3',
                      sourceMode === 'single' && 'border-primary'
                    )}
                  >
                    <RadioGroupItem value="single" />
                    <span className="text-sm font-medium">Single warehouse</span>
                  </label>
                  <label
                    className={cn(
                      'flex items-center gap-2 rounded-md border bg-background p-3',
                      sourceMode === 'multi' && 'border-primary'
                    )}
                  >
                    <RadioGroupItem value="multi" />
                    <span className="text-sm font-medium">Multiple warehouses</span>
                  </label>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  Single uses one warehouse for all lines. Multiple lets you add items per warehouse tab.
                </p>
              </div>

              {sourceMode === 'single' && (
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <div className="space-y-2 flex-1 min-w-[220px]">
                    <Label>Select warehouse *</Label>
                    <Select value={selectedWarehouseLocationId} onValueChange={setSelectedWarehouseLocationId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose source warehouse..." />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.location_id}>
                            {warehouse.location_name} {warehouse.is_main && '(Main)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStockModalOpen(true)}
                    disabled={!stockViewLocationId || visibleVariants.length === 0}
                  >
                    View stock
                  </Button>
                </div>
              )}

              {sourceMode === 'multi' && warehouses.length > 0 && (
                <p className="text-xs text-muted-foreground italic">
                  Use the warehouse tabs under Order Items to add products from each location.
                </p>
              )}

              {warehouses.length === 0 && (
                <p className="text-sm text-red-500">
                  No warehouses linked to your company. Please contact your administrator.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5" />
                Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div className="space-y-1 min-w-0">
                  <Label htmlFor="consignment-po-toggle" className="text-sm font-medium">
                    Consignment PO
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Float stock to the client now. Warehouse still fulfills this PO; payment can be recorded later.
                    Consignment amounts are excluded from revenue/analytics until payment-based recognition is added.
                  </p>
                </div>
                <Switch
                  id="consignment-po-toggle"
                  checked={isConsignment}
                  onCheckedChange={setIsConsignment}
                  className="mt-0.5 shrink-0"
                />
              </div>

              {isConsignment ? (
                <p className="text-sm rounded-md border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100 p-3">
                  Payment proof is not required at create. Status will stay <span className="font-medium">unpaid</span>{' '}
                  until you record payment on the PO later.
                </p>
              ) : null}

              <div className="space-y-2">
                <Label>Payment terms{isConsignment ? ' (optional)' : ' *'}</Label>
                <Select
                  value={paymentTermsSource}
                  onValueChange={(v) => setPaymentTermsSource(v as 'client' | 'custom')}
                  disabled={!selectedClientId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose how to set terms…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Use client profile terms</SelectItem>
                    <SelectItem value="custom">Custom terms for this PO</SelectItem>
                  </SelectContent>
                </Select>
                {paymentTermsSource === 'client' ? (
                  <p className="text-sm text-muted-foreground rounded-md border bg-muted/40 p-3">
                    {selectedClient?.payment_terms?.trim()
                      ? selectedClient.payment_terms.trim()
                      : 'No payment terms on file for this client — choose custom terms or update the client record.'}
                  </p>
                ) : (
                  <Textarea
                    value={paymentTermsCustom}
                    onChange={(e) => setPaymentTermsCustom(e.target.value)}
                    placeholder="e.g. Net 30, COD, 50% down…"
                    rows={3}
                  />
                )}
              </div>

              {!isConsignment ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Payment mode *</Label>
                      <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as KeyAccountPoPaymentMode)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full">Full (pay order total now)</SelectItem>
                          <SelectItem value="split">Split (first installment now)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Payment method *</Label>
                      <Select
                        value={paymentMethod}
                        onValueChange={(v) =>
                          setPaymentMethod(v as 'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE')
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GCASH">GCash</SelectItem>
                          <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                          <SelectItem value="CASH">Cash</SelectItem>
                          <SelectItem value="CHEQUE">Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {paymentMethod === 'BANK_TRANSFER' && (
                    <div className="space-y-2">
                      <Label>Bank *</Label>
                      <Select value={bankType} onValueChange={(v) => setBankType(v as 'Unionbank' | 'BPI' | 'PBCOM')}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Unionbank">Unionbank</SelectItem>
                          <SelectItem value="BPI">BPI</SelectItem>
                          <SelectItem value="PBCOM">PBCOM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {paymentMode === 'split' && (
                    <div className="space-y-2">
                      <Label>First payment amount (₱) *</Label>
                      <Input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={splitFirstAmount}
                        onChange={(e) => setSplitFirstAmount(e.target.value)}
                        placeholder="Less than order total"
                      />
                      <p className="text-xs text-muted-foreground">
                        Order total after tax/discount: <span className="font-medium">₱{total.toFixed(2)}</span>. You can
                        record the balance later when the PO is warehouse reserved, fulfilled, or delivered.
                      </p>
                    </div>
                  )}

                  {paymentMode === 'full' && (
                    <p className="text-sm text-muted-foreground">
                      First payment will be the full order total: <span className="font-medium">₱{total.toFixed(2)}</span>.
                    </p>
                  )}

                  <KeyAccountPaymentProofUploadField
                    file={paymentProofFile}
                    onFileChange={setPaymentProofFile}
                    inputId="create-po-payment-proof"
                    label="Payment proof *"
                  />
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* Warehouse stock modal (dashboard-style) */}
          <Dialog open={stockModalOpen} onOpenChange={setStockModalOpen}>
            <DialogContent className="max-w-[95vw] w-[1100px] max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Warehouse stock</DialogTitle>
                <DialogDescription>
                  Numbers show <span className="font-medium text-foreground">available to order</span>
                  {' '}(on hand minus open / pending PO commitments).
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-muted-foreground">
                  {selectedWarehouse?.location_name ? (
                    <>
                      Viewing available stock for{' '}
                      <span className="font-medium text-foreground">{selectedWarehouse.location_name}</span>
                      {selectedWarehouse.is_main ? ' (Main)' : ''}
                      {stockLoading ? <span className="ml-2 text-xs">(refreshing…)</span> : null}
                    </>
                  ) : (
                    'Select a warehouse to view stock.'
                  )}
                </div>
                <div className="w-full sm:w-[320px]">
                  <Input
                    placeholder="Filter brands or variant names…"
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-2">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm bg-destructive" />
                  Out of stock
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm bg-amber-400" />
                  Low stock
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm bg-emerald-600" />
                  Available
                </span>
              </div>

              <div className="flex-1 overflow-auto mt-4 pb-2">
                {(() => {
                  const q = stockSearch.trim().toLowerCase();
                  const brandsToShow = visibleBrands.filter((b) => {
                    if (!q) return true;
                    if (String(b.name || '').toLowerCase().includes(q)) return true;
                    const vars = visibleVariants.filter((v) => v.brand_id === b.id);
                    return vars.some((v) => String(v.name || '').toLowerCase().includes(q));
                  });

                  if (!stockViewLocationId) {
                    return <div className="py-10 text-center text-muted-foreground">Select a warehouse to view stock.</div>;
                  }

                  if (brandsToShow.length === 0) {
                    return (
                      <div className="py-10 text-center text-muted-foreground">
                        {q ? 'No brands match your filter.' : 'No stocked brands found for this warehouse.'}
                      </div>
                    );
                  }

                  const typeSort = (t: string) => {
                    const x = String(t || '').toLowerCase();
                    if (x === 'flavor') return 0;
                    if (x === 'battery') return 1;
                    if (x === 'posm') return 2;
                    return 99;
                  };

                  const displayedStockFor = (variantId: string) => {
                    const stock = getVariantStock(variantId, stockViewLocationId);
                    return stock ?? 0;
                  };

                  const totalLabelForType = (t: string) => {
                    const x = String(t || '').toLowerCase();
                    if (x === 'flavor') return 'TOTAL PODS';
                    if (x === 'battery') return 'TOTAL DEVICE';
                    return `TOTAL ${String(t || '').toUpperCase()}`;
                  };

                  const groupByType = (brandId: string) => {
                    const brandVars = visibleVariants
                      .filter((v) => v.brand_id === brandId)
                      .slice()
                      .sort((a, b) => {
                        const ta = typeSort(a.variant_type);
                        const tb = typeSort(b.variant_type);
                        if (ta !== tb) return ta - tb;
                        return String(a.name || '').localeCompare(String(b.name || ''));
                      });

                    const m = new Map<string, any[]>();
                    for (const v of brandVars) {
                      const key = v.variant_type || 'unknown';
                      if (!m.has(key)) m.set(key, []);
                      m.get(key)!.push(v);
                    }
                    return Array.from(m.entries()).filter(([, list]) => list.length > 0);
                  };

                  return (
                    <div className="flex flex-row items-stretch gap-4 min-w-max">
                      {brandsToShow.map((brand) => {
                        const typeEntries = groupByType(brand.id);
                        return (
                          <div
                            key={brand.id}
                            className="flex shrink-0 flex-col rounded-lg border border-border bg-card shadow-sm overflow-hidden w-[min(100%,620px)]"
                          >
                            <div className="shrink-0 bg-primary px-2 py-2.5 text-center text-xs font-bold uppercase leading-snug text-primary-foreground">
                              {brand.name}
                            </div>

                            <div className="flex min-h-[180px] flex-1 divide-x divide-border bg-muted/20">
                              {typeEntries.map(([typeKey, list]) => {
                                const sum = (list as any[]).reduce((s, v) => s + displayedStockFor(v.id), 0);
                                return (
                                  <div key={typeKey} className="flex min-h-0 min-w-[7.5rem] flex-1 flex-col">
                                    <div className="max-h-[min(55vh,520px)] min-h-[120px] flex-1 overflow-y-auto overflow-x-hidden">
                                      {(list as any[]).map((v) => {
                                        const available = displayedStockFor(v.id);
                                        const reserved = getVariantReserved(v.id, stockViewLocationId);
                                        const onHand = getVariantOnHand(v.id, stockViewLocationId);
                                        const title =
                                          reserved > 0
                                            ? `Available ${available.toLocaleString()} (on hand ${(onHand ?? available + reserved).toLocaleString()}, ${reserved.toLocaleString()} held on open POs)`
                                            : `Available ${available.toLocaleString()}`;
                                        return (
                                          <div
                                            key={v.id}
                                            className="flex items-center gap-2 border-b border-border px-2 py-1.5 text-xs leading-snug min-h-[2.25rem]"
                                            title={title}
                                          >
                                            <span className="flex-1 min-w-0 text-left font-medium text-foreground break-words">
                                              {v.name}
                                            </span>
                                            <span
                                              className={[
                                                'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums min-w-[2.75rem] text-center',
                                                stockBadgeClass(available),
                                              ].join(' ')}
                                            >
                                              {available.toLocaleString()}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-primary/20 bg-primary px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                                      <span className="min-w-0 leading-tight">{totalLabelForType(typeKey)}:</span>
                                      <span className="shrink-0 tabular-nums">{sum.toLocaleString()}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </DialogContent>
          </Dialog>

          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5" />
                Order Items
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {sourceMode === 'multi' && warehouses.length > 0 && (
                <div className="border rounded-md bg-muted/30 px-3 py-2">
                  <Tabs value={activeWarehouseTabId} onValueChange={setActiveWarehouseTabId}>
                    <TabsList className="w-full justify-start overflow-x-auto">
                      {warehouses.map((warehouse) => (
                        <TabsTrigger key={warehouse.location_id} value={warehouse.location_id} className="shrink-0">
                          {warehouse.location_name}
                          {warehouse.is_main ? ' (Main)' : ''}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              )}

              {/* Add Item Form */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-muted rounded-lg">
                {/* Brand Select */}
                <div className="space-y-2">
                  <Label className="text-sm">Brand</Label>
                  <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Brand..." />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleBrands.map((brand) => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Variant Select */}
                <div className="space-y-2">
                  <Label className="text-sm">Variant</Label>
                  <Select
                    value={selectedVariantId}
                    onValueChange={setSelectedVariantId}
                    disabled={!selectedBrandId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Variant..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredVariants.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          <div className="flex items-center justify-between gap-3 w-full">
                            <span className="min-w-0 truncate">
                              {variant.name} ({variant.variant_type})
                            </span>
                            {activeLocationId ? (
                              <span
                                className={[
                                  'shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums min-w-[2.75rem] text-center',
                                  stockBadgeClass(getVariantStock(variant.id, activeLocationId) ?? 0),
                                ].join(' ')}
                                title="Stock in selected warehouse"
                              >
                                {getVariantStock(variant.id, activeLocationId) ?? 0}
                              </span>
                            ) : null}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quantity */}
                <div className="space-y-2">
                  <Label className="text-sm">Quantity</Label>
                  <Input
                    type="number"
                    min={1}
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(parseInt(e.target.value) || 0)}
                  />
                </div>

                {/* Unit Price */}
                <div className="space-y-2">
                  <Label className="text-sm">Unit Price</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={itemUnitPrice || ''}
                    placeholder="0.00"
                    onChange={(e) => setItemUnitPrice(parseFloat(e.target.value) || 0)}
                  />
                </div>

                {/* Add Button */}
                <div className="flex items-end">
                  <Button onClick={addItem} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
              </div>

              {/* Items Table */}
              {items.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Variant</TableHead>
                      {sourceMode === 'multi' && <TableHead>Warehouse</TableHead>}
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(sourceMode === 'multi' ? displayedItems : items).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.brandName}</TableCell>
                        <TableCell>{item.variantName}</TableCell>
                        {sourceMode === 'multi' && (
                          <TableCell className="text-sm text-muted-foreground">
                            {warehouseLabel(item.warehouseLocationId)}
                          </TableCell>
                        )}
                        <TableCell>{item.variantType}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">
                          ₱{item.unitPrice.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ₱{item.totalPrice.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {sourceMode === 'multi' && !activeWarehouseTabId
                    ? 'Select a warehouse tab, then add products above.'
                    : 'No items added yet. Select products above to add to your order.'}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Order Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Order Dates */}
              <div className="space-y-2">
                <Label>Order Date *</Label>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Expected Delivery Date *</Label>
                <Input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                />
              </div>

              {/* Totals */}
              <div className="pt-4 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>₱{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span>Tax ({taxRate}%)</span>
                  <div className="flex items-center gap-2">
                    <span>₱{taxAmount.toFixed(2)}</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-16 h-6 text-xs"
                    />
                  </div>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span>Discount</span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                    className="w-24 h-6 text-xs"
                  />
                </div>
                <div className="flex justify-between font-bold text-lg pt-2 border-t">
                  <span>Total</span>
                  <span>₱{total.toFixed(2)}</span>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2 pt-4">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any special instructions..."
                  rows={3}
                />
              </div>

              {/* Submit Button */}
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={
                  submitting ||
                  !selectedClientId ||
                  !selectedShopId ||
                  !selectedAddressId ||
                  (sourceMode === 'single' && !selectedWarehouseLocationId) ||
                  (sourceMode === 'multi' && items.some((i) => !i.warehouseLocationId)) ||
                  items.length === 0 ||
                  (!isConsignment && !paymentProofFile) ||
                  !expectedDeliveryDate
                }
                className="w-full"
                size="lg"
              >
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isConsignment ? 'Create Consignment PO' : 'Create Purchase Order'}
                </>
              </Button>
            </CardContent>
          </Card>

          {/* Selected Info Summary */}
          {(selectedClient || selectedShop || selectedAddress) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Selected Delivery</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {selectedClient && (
                  <div>
                    <p className="font-medium">{selectedClient.client_name}</p>
                    <p className="text-muted-foreground">{selectedClient.client_code}</p>
                  </div>
                )}
                {selectedShop && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      <span className="font-medium">{selectedShop.shop_name}</span>
                    </div>
                    <p className="text-muted-foreground ml-6">{selectedShop.city}, {selectedShop.province}</p>
                  </div>
                )}
                {selectedAddress && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span className="font-medium">{selectedAddress.address_label}</span>
                      {selectedAddress.is_default && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Default</span>
                      )}
                    </div>
                    <p className="text-muted-foreground ml-6">{selectedAddress.full_address}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (submitting) return;
          setConfirmOpen(open);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm purchase order</DialogTitle>
            <DialogDescription>
              Are you sure you want to create this purchase order? Review the summary below before confirming.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="space-y-1 rounded-md border p-3">
              <p className="font-medium">{selectedClient?.client_name || '—'}</p>
              <p className="text-muted-foreground">{selectedClient?.client_code}</p>
              <div className="pt-2 border-t space-y-1">
                <p>
                  <span className="text-muted-foreground">Shop:</span> {selectedShop?.shop_name || '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Address:</span>{' '}
                  {selectedAddress
                    ? `${selectedAddress.address_label} — ${selectedAddress.full_address}`
                    : '—'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
              <div>
                <p className="text-muted-foreground text-xs">Order date</p>
                <p className="font-medium">{orderDate || '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Expected delivery</p>
                <p className="font-medium">{expectedDeliveryDate || '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs">Warehouse</p>
                <p className="font-medium">
                  {sourceMode === 'single'
                    ? warehouseLabel(selectedWarehouseLocationId)
                    : 'Multiple warehouses (per line item)'}
                </p>
              </div>
            </div>

            <div className="space-y-1 rounded-md border p-3">
              <p>
                <span className="text-muted-foreground">Order type:</span>{' '}
                {isConsignment ? 'Consignment (payment deferred)' : 'Standard'}
              </p>
              <p>
                <span className="text-muted-foreground">Payment terms:</span> {resolvedPaymentTerms || '—'}
              </p>
              {isConsignment ? (
                <p className="text-muted-foreground">
                  No payment proof required at create. Record payment later on the PO.
                </p>
              ) : (
                <>
                  <p>
                    <span className="text-muted-foreground">Payment mode:</span>{' '}
                    {paymentMode === 'full' ? 'Full payment' : 'Split payment'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Method:</span> {paymentMethodLabel}
                  </p>
                  <p>
                    <span className="text-muted-foreground">First payment:</span> ₱{firstPaymentPreview.toFixed(2)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Payment proof:</span>{' '}
                    {paymentProofFile?.name || '—'}
                  </p>
                </>
              )}
            </div>

            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.variantName}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.brandName}
                          {sourceMode === 'multi' ? ` · ${warehouseLabel(item.warehouseLocationId)}` : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{item.quantity}</TableCell>
                      <TableCell className="text-right">₱{item.totalPrice.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1 rounded-md border p-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>₱{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax ({taxRate}%)</span>
                <span>₱{taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>₱{discount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold text-base pt-2 border-t">
                <span>Total</span>
                <span>₱{total.toFixed(2)}</span>
              </div>
            </div>

            {notes.trim() ? (
              <div className="rounded-md border p-3">
                <p className="text-muted-foreground text-xs mb-1">Notes</p>
                <p className="whitespace-pre-wrap">{notes.trim()}</p>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={submitting} onClick={() => void handleSubmit()}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Order...
                </>
              ) : (
                'Confirm & Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedClientId ? (
        <KeyAccountAddShopDialog
          open={shopDialogOpen}
          onOpenChange={setShopDialogOpen}
          clientId={selectedClientId}
          clientName={selectedClient?.client_name}
          createdBy={user?.id}
          onCreated={(shop) => void handleShopCreated(shop)}
        />
      ) : null}

      {selectedShopId ? (
        <KeyAccountAddAddressDialog
          open={addressDialogOpen}
          onOpenChange={setAddressDialogOpen}
          shopId={selectedShopId}
          shopName={selectedShop?.shop_name}
          onCreated={(address) => void handleAddressCreated(address)}
        />
      ) : null}
    </div>
  );
}
