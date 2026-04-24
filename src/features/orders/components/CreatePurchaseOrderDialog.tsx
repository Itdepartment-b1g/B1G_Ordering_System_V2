
import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus, Loader2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Package, FileText } from 'lucide-react';

// Types
import type { Supplier } from '../types';

interface BrandVariant {
    id: string;
    name: string;
    variant_type: 'flavor' | 'battery' | 'posm';
    brand_id: string;
    brand_name: string;
}

interface NewPOItem {
    id: string; // temporary ID for the list
    brandId: string; // 'new' or UUID
    brandName: string;
    variantId: string; // 'new' or UUID
    variantName: string;
    // Value from `variant_types.name` (e.g. 'flavor', 'battery', 'posm')
    // Stored as string so UI can handle empty variant type configuration gracefully.
    variantType: string;
    quantity: number;
    unitPrice: number;
    /** Source warehouse location for this line (warehouse_transfer only). */
    warehouseLocationId?: string;
}

interface CreatePurchaseOrderDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    suppliers: Supplier[];
    user: any;
    /** When set, user can choose internal transfer from this hub company catalog. */
    linkedWarehouseCompanyId: string | null;
    onCreateOrder: (orderData: {
        supplier_id: string | null;
        fulfillment_type: 'supplier' | 'warehouse_transfer';
        warehouse_company_id?: string | null;
        warehouse_location_id?: string | null;
        order_date: string;
        expected_delivery_date: string;
        items: Array<{ variant_id: string; quantity: number; unit_price: number; warehouse_location_id?: string | null }>;
        tax_rate: number;
        discount: number;
        notes: string;
    }) => Promise<{ success: boolean; error?: string }>;
    refreshData: () => void;
}

export function CreatePurchaseOrderDialog({
    open,
    onOpenChange,
    suppliers,
    user,
    linkedWarehouseCompanyId,
    onCreateOrder,
    refreshData
}: CreatePurchaseOrderDialogProps) {
    const { toast } = useToast();

    const [fulfillmentMode, setFulfillmentMode] = useState<'supplier' | 'warehouse_transfer'>(
        linkedWarehouseCompanyId ? 'warehouse_transfer' : 'supplier'
    );
    const catalogCompanyId =
        fulfillmentMode === 'warehouse_transfer' && linkedWarehouseCompanyId
            ? linkedWarehouseCompanyId
            : user?.company_id ?? null;

    const [availableVariants, setAvailableVariants] = useState<BrandVariant[]>([]);
    const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);

    const [warehouseLocations, setWarehouseLocations] = useState<Array<{ id: string; name: string; is_main: boolean }>>([]);
    const [mainWarehouseLocationId, setMainWarehouseLocationId] = useState<string>('');
    const [selectedWarehouseLocationId, setSelectedWarehouseLocationId] = useState<string>('');
    const [sourceMode, setSourceMode] = useState<'single' | 'multi'>('single');
    const [activeWarehouseTabId, setActiveWarehouseTabId] = useState<string>('');

    // Form State
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [expectedDelivery, setExpectedDelivery] = useState('');
    const [selectedSupplierId, setSelectedSupplierId] = useState('');
    const [selectedSourceValue, setSelectedSourceValue] = useState<string>(''); // 'sup:<id>' | 'wh:<locationId>'
    const [taxRate, setTaxRate] = useState(0);
    const [discount, setDiscount] = useState(0);
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Items State
    const [items, setItems] = useState<NewPOItem[]>([]);

    // Stock State: map of `${variantId}::${locationId}` to stock quantity
    const [itemStockMap, setItemStockMap] = useState<Record<string, number>>({});

    // Keep item-level location in sync with source mode and default selection.
    useEffect(() => {
        if (!open) return;
        if (fulfillmentMode !== 'warehouse_transfer') return;
        setItems(prev =>
            prev.map(i => {
                if (sourceMode === 'single') {
                    return { ...i, warehouseLocationId: selectedWarehouseLocationId || i.warehouseLocationId };
                }
                // multi
                if (!i.warehouseLocationId) {
                    return { ...i, warehouseLocationId: selectedWarehouseLocationId || i.warehouseLocationId };
                }
                return i;
            })
        );
    }, [open, fulfillmentMode, sourceMode, selectedWarehouseLocationId]);

    // Add Existing Dialog State
    const [addExistingOpen, setAddExistingOpen] = useState(false);
    const [selectedBrandForExisting, setSelectedBrandForExisting] = useState<string>('');

    // Clear All Confirmation State
    const [clearAllOpen, setClearAllOpen] = useState(false);

    // Fetch stock data for items when they change or warehouse selection changes
    useEffect(() => {
        if (!open || fulfillmentMode !== 'warehouse_transfer' || !linkedWarehouseCompanyId) {
            setItemStockMap({});
            return;
        }

        // Fetch stock for ALL available variants (catalog) + items already added
        // This ensures the "Add Existing" dialog can filter brands by available stock
        const itemVariantIds = items.map(i => i.variantId).filter(Boolean);
        const catalogVariantIds = availableVariants.map(v => v.id);
        const variantIds = Array.from(new Set([...itemVariantIds, ...catalogVariantIds]));
        if (variantIds.length === 0) {
            setItemStockMap({});
            return;
        }

        let cancelled = false;
        (async () => {
            // Fetch stock from both main_inventory and warehouse_location_inventory
            const [{ data: mainInvData, error: mainInvError }, { data: locInvData, error: locInvError }] = await Promise.all([
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
            ]);

            console.log('[CreatePO] Stock fetch debug:', {
                linkedWarehouseCompanyId,
                mainWarehouseLocationId,
                selectedWarehouseLocationId,
                variantIds,
                mainInvData,
                mainInvDataCount: mainInvData?.length || 0,
                locInvDataCount: locInvData?.length || 0,
                mainInvError: mainInvError?.message || mainInvError,
                locInvError: locInvError?.message || locInvError,
            });

            if (cancelled) return;

            const stockMap: Record<string, number> = {};

            // Map main inventory stock (location_id = main warehouse id)
            // Calculate available = stock - allocated_stock
            if (mainWarehouseLocationId && mainInvData) {
                for (const row of mainInvData) {
                    const key = `${row.variant_id}::${mainWarehouseLocationId}`;
                    const stock = row.stock || 0;
                    const allocated = row.allocated_stock || 0;
                    stockMap[key] = Math.max(0, stock - allocated);
                }
                console.log('[CreatePO] Main inventory mapped:', mainInvData.map(r => {
                    const stock = r.stock || 0;
                    const allocated = r.allocated_stock || 0;
                    return { var: r.variant_id, stock, allocated, available: stock - allocated, key: `${r.variant_id}::${mainWarehouseLocationId}` };
                }));
            } else {
                console.log('[CreatePO] Main inventory NOT mapped:', { mainWarehouseLocationId: !!mainWarehouseLocationId, hasData: !!mainInvData });
            }

            // Map sub-warehouse inventory stock
            if (locInvData) {
                for (const row of locInvData) {
                    const key = `${row.variant_id}::${row.location_id}`;
                    stockMap[key] = row.stock || 0;
                }
            }

            console.log('[CreatePO] Final stockMap keys:', Object.keys(stockMap));
            setItemStockMap(stockMap);
        })();

        return () => {
            cancelled = true;
        };
    }, [open, items, availableVariants, selectedWarehouseLocationId, activeWarehouseTabId, fulfillmentMode, linkedWarehouseCompanyId, warehouseLocations, mainWarehouseLocationId]);

    // Helper to get stock for an item
    const getItemStock = (variantId: string, warehouseLocationId?: string) => {
        const locId = warehouseLocationId || selectedWarehouseLocationId;
        if (!locId || !variantId) return null;
        const key = `${variantId}::${locId}`;
        return itemStockMap[key] ?? null;
    };

    // Variant Types for new item creation
    const [variantTypes, setVariantTypes] = useState<{ id: string; name: string; display_name?: string }[]>([]);

    // When creating a warehouse transfer PO as a non-warehouse user, we should only allow selecting
    // existing SKUs from the hub catalog (no creating new brands/variants from this dialog).
    const readOnlyCatalogEdits = fulfillmentMode === 'warehouse_transfer' && user?.role !== 'warehouse';

    useEffect(() => {
        if (open && !linkedWarehouseCompanyId) {
            setFulfillmentMode('supplier');
        }
    }, [open, linkedWarehouseCompanyId]);

    useEffect(() => {
        if (!open || !linkedWarehouseCompanyId) {
            setWarehouseLocations([]);
            setSelectedWarehouseLocationId('');
            setSourceMode('single');
            setActiveWarehouseTabId('');
            return;
        }
        supabase
            .rpc('get_linked_warehouse_locations', {})
            .then(({ data, error }) => {
                if (error) {
                    console.error('[CreatePO] get_linked_warehouse_locations error', error);
                    setWarehouseLocations([]);
                    setSelectedWarehouseLocationId('');
                    return;
                }
                const rows = (data as any) || [];
                console.log('[CreatePO] Linked Warehouse Locations loaded:', rows.map((r: any) => ({ id: r.id, name: r.name, is_main: r.is_main })));
                setWarehouseLocations(rows);
                // Store main warehouse location ID for stock lookups
                const main = rows.find((r: any) => r.is_main);
                if (main?.id) {
                    setMainWarehouseLocationId(main.id);
                }
                // Default to main warehouse location if not selected yet.
                if (!selectedWarehouseLocationId) {
                    setSelectedWarehouseLocationId(main?.id || rows[0]?.id || '');
                }
                // Default active tab (used in multi mode): main if present, otherwise first.
                if (!activeWarehouseTabId) {
                    setActiveWarehouseTabId(main?.id || rows[0]?.id || '');
                }
            });
    }, [open, linkedWarehouseCompanyId, selectedWarehouseLocationId, activeWarehouseTabId]);

    // (location stock fetch for existing-variants dialog is defined below, after filteredVariantsForDialog)

    useEffect(() => {
        if (!open || !catalogCompanyId) {
            setVariantTypes([]);
            return;
        }
        supabase
            .from('variant_types')
            .select('id, name, display_name, is_active, sort_order')
            .eq('company_id', catalogCompanyId)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
            .then(({ data }) => setVariantTypes((data as any) || []));
    }, [open, catalogCompanyId]);

    useEffect(() => {
        if (!open || !catalogCompanyId) {
            setAvailableVariants([]);
            setBrands([]);
            return;
        }
        let cancelled = false;
        setCatalogLoading(true);
        (async () => {
            try {
                const [{ data: vData, error: vErr }, { data: bData, error: bErr }] = await Promise.all([
                    supabase
                        .from('variants')
                        .select(`
              id,
              name,
              variant_type,
              brands (
                id,
                name
              )
            `)
                        .eq('company_id', catalogCompanyId)
                        .eq('is_active', true)
                        .order('name'),
                    supabase.from('brands').select('id, name').eq('company_id', catalogCompanyId).eq('is_active', true).order('name'),
                ]);
                if (cancelled) return;
                if (vErr) throw vErr;
                if (bErr) throw bErr;
                const formattedVariants: BrandVariant[] = (vData || []).map((v: any) => ({
                    id: v.id,
                    name: v.name,
                    variant_type: String(v.variant_type || 'flavor').toLowerCase() as 'flavor' | 'battery' | 'posm',
                    brand_id: v.brands?.id || '',
                    brand_name: v.brands?.name || 'Unknown',
                }));
                setAvailableVariants(formattedVariants);
                setBrands(bData || []);
            } catch (e) {
                console.error(e);
                if (!cancelled) {
                    setAvailableVariants([]);
                    setBrands([]);
                }
            } finally {
                if (!cancelled) setCatalogLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, catalogCompanyId]);

    // Initialize Supplier (supplier mode only)
    useEffect(() => {
        if (open && fulfillmentMode === 'supplier' && !selectedSupplierId) {
            const defaultSupplier = suppliers.find(s => s.company_name === 'B1G Corporation');
            if (defaultSupplier) {
                setSelectedSupplierId(defaultSupplier.id);
            } else if (suppliers[0]) {
                setSelectedSupplierId(suppliers[0].id);
            }
        }
    }, [open, suppliers, selectedSupplierId, fulfillmentMode]);

    // Keep unified source selector in sync with fulfillment mode + selection.
    useEffect(() => {
        if (!open) return;
        if (fulfillmentMode === 'warehouse_transfer') {
            if (selectedWarehouseLocationId) setSelectedSourceValue(`wh:${selectedWarehouseLocationId}`);
            return;
        }
        if (selectedSupplierId) setSelectedSourceValue(`sup:${selectedSupplierId}`);
    }, [open, fulfillmentMode, selectedSupplierId, selectedWarehouseLocationId]);

    // Calculations
    const subtotal = useMemo(() => items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0), [items]);
    const taxAmount = (subtotal * taxRate) / 100;
    const totalAmount = subtotal + taxAmount - discount;

    // Handlers
    const handleAddItem = () => {
        const defaultVariantType = variantTypes[0]?.name || '';
        const newItem: NewPOItem = {
            id: crypto.randomUUID(),
            brandId: '',
            brandName: '',
            variantId: '',
            variantName: '',
            variantType: defaultVariantType,
            quantity: 0,
            unitPrice: 0,
        };
        setItems([...items, newItem]);
    };

    const handleRemoveItem = (id: string) => {
        setItems(items.filter(i => i.id !== id));
    };

    const displayedItems = useMemo(() => {
        if (fulfillmentMode !== 'warehouse_transfer' || sourceMode !== 'multi') return items;
        return items.filter(i => i.warehouseLocationId === activeWarehouseTabId);
    }, [items, fulfillmentMode, sourceMode, activeWarehouseTabId]);

    // Filter brands for "Add Existing" dialog - only show brands with available stock in selected warehouse
    const filteredBrandsForDialog = useMemo(() => {
        if (fulfillmentMode !== 'warehouse_transfer') return brands;
        
        const targetLocationId = sourceMode === 'multi' ? activeWarehouseTabId : selectedWarehouseLocationId;
        if (!targetLocationId) return brands;
        
        // Get all variants that have stock > 0 in the selected warehouse
        const variantsWithStock = availableVariants.filter(v => {
            const stock = getItemStock(v.id, targetLocationId);
            return stock !== null && stock > 0;
        });
        
        // Get unique brand IDs from variants with stock
        const brandIdsWithStock = new Set(variantsWithStock.map(v => v.brand_id));
        
        // Filter brands to only those with available stock
        return brands.filter(b => brandIdsWithStock.has(b.id));
    }, [brands, availableVariants, fulfillmentMode, sourceMode, activeWarehouseTabId, selectedWarehouseLocationId, itemStockMap]);

    const handleAddBrandVariants = () => {
        if (!selectedBrandForExisting) return;

        const targetLocationId =
            fulfillmentMode === 'warehouse_transfer'
                ? (sourceMode === 'multi' ? activeWarehouseTabId : selectedWarehouseLocationId)
                : '';

        const variantsForBrand = availableVariants.filter((v) => v.brand_id === selectedBrandForExisting);
        if (variantsForBrand.length === 0) {
            toast({ title: 'No items', description: 'No variants found for this brand.', variant: 'destructive' });
            return;
        }

        const keyOf = (variantId: string, locId: string) => `${variantId}::${locId || ''}`;
        const existingKeys = new Set(items.map((i) => keyOf(i.variantId, i.warehouseLocationId || '')));

        // Filter variants: show all that EXIST in the warehouse inventory (stock !== null, even if 0)
        // For warehouse_transfer: only show variants with inventory records at the selected warehouse
        // For supplier: show all variants from the brand
        const variantsToAdd = variantsForBrand.filter((v) => {
            if (existingKeys.has(keyOf(v.id, targetLocationId || ''))) return false;
            if (fulfillmentMode === 'warehouse_transfer') {
                const stock = getItemStock(v.id, targetLocationId || undefined);
                // Only include if variant has an inventory record at this warehouse (stock !== null)
                return stock !== null;
            }
            return true;
        });

        if (variantsToAdd.length === 0) {
            const msg = fulfillmentMode === 'warehouse_transfer'
                ? 'No variants exist at this warehouse for the selected brand.'
                : 'No new variants found for this brand.';
            toast({ title: 'No items', description: msg, variant: 'destructive' });
            return;
        }

        const newItems: NewPOItem[] = variantsToAdd.map((variant) => ({
            id: crypto.randomUUID(),
            brandId: variant.brand_id,
            brandName: variant.brand_name,
            variantId: variant.id,
            variantName: variant.name,
            variantType: variant.variant_type,
            quantity: 0,
            unitPrice: 0,
            warehouseLocationId:
                fulfillmentMode === 'warehouse_transfer'
                    ? (targetLocationId || undefined)
                    : undefined,
        }));

        setItems((prev) => [...prev, ...newItems]);
        setAddExistingOpen(false);
        setSelectedBrandForExisting('');

        const brandName = brands.find((b) => b.id === selectedBrandForExisting)?.name || 'brand';
        toast({
            title: 'Added',
            description: `Added ${brandName} variants (qty = 0). Enter quantities to include them.`,
        });
    };

    // Clear all items
    const handleClearAll = () => {
        setItems([]);
        setClearAllOpen(false);
    };

    const updateItem = (id: string, field: keyof NewPOItem, value: any) => {
        setItems(prev => prev.map(item => {
            if (item.id !== id) return item;

            const updated = { ...item, [field]: value };

            // Auto-fill logic
            if (field === 'brandId') {
                const brand = brands.find(b => b.id === value);
                if (brand) updated.brandName = brand.name;
                // Reset variant if brand changes
                updated.variantId = '';
                updated.variantName = '';
            }

            if (field === 'variantId') {
                const variant = availableVariants.find(v => v.id === value);
                if (variant) {
                    updated.variantName = variant.name;
                    updated.variantType = variant.variant_type;
                    updated.brandId = variant.brand_id;
                    updated.brandName = variant.brand_name;
                    // Set price to 0 if POSM
                    if (variant.variant_type === 'posm') {
                        updated.unitPrice = 0;
                    }
                }
            }

            if (field === 'brandName') {
                // If user typing brand name manually (custom input), reset ID
                if (value !== item.brandName) {
                    updated.brandId = 'new';
                }
            }

            return updated;
        }));
    };

    const handleSubmit = async () => {
        if (!catalogCompanyId) {
            toast({ title: 'Error', description: 'Company catalog could not be loaded', variant: 'destructive' });
            return;
        }
        if (fulfillmentMode === 'supplier' && !selectedSupplierId) {
            toast({ title: 'Error', description: 'Please select a supplier', variant: 'destructive' });
            return;
        }
        if (fulfillmentMode === 'warehouse_transfer' && !linkedWarehouseCompanyId) {
            toast({ title: 'Error', description: 'No warehouse is linked to your company', variant: 'destructive' });
            return;
        }
        if (fulfillmentMode === 'warehouse_transfer' && sourceMode === 'single' && !selectedWarehouseLocationId) {
            toast({ title: 'Error', description: 'Please select a sub-warehouse', variant: 'destructive' });
            return;
        }
        if (fulfillmentMode === 'warehouse_transfer' && sourceMode === 'multi') {
            const missing = items.find(i => !i.warehouseLocationId);
            if (missing) {
                toast({ title: 'Error', description: 'Please select a warehouse for each item', variant: 'destructive' });
                return;
            }
        }
        if (items.length === 0) {
            toast({ title: 'Error', description: 'Please add at least one item', variant: 'destructive' });
            return;
        }
        if (!expectedDelivery) {
            toast({ title: 'Error', description: 'Please set expected delivery date', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);

        try {
            const itemsPayload: Array<{ variant_id: string; quantity: number; unit_price: number; warehouse_location_id?: string | null }> = [];

            // Process items: create brands/variants if needed (always under catalog company — hub or tenant)
            for (const item of items) {
                // Allow qty=0 rows in UI (brand auto-populate). Skip them on submit.
                if (!item.quantity || item.quantity <= 0) continue;
                if (item.variantType !== 'posm' && item.unitPrice < 0) {
                    throw new Error(`Item ${item.variantName || 'Unknown'} must have price >= 0`);
                }

                // Stock validation for warehouse transfers
                if (fulfillmentMode === 'warehouse_transfer') {
                    const availableStock = getItemStock(item.variantId, item.warehouseLocationId);
                    if (availableStock === null || availableStock < item.quantity) {
                        const locName = item.warehouseLocationId 
                            ? warehouseLocations.find(l => l.id === item.warehouseLocationId)?.name || 'selected warehouse'
                            : 'selected warehouse';
                        throw new Error(
                            `Insufficient stock for ${item.variantName || 'Unknown'} at ${locName}. ` +
                            `Available: ${availableStock ?? 0}, Requested: ${item.quantity}`
                        );
                    }
                }

                let finalBrandId = item.brandId;
                let finalVariantId = item.variantId;

                // 1. Create Brand if new
                if (finalBrandId === 'new' || !finalBrandId) {
                    // Check if brand name provided
                    if (!item.brandName.trim()) throw new Error("Brand name required for new item");

                    // Check if brand exists by name to avoid dupes
                    const { data: existingBrand } = await supabase
                        .from('brands')
                        .select('id')
                        .eq('company_id', catalogCompanyId)
                        .ilike('name', item.brandName.trim())
                        .maybeSingle();

                    if (existingBrand) {
                        finalBrandId = existingBrand.id;
                    } else {
                        const { data: newBrand, error: brandErr } = await supabase
                            .from('brands')
                            .insert({ name: item.brandName.trim(), company_id: catalogCompanyId })
                            .select()
                            .single();
                        if (brandErr) throw brandErr;
                        finalBrandId = newBrand.id;
                    }
                }

                // 2. Create Variant if new
                if (finalVariantId === 'new' || !finalVariantId) {
                    if (!item.variantName.trim()) throw new Error("Item name required");

                    // Check existence
                    const { data: existingVar } = await supabase
                        .from('variants')
                        .select('id')
                        .eq('brand_id', finalBrandId)
                        .ilike('name', item.variantName.trim())
                        .maybeSingle();

                    if (existingVar) {
                        finalVariantId = existingVar.id;
                    } else {
                        const vt = variantTypes.find(t => t.name.toLowerCase() === String(item.variantType).toLowerCase());
                        if (!vt) throw new Error(`Variant type ${item.variantType} not found in system`);

                        const { data: newVar, error: varErr } = await supabase
                            .from('variants')
                            .insert({
                                name: item.variantName.trim(),
                                brand_id: finalBrandId,
                                variant_type: item.variantType,
                                variant_type_id: vt.id,
                                company_id: catalogCompanyId
                            })
                            .select()
                            .single();
                        if (varErr) throw varErr;
                        finalVariantId = newVar.id;
                    }
                }

                itemsPayload.push({
                    variant_id: finalVariantId,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    warehouse_location_id:
                        fulfillmentMode === 'warehouse_transfer'
                            ? (sourceMode === 'single'
                                ? (selectedWarehouseLocationId || null)
                                : (item.warehouseLocationId || null))
                            : null,
                });
            }

            if (itemsPayload.length === 0) {
                toast({
                    title: 'Error',
                    description: 'Please enter a quantity for at least one item.',
                    variant: 'destructive',
                });
                return;
            }

            // 3. Create Order
            const { success, error } = await onCreateOrder({
                fulfillment_type: fulfillmentMode,
                warehouse_company_id: fulfillmentMode === 'warehouse_transfer' ? linkedWarehouseCompanyId : null,
                warehouse_location_id:
                    fulfillmentMode === 'warehouse_transfer' && sourceMode === 'single'
                        ? selectedWarehouseLocationId
                        : null,
                supplier_id: fulfillmentMode === 'supplier' ? selectedSupplierId : null,
                order_date: orderDate,
                expected_delivery_date: expectedDelivery,
                items: itemsPayload,
                tax_rate: taxRate,
                discount: discount,
                notes: notes
            });

            if (!success) throw new Error(error);

            toast({ title: 'Success', description: 'Purchase Order created successfully' });
            setItems([]);
            onOpenChange(false);
            refreshData();

        } catch (err: any) {
            console.error(err);
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-[95vw] h-[95vh] flex flex-col p-0 gap-0">
                    <DialogHeader className="px-6 py-4 border-b">
                        <DialogTitle>Create Purchase Order</DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                        {/* Left Panel: Settings */}
                        <div className="w-full md:w-80 border-r bg-muted/10 p-4 overflow-y-auto space-y-4">
                            {linkedWarehouseCompanyId && (
                                <div className="space-y-2">
                                    <Label>Fulfillment</Label>
                                    <RadioGroup
                                        value={fulfillmentMode}
                                        onValueChange={(v) => setFulfillmentMode(v as 'supplier' | 'warehouse_transfer')}
                                        className="space-y-2"
                                    >
                                        <div className="flex items-center space-x-2 rounded-md border bg-background p-2">
                                            <RadioGroupItem value="supplier" id="po-supplier" />
                                            <Label htmlFor="po-supplier" className="font-normal cursor-pointer flex-1">
                                                Order from supplier
                                            </Label>
                                        </div>
                                        <div className="flex items-center space-x-2 rounded-md border bg-background p-2">
                                            <RadioGroupItem value="warehouse_transfer" id="po-warehouse" />
                                            <Label htmlFor="po-warehouse" className="font-normal cursor-pointer flex-1">
                                                Internal transfer (warehouse hub)
                                            </Label>
                                        </div>
                                    </RadioGroup>
                                    {fulfillmentMode === 'warehouse_transfer' && (
                                        <p className="text-xs text-muted-foreground">
                                            Line items use the hub catalog. A warehouse user must approve before stock moves to your company.
                                        </p>
                                    )}
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label>Order Date</Label>
                                <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>Expected Delivery</Label>
                                <Input type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)} />
                            </div>
                            {(fulfillmentMode !== 'warehouse_transfer' || sourceMode === 'single') && (
                                <div className="space-y-2">
                                    <Label>{linkedWarehouseCompanyId ? 'Dispatcher' : 'Supplier'}</Label>
                                    {linkedWarehouseCompanyId ? (
                                        <Select
                                            value={selectedSourceValue}
                                            onValueChange={(val) => {
                                                setSelectedSourceValue(val);
                                                if (val.startsWith('wh:')) {
                                                    const locId = val.slice(3);
                                                    setFulfillmentMode('warehouse_transfer');
                                                    setSelectedWarehouseLocationId(locId);
                                                    setSelectedSupplierId('');
                                                    return;
                                                }
                                                if (val.startsWith('sup:')) {
                                                    const supId = val.slice(4);
                                                    setFulfillmentMode('supplier');
                                                    setSelectedSupplierId(supId);
                                                    return;
                                                }
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select source" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {fulfillmentMode === 'warehouse_transfer' ? (
                                                    <>
                                                        <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">Warehouse</div>
                                                        {warehouseLocations.map((l) => (
                                                            <SelectItem key={l.id} value={`wh:${l.id}`}>
                                                                {l.name}
                                                                {l.is_main ? ' (Main)' : ''}
                                                            </SelectItem>
                                                        ))}
                                                        {warehouseLocations.length === 0 && (
                                                            <div className="px-2 py-2 text-xs text-muted-foreground">
                                                                No warehouse locations available.
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">Suppliers</div>
                                                        {suppliers.map((s) => (
                                                            <SelectItem key={s.id} value={`sup:${s.id}`}>
                                                                {s.company_name}
                                                            </SelectItem>
                                                        ))}
                                                        {suppliers.length === 0 && (
                                                            <div className="px-2 py-2 text-xs text-muted-foreground">
                                                                No suppliers available.
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select Supplier" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {suppliers.map((s) => (
                                                    <SelectItem key={s.id} value={s.id}>
                                                        {s.company_name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                    {fulfillmentMode === 'supplier' &&
                                        selectedSupplierId &&
                                        suppliers.find((s) => s.id === selectedSupplierId) && (
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {suppliers.find((s) => s.id === selectedSupplierId)?.address}
                                            </div>
                                        )}
                                </div>
                            )}

                            {fulfillmentMode === 'warehouse_transfer' && (
                                <div className="space-y-2">
                                    <Label>Source mode</Label>
                                    <RadioGroup
                                        value={sourceMode}
                                        onValueChange={(v) => setSourceMode(v as any)}
                                        className="grid grid-cols-2 gap-3"
                                    >
                                        <label className={cn('flex items-center gap-2 rounded-md border bg-background p-3', sourceMode === 'single' && 'border-primary')}>
                                            <RadioGroupItem value="single" />
                                            <span className="text-sm font-medium">Single warehouse</span>
                                        </label>
                                        <label className={cn('flex items-center gap-2 rounded-md border bg-background p-3', sourceMode === 'multi' && 'border-primary')}>
                                            <RadioGroupItem value="multi" />
                                            <span className="text-sm font-medium">Multiple warehouses</span>
                                        </label>
                                    </RadioGroup>
                                    <p className="text-xs text-muted-foreground">
                                        Single keeps the current flow. Multiple lets you choose a warehouse per item.
                                    </p>
                                </div>
                            )}

                            <div className="pt-4 border-t space-y-4">
                                <h3 className="font-semibold text-sm">Pricing & Notes</h3>
                                <div className="space-y-2">
                                    <Label>Tax Rate (%)</Label>
                                    <Input type="number" min="0" step="0.01" value={taxRate === 0 ? '' : taxRate} placeholder="0.00" onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Discount (₱)</Label>
                                    <Input type="number" min="0" step="0.01" value={discount === 0 ? '' : discount} placeholder="0.00" onChange={e => setDiscount(parseFloat(e.target.value) || 0)} />
                                </div>
                                <div className="bg-muted p-3 rounded text-sm space-y-1">
                                    <div className="flex justify-between"><span>Subtotal:</span> <span>₱{subtotal.toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span>Tax:</span> <span>₱{taxAmount.toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span>Discount:</span> <span>-₱{discount.toLocaleString()}</span></div>
                                    <div className="flex justify-between font-bold pt-2 border-t"><span>Total:</span> <span>₱{totalAmount.toLocaleString()}</span></div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Notes</Label>
                                    <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes..." />
                                </div>
                            </div>
                        </div>

                        {/* Right Panel: Grid */}
                        <div className="flex-1 flex flex-col min-w-0 bg-background">
                            <div className="flex items-center justify-between p-4 border-b">
                                <h3 className="font-semibold">Order Items ({items.length})</h3>
                                {items.length > 0 && (
                                    <>
                                        <div className="flex gap-2">
                                            {!readOnlyCatalogEdits && (
                                                <Button onClick={handleAddItem} variant="outline" size="sm">
                                                    <Plus className="h-4 w-4 mr-1" /> New
                                                </Button>
                                            )}
                                            <Button onClick={() => setAddExistingOpen(true)} variant="outline" size="sm">
                                                <Package className="h-4 w-4 mr-1" /> Existing
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => setClearAllOpen(true)}
                                            >
                                                <Trash2 className="h-4 w-4 mr-1" />
                                                Clear
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>

                            {catalogLoading && (
                                <div className="px-4 py-2 text-xs text-muted-foreground border-b">Loading catalog…</div>
                            )}
                            {fulfillmentMode === 'warehouse_transfer' && sourceMode === 'multi' && warehouseLocations.length > 0 && (
                                <div className="border-b bg-muted/10 px-4 py-2">
                                    <Tabs value={activeWarehouseTabId} onValueChange={setActiveWarehouseTabId}>
                                        <TabsList className="w-full justify-start overflow-x-auto">
                                            {warehouseLocations.map((l) => (
                                                <TabsTrigger key={l.id} value={l.id} className="shrink-0">
                                                    {l.name}
                                                    {l.is_main ? ' (Main)' : ''}
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>
                                    </Tabs>
                                </div>
                            )}
                            <div className="flex-1 overflow-auto">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead className="w-[180px]">Brand</TableHead>
                                            <TableHead className="w-[200px]">Variant/Item</TableHead>
                                            {fulfillmentMode === 'warehouse_transfer' && sourceMode === 'multi' && (
                                                <TableHead className="w-[180px]">Warehouse</TableHead>
                                            )}
                                            <TableHead className="w-[100px]">Type</TableHead>
                                            {fulfillmentMode === 'warehouse_transfer' && (
                                                <TableHead className="w-[100px]">Stock</TableHead>
                                            )}
                                            <TableHead className="w-[100px]">Qty</TableHead>
                                            <TableHead className="w-[120px]">Price</TableHead>
                                            <TableHead className="w-[120px] text-right">Total</TableHead>
                                            <TableHead className="w-[50px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {displayedItems.length === 0 && (
                                            <TableRow className="hover:bg-transparent">
                                                <TableCell colSpan={fulfillmentMode === 'warehouse_transfer' ? (sourceMode === 'multi' ? 9 : 8) : 7} className="h-[400px]">
                                                    <div className="flex flex-col items-center justify-center h-full gap-6">
                                                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                                                            <Package className="h-10 w-10 text-primary/60" />
                                                        </div>
                                                        <div className="text-center space-y-2">
                                                            <h4 className="font-semibold text-lg">No items added yet</h4>
                                                            <p className="text-sm text-muted-foreground max-w-[300px]">
                                                                {readOnlyCatalogEdits
                                                                    ? 'Select from existing products in the hub catalog.'
                                                                    : 'Start by adding a new item or select from existing products in your catalog.'}
                                                            </p>
                                                        </div>
                                                        <div className="flex gap-4">
                                                            {!readOnlyCatalogEdits && (
                                                                <Button onClick={handleAddItem} variant="outline" size="lg" className="gap-2 h-12 px-6">
                                                                    <FileText className="h-5 w-5" />
                                                                    Add New Item
                                                                </Button>
                                                            )}
                                                            <Button onClick={() => setAddExistingOpen(true)} size="lg" className="gap-2 h-12 px-6">
                                                                <Package className="h-5 w-5" />
                                                                Add Existing
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        )}

                                        {/* Multi-warehouse: consolidate by brand, warehouse is read-only */}
                                        {fulfillmentMode === 'warehouse_transfer' && sourceMode === 'multi' ? (
                                            (() => {
                                                const byBrand = new Map<string, typeof displayedItems>();
                                                for (const it of displayedItems) {
                                                    const k = it.brandName || 'Unknown';
                                                    if (!byBrand.has(k)) byBrand.set(k, []);
                                                    byBrand.get(k)!.push(it);
                                                }
                                                const brandKeys = Array.from(byBrand.keys()).sort((a, b) => a.localeCompare(b));

                                                const locationNameFor = (locId?: string) => {
                                                    if (!locId) return '—';
                                                    const loc = warehouseLocations.find((l) => l.id === locId);
                                                    return loc ? `${loc.name}${loc.is_main ? ' (Main)' : ''}` : '—';
                                                };

                                                return brandKeys.flatMap((brand) => {
                                                    const rows = byBrand.get(brand) || [];
                                                    const typeOrder = (t: any) => {
                                                        const v = String(t || '').toLowerCase();
                                                        if (v === 'flavor') return 0;
                                                        if (v === 'battery') return 1;
                                                        if (v === 'posm') return 2;
                                                        return 99;
                                                    };
                                                    rows.sort((a, b) => {
                                                        const ta = typeOrder(a.variantType);
                                                        const tb = typeOrder(b.variantType);
                                                        if (ta !== tb) return ta - tb;
                                                        return (a.variantName || '').localeCompare(b.variantName || '');
                                                    });
                                                    return [
                                                        <TableRow key={`brand:${brand}`} className="bg-muted/30 hover:bg-muted/30">
                                                            <TableCell className="font-semibold" colSpan={9}>
                                                                {brand}
                                                            </TableCell>
                                                        </TableRow>,
                                                        ...rows.map((item) => (
                                                            <TableRow key={item.id}>
                                                                <TableCell />
                                                                <TableCell className="font-medium">{item.variantName}</TableCell>
                                                                <TableCell className="text-xs">{locationNameFor(item.warehouseLocationId)}</TableCell>
                                                                <TableCell>
                                                                    <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs capitalize">
                                                                        {String(item.variantType || '').toLowerCase()}
                                                                    </span>
                                                                </TableCell>
                                                                <TableCell className="text-xs text-muted-foreground">
                                                                    {(() => {
                                                                        const stock = getItemStock(item.variantId, item.warehouseLocationId);
                                                                        if (stock === null) return '—';
                                                                        return stock > 0 ? stock.toLocaleString() : <span className="text-destructive">0</span>;
                                                                    })()}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Input
                                                                        type="number"
                                                                        min="0"
                                                                        value={item.quantity === 0 ? '' : item.quantity}
                                                                        onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                                                                        placeholder="0"
                                                                        className="h-8"
                                                                    />
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Input
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.01"
                                                                        value={item.unitPrice === 0 ? '' : item.unitPrice}
                                                                        onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                                                                        placeholder="0.00"
                                                                        className="h-8"
                                                                    />
                                                                </TableCell>
                                                                <TableCell className="text-right font-medium">
                                                                    ₱{(item.quantity * item.unitPrice).toLocaleString()}
                                                                </TableCell>
                                                                <TableCell>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 text-destructive"
                                                                        onClick={() => handleRemoveItem(item.id)}
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </TableCell>
                                                            </TableRow>
                                                        )),
                                                    ];
                                                });
                                            })()
                                        ) : (
                                            // Default table (supplier or single-warehouse or editable)
                                            displayedItems.map((item) => (
                                                <TableRow key={item.id}>
                                                    <TableCell>
                                                        <Input
                                                            value={item.brandName}
                                                            onChange={(e) => updateItem(item.id, 'brandName', e.target.value)}
                                                            onBlur={(e) => {
                                                                const match = brands.find(b => b.name.toLowerCase() === e.target.value.toLowerCase());
                                                                if (match) updateItem(item.id, 'brandId', match.id);
                                                                else updateItem(item.id, 'brandId', 'new');
                                                            }}
                                                            placeholder="Brand..."
                                                            className="h-8"
                                                            disabled={readOnlyCatalogEdits}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input
                                                            value={item.variantName}
                                                            onChange={(e) => updateItem(item.id, 'variantName', e.target.value)}
                                                            onBlur={(e) => {
                                                                if (item.brandId && item.brandId !== 'new') {
                                                                    const match = availableVariants.find(v => v.brand_id === item.brandId && v.name.toLowerCase() === e.target.value.toLowerCase());
                                                                    if (match) updateItem(item.id, 'variantId', match.id);
                                                                    else updateItem(item.id, 'variantId', 'new');
                                                                }
                                                            }}
                                                            placeholder="Item Name..."
                                                            className="h-8"
                                                            disabled={readOnlyCatalogEdits || !item.brandName}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Select
                                                            value={item.variantType}
                                                            onValueChange={(val) => updateItem(item.id, 'variantType', val)}
                                                            disabled={readOnlyCatalogEdits || variantTypes.length === 0}
                                                        >
                                                            <SelectTrigger className="h-8">
                                                                <SelectValue placeholder={variantTypes.length === 0 ? 'No types' : 'Select type'} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {variantTypes.length === 0 ? (
                                                                    <div className="px-2 py-2 text-xs text-muted-foreground">
                                                                        No variant types configured.
                                                                    </div>
                                                                ) : (
                                                                    variantTypes.map((vt) => (
                                                                        <SelectItem key={vt.id} value={vt.name}>
                                                                            {vt.display_name || vt.name}
                                                                        </SelectItem>
                                                                    ))
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    </TableCell>
                                                    {fulfillmentMode === 'warehouse_transfer' && (
                                                        <TableCell className="text-xs text-muted-foreground">
                                                            {(() => {
                                                                const stock = getItemStock(item.variantId, item.warehouseLocationId);
                                                                if (stock === null) return '—';
                                                                return stock > 0 ? stock.toLocaleString() : <span className="text-destructive">0</span>;
                                                            })()}
                                                        </TableCell>
                                                    )}
                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            value={item.quantity === 0 ? '' : item.quantity}
                                                            onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                                                            placeholder="0"
                                                            className="h-8"
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={item.unitPrice === 0 ? '' : item.unitPrice}
                                                            onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                                                            placeholder="0.00"
                                                            className="h-8"
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right font-medium">
                                                        ₱{(item.quantity * item.unitPrice).toLocaleString()}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleRemoveItem(item.id)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>

                            <div className="p-4 border-t bg-muted/20 flex justify-end gap-2">
                                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                                <Button onClick={handleSubmit} disabled={isSubmitting || catalogLoading || !catalogCompanyId}>
                                    {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                    Create Purchase Order
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add Existing Dialog */}
            <Dialog open={addExistingOpen} onOpenChange={setAddExistingOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Add Existing Items</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {/* Brand Selection */}
                        <div className="space-y-2">
                            <Label>Select Brand</Label>
                            <Select
                                value={selectedBrandForExisting}
                                onValueChange={(val) => {
                                    setSelectedBrandForExisting(val);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose a brand..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {filteredBrandsForDialog.length === 0 ? (
                                        <div className="px-2 py-2 text-xs text-muted-foreground">
                                            No brands with available stock at this warehouse.
                                        </div>
                                    ) : (
                                        filteredBrandsForDialog.map(b => (
                                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                This will add all variants under the selected brand with quantity set to 0.
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={() => setAddExistingOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleAddBrandVariants}
                            disabled={!selectedBrandForExisting}
                        >
                            Add brand
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Clear All Confirmation Dialog */}
            <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clear All Items?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove all {items.length} item{items.length !== 1 ? 's' : ''} from your purchase order. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleClearAll}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Clear All
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
