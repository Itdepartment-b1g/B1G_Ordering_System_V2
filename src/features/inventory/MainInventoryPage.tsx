import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Search, Edit, Package, ChevronRight, Users, TrendingUp, Eye, RefreshCw, Filter, Download, BarChart3, TrendingDown, AlertTriangle, CheckCircle, Trash2, RotateCcw, Loader2, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useInventory, type Variant, type Brand } from './InventoryContext';
import { supabase } from '@/lib/supabase';
import { InventoryImportExport } from './components/InventoryImportExport';
import { format } from 'date-fns';

interface ReturnHistoryEntry {
  id: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  leaderName: string;
  variantName: string;
  brandName: string;
  signatureUrl: string | null;
}

export default function MainInventoryPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { brands, setBrands, updateBrandName, updateVariant, addOrUpdateInventory, refreshInventory } = useInventory();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBrands, setExpandedBrands] = useState<string[]>([]);

  // Dialog states
  const [editVariantOpen, setEditVariantOpen] = useState(false);
  const [editBrandOpen, setEditBrandOpen] = useState(false);

  // Edit variant states
  const [editingVariant, setEditingVariant] = useState<{
    brandId: string;
    variantId: string;
    variantType: 'flavor' | 'battery' | 'posm';
    name: string;
    stock: number;
    price: number;
    sellingPrice?: number;
    dspPrice?: number;
    rspPrice?: number;
  } | null>(null);
  const [deleteVariantId, setDeleteVariantId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [priceInputValue, setPriceInputValue] = useState<string>('');
  const [sellingPriceInputValue, setSellingPriceInputValue] = useState<string>('');
  const [dspPriceInputValue, setDspPriceInputValue] = useState<string>('');
  const [rspPriceInputValue, setRspPriceInputValue] = useState<string>('');

  // Edit brand states
  const [editingBrand, setEditingBrand] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Bulk price update states
  const [bulkPriceDialogOpen, setBulkPriceDialogOpen] = useState(false);
  const [bulkPriceType, setBulkPriceType] = useState<'flavors' | 'batteries' | null>(null);
  const [bulkPriceBrandId, setBulkPriceBrandId] = useState<string | null>(null);
  const [bulkPriceValue, setBulkPriceValue] = useState<string>('');
  const [bulkDspValue, setBulkDspValue] = useState<string>('');
  const [bulkRspValue, setBulkRspValue] = useState<string>('');
  const [updatingBulkPrice, setUpdatingBulkPrice] = useState(false);

  // Bulk stock edit states
  const [bulkStockDialogOpen, setBulkStockDialogOpen] = useState(false);
  const [bulkStockBrandId, setBulkStockBrandId] = useState<string | null>(null);
  const [bulkStockVariants, setBulkStockVariants] = useState<Array<{
    id: string;
    name: string;
    type: 'flavor' | 'battery' | 'posm';
    stock: number;
    allocatedStock: number;
  }>>([]);
  const [updatingBulkStock, setUpdatingBulkStock] = useState(false);

  // Return history states
  const [returnHistoryOpen, setReturnHistoryOpen] = useState(false);
  const [returnHistory, setReturnHistory] = useState<ReturnHistoryEntry[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [viewSignatureUrl, setViewSignatureUrl] = useState<string | null>(null);

  const { toast } = useToast();

  const fetchReturnHistory = async () => {
    if (!user?.company_id) return;
    setLoadingReturns(true);
    try {
      let data: any[] | null = null;

      const primaryResult = await supabase
        .from('inventory_transactions')
        .select(`
          id,
          quantity,
          notes,
          created_at,
          from_location,
          signature_url,
          variant:variants!inventory_transactions_variant_id_fkey(name, brand:brands!variants_brand_id_fkey(name)),
          performer:profiles!inventory_transactions_performed_by_fkey(full_name)
        `)
        .eq('company_id', user.company_id)
        .eq('transaction_type', 'return_to_main')
        .order('created_at', { ascending: false })
        .limit(100);

      if (primaryResult.error) {
        const fallbackResult = await supabase
          .from('inventory_transactions')
          .select(`
            id,
            quantity,
            notes,
            created_at,
            from_location,
            variant:variants!inventory_transactions_variant_id_fkey(name, brand:brands!variants_brand_id_fkey(name)),
            performer:profiles!inventory_transactions_performed_by_fkey(full_name)
          `)
          .eq('company_id', user.company_id)
          .eq('transaction_type', 'return_to_main')
          .order('created_at', { ascending: false })
          .limit(100);

        if (fallbackResult.error) throw fallbackResult.error;
        data = fallbackResult.data;
      } else {
        data = primaryResult.data;
      }

      const entries: ReturnHistoryEntry[] = (data || []).map((row: any) => ({
        id: row.id,
        quantity: row.quantity,
        notes: row.notes,
        created_at: row.created_at,
        leaderName: row.performer?.full_name || 'Unknown',
        variantName: row.variant?.name || 'Unknown',
        brandName: row.variant?.brand?.name || 'Unknown',
        signatureUrl: row.signature_url || null,
      }));

      setReturnHistory(entries);
    } catch (err: any) {
      console.error('Error fetching return history:', err);
      toast({ title: 'Error', description: 'Failed to load return history', variant: 'destructive' });
    } finally {
      setLoadingReturns(false);
    }
  };

  const handleOpenReturnHistory = () => {
    setReturnHistoryOpen(true);
    fetchReturnHistory();
  };

  const handleDeleteVariant = async (variantId: string) => {
    if (!user?.company_id) {
      toast({ title: "Error", description: "User company ID not found.", variant: "destructive" });
      return;
    }
    try {
      setIsDeleting(true);
      // Soft delete: set is_active = false instead of actually deleting
      const { error } = await supabase
        .from('variants')
        .update({ is_active: false })
        .eq('id', variantId);
      if (error) throw error;
      toast({ title: "Product Archived", description: "The product has been archived and hidden from inventory." });
      refreshInventory();
      queryClient.invalidateQueries({ queryKey: ['inventory'] }); // Invalidate react-query cache
    } catch (err: any) {
      console.error('Error archiving variant:', err);
      toast({ title: "Archive Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteVariantId(null);
    }
  };

  // No need to fetch allocated stock manually anymore

  const filteredBrands = brands.filter(brand =>
    brand.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    brand.flavors.some(f => f.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    brand.batteries.some(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const toggleBrandExpand = (brandId: string) => {
    setExpandedBrands(prev =>
      prev.includes(brandId)
        ? prev.filter(id => id !== brandId)
        : [...prev, brandId]
    );
  };

  const getTotalStock = (brand: Brand) => {
    return brand.allVariants.reduce((sum, v) => sum + v.stock, 0);
  };

  const getAllocatedStock = (brand: Brand) => {
    return brand.allVariants.reduce((sum, v) => sum + (v.allocatedStock || 0), 0);
  };

  const getAvailableStock = (brand: Brand) => {
    return getTotalStock(brand) - getAllocatedStock(brand);
  };

  const getVariantAllocatedStock = (variant: Variant) => {
    return variant.allocatedStock || 0;
  };

  const getVariantAvailableStock = (variant: Variant) => {
    return variant.stock - getVariantAllocatedStock(variant);
  };

  // Helper to get color scheme for variant type
  const getVariantTypeColor = (variantType: string) => {
    const normalized = variantType.toLowerCase();
    if (normalized === 'flavor') return { bg: 'blue', color: 'blue-800', dot: 'blue-500', border: 'blue-200', hover: 'blue-100' };
    if (normalized === 'battery') return { bg: 'green', color: 'green-800', dot: 'green-500', border: 'green-200', hover: 'green-100' };
    if (normalized === 'posm') return { bg: 'purple', color: 'purple-800', dot: 'purple-500', border: 'purple-200', hover: 'purple-100' };
    if (normalized === 'foc') return { bg: 'orange', color: 'orange-800', dot: 'orange-500', border: 'orange-200', hover: 'orange-100' };
    // Default for any other custom type
    return { bg: 'gray', color: 'gray-800', dot: 'gray-500', border: 'gray-200', hover: 'gray-100' };
  };

  // Safe entries for variantsByType (Map or plain object after cache/serialization)
  const getVariantsByTypeEntries = (brand: { variantsByType?: Map<string, Variant[]> | Record<string, Variant[]> }): [string, Variant[]][] => {
    const v = brand.variantsByType;
    if (!v) return [];
    if (v instanceof Map) return Array.from(v.entries());
    return Object.entries(v);
  };

  const handleEditVariant = (brandId: string, variant: Variant, type: 'flavor' | 'battery' | 'posm') => {
    const currentUnitPrice = variant.price || 0;
    const currentSellingPrice = (variant as any).sellingPrice || 0;
    const currentDspPrice = (variant as any).dspPrice || 0;
    const currentRspPrice = (variant as any).rspPrice || 0;
    setEditingVariant({
      brandId,
      variantId: variant.id,
      variantType: type,
      name: variant.name,
      stock: variant.stock,
      price: currentUnitPrice,
      sellingPrice: currentSellingPrice,
      dspPrice: currentDspPrice,
      rspPrice: currentRspPrice
    });
    setPriceInputValue(''); // Start with empty input, show price as placeholder
    setSellingPriceInputValue('');
    setDspPriceInputValue('');
    setRspPriceInputValue('');
    setEditVariantOpen(true);
  };

  const handleEditBrand = (brand: Brand) => {
    setEditingBrand({
      id: brand.id,
      name: brand.name
    });
    setEditBrandOpen(true);
  };

  const handleConfirmUpdate = async () => {
    if (!editingVariant) return;

    try {
      const unitPrice = priceInputValue === '' ? editingVariant.price : Number(priceInputValue);
      const sellingPrice = sellingPriceInputValue === '' ? editingVariant.sellingPrice : Number(sellingPriceInputValue);
      const dspPrice = dspPriceInputValue === '' ? editingVariant.dspPrice : Number(dspPriceInputValue);
      const rspPrice = rspPriceInputValue === '' ? editingVariant.rspPrice : Number(rspPriceInputValue);

      await updateVariant(
        editingVariant.variantId,
        editingVariant.name,
        editingVariant.stock, // Keep original stock value
        unitPrice,
        sellingPrice,
        dspPrice,
        rspPrice
      );

      toast({
        title: "Success",
        description: `${editingVariant.variantType} updated successfully`,
      });

      setEditVariantOpen(false);
      setEditingVariant(null);
      setPriceInputValue('');
      setSellingPriceInputValue('');
      setDspPriceInputValue('');
      setRspPriceInputValue('');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update variant",
        variant: "destructive",
      });
    }
  };

  const handleConfirmBrandUpdate = async () => {
    if (!editingBrand) return;

    try {
      await updateBrandName(editingBrand.id, editingBrand.name);

      toast({
        title: "Success",
        description: "Brand updated successfully",
      });

      setEditBrandOpen(false);
      setEditingBrand(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update brand",
        variant: "destructive",
      });
    }
  };

  const handleOpenBulkPriceDialog = (brandId: string, type: 'flavors' | 'batteries') => {
    setBulkPriceBrandId(brandId);
    setBulkPriceType(type);
    setBulkPriceValue('');
    setBulkDspValue('');
    setBulkRspValue('');
    setBulkPriceDialogOpen(true);
  };

  const handleOpenBulkStockDialog = (brandId: string) => {
    const brand = brands.find(b => b.id === brandId);
    if (!brand) return;

    // Collect all variants from this brand
    const allVariants = [
      ...brand.flavors.map(f => ({ id: f.id, name: f.name, type: 'flavor' as const, stock: f.stock, allocatedStock: f.allocatedStock })),
      ...brand.batteries.map(b => ({ id: b.id, name: b.name, type: 'battery' as const, stock: b.stock, allocatedStock: b.allocatedStock })),
      ...(brand.posms || []).map(p => ({ id: p.id, name: p.name, type: 'posm' as const, stock: p.stock, allocatedStock: p.allocatedStock }))
    ];

    setBulkStockBrandId(brandId);
    setBulkStockVariants(allVariants);
    setBulkStockDialogOpen(true);
  };

  const handleConfirmBulkPriceUpdate = async () => {
    if (!bulkPriceBrandId || !bulkPriceType) return;

    const sellingPrice = bulkPriceValue === '' ? 0 : Number(bulkPriceValue);
    const dspPrice = bulkDspValue === '' ? 0 : Number(bulkDspValue);
    const rspPrice = bulkRspValue === '' ? 0 : Number(bulkRspValue);

    if (isNaN(sellingPrice) || sellingPrice < 0 || isNaN(dspPrice) || dspPrice < 0 || isNaN(rspPrice) || rspPrice < 0) {
      toast({
        title: "Error",
        description: "Please enter valid prices",
        variant: "destructive",
      });
      return;
    }

    setUpdatingBulkPrice(true);
    try {
      const brand = brands.find(b => b.id === bulkPriceBrandId);
      if (!brand) {
        throw new Error('Brand not found');
      }

      const variants = bulkPriceType === 'flavors' ? brand.flavors : brand.batteries;

      // Update all variants in parallel (skip individual refreshes for performance)
      const updatePromises = variants.map(variant =>
        updateVariant(
          variant.id,
          variant.name,
          variant.stock,
          (variant as any).price || 0, // Keep existing unit_price
          sellingPrice, // Set new selling_price
          dspPrice, // Set new dspPrice
          rspPrice, // Set new rspPrice
          true // skipRefresh - we'll refresh once after all updates
        )
      );

      await Promise.all(updatePromises);

      // Refresh inventory once after all updates complete
      await refreshInventory();

      toast({
        title: "Success",
        description: `Updated prices for all ${bulkPriceType}`,
      });

      setBulkPriceDialogOpen(false);
      setBulkPriceBrandId(null);
      setBulkPriceType(null);
      setBulkPriceValue('');
      setBulkDspValue('');
      setBulkRspValue('');
    } catch (error) {
      console.error('Error updating bulk prices:', error);
      toast({
        title: "Error",
        description: `Failed to update ${bulkPriceType} prices`,
        variant: "destructive",
      });
    } finally {
      setUpdatingBulkPrice(false);
    }
  };

  const handleBulkStockChange = (variantId: string, newStock: number) => {
    setBulkStockVariants(prev =>
      prev.map(v => v.id === variantId ? { ...v, stock: Math.max(0, newStock) } : v)
    );
  };

  const handleConfirmBulkStockUpdate = async () => {
    if (!bulkStockBrandId) return;

    setUpdatingBulkStock(true);
    try {
      const brand = brands.find(b => b.id === bulkStockBrandId);
      if (!brand) {
        throw new Error('Brand not found');
      }

      // Update all variants in parallel
      const updatePromises = bulkStockVariants.map(variant => {
        // Find the original variant to get pricing info
        const originalVariant = 
          brand.flavors.find(f => f.id === variant.id) ||
          brand.batteries.find(b => b.id === variant.id) ||
          (brand.posms || []).find(p => p.id === variant.id);

        if (!originalVariant) return Promise.resolve();

        return updateVariant(
          variant.id,
          variant.name,
          variant.stock, // Updated stock
          (originalVariant as any).price || 0,
          (originalVariant as any).sellingPrice,
          (originalVariant as any).dspPrice,
          (originalVariant as any).rspPrice,
          true // skipRefresh
        );
      });

      await Promise.all(updatePromises);
      await refreshInventory();

      toast({
        title: "Success",
        description: `Updated stock for ${bulkStockVariants.length} variant(s)`,
      });

      setBulkStockDialogOpen(false);
      setBulkStockBrandId(null);
      setBulkStockVariants([]);
    } catch (error) {
      console.error('Error updating bulk stock:', error);
      toast({
        title: "Error",
        description: "Failed to update stock levels",
        variant: "destructive",
      });
    } finally {
      setUpdatingBulkStock(false);
    }
  };


  // Calculate stats
  const totalBrands = brands.length;
  const totalVariants = brands.reduce((sum, brand) => sum + brand.flavors.length + brand.batteries.length + (brand.posms || []).length, 0);
  const totalStock = brands.reduce((sum, brand) => sum + getTotalStock(brand), 0);
  const totalAllocatedStock = brands.reduce((sum, brand) => sum + getAllocatedStock(brand), 0);
  const totalAvailableStock = totalStock - totalAllocatedStock;
  const lowStockItems = brands.reduce((sum, brand) => {
    const lowFlavors = brand.flavors.filter((f: any) => f.status === 'low-stock').length;
    const lowBatteries = brand.batteries.filter((b: any) => b.status === 'low-stock').length;
    const lowPosms = (brand.posms || []).filter((p: any) => p.status === 'low-stock').length;
    return sum + lowFlavors + lowBatteries + lowPosms;
  }, 0);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Main Inventory</h1>
          <p className="text-muted-foreground">
            Manage your product inventory, brands, and variants
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleOpenReturnHistory} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            View Returns
          </Button>
          <InventoryImportExport brands={brands} />
          <Button
            onClick={refreshInventory}
            variant="outline"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Inventory
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-2xl font-bold">{totalBrands}</div>
                <div className="text-xs text-muted-foreground">Total Brands</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-green-600" />
              <div>
                <div className="text-2xl font-bold">{totalVariants}</div>
                <div className="text-xs text-muted-foreground">Total Variants</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-600" />
              <div>
                <div className="text-2xl font-bold">{totalStock.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Total Stock</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-600" />
              <div>
                <div className="text-2xl font-bold">{totalAllocatedStock.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Allocated Stock</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <div>
                <div className="text-2xl font-bold">{totalAvailableStock.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Available Stock</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Inventory Management</h3>
              <p className="text-sm text-muted-foreground">
                Search and manage your product inventory
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search brands, products, or variants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Hierarchical Brand-Variant Table */}
          <div className="space-y-4">
            {filteredBrands.map((brand) => (
              <div key={brand.id} className="border rounded-lg overflow-hidden">
                {/* Brand Header Row */}
                <div
                  className={`p-4 cursor-pointer hover:bg-muted/70 transition-colors ${(brand.flavors.some((f: any) => {
                    const sp = (f as any).sellingPrice;
                    return sp === null || sp === undefined || (typeof sp === 'number' && Number.isNaN(sp));
                  }) ||
                    brand.batteries.some((b: any) => {
                      const sp = (b as any).sellingPrice;
                      return sp === null || sp === undefined || (typeof sp === 'number' && Number.isNaN(sp));
                    }))
                    ? 'bg-yellow-50/50 border-l-4 border-l-yellow-500'
                    : 'bg-muted/50'
                    }`}
                  onClick={() => toggleBrandExpand(brand.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ChevronRight
                        className={`h-4 w-4 transition-transform ${expandedBrands.includes(brand.id) ? 'rotate-90' : ''
                          }`}
                      />
                      {brand.allVariants.some((v: any) => {
                        const sp = v.sellingPrice;
                        return sp === null || sp === undefined || (typeof sp === 'number' && Number.isNaN(sp));
                      }) && (
                          <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                        )}
                      <div>
                        <h3 className="font-semibold text-lg">{brand.name}</h3>
                        <div className="text-sm text-muted-foreground">
                          {getVariantsByTypeEntries(brand).map(([type, variants], idx) => (
                            <span key={type}>
                              {idx > 0 && ' • '}
                              {variants.length} {type.charAt(0).toUpperCase() + type.slice(1)}
                              {variants.length !== 1 && type.toLowerCase() !== 'posm' && 's'}
                            </span>
                          ))}
                          <span className={`ml-1 ${getTotalStock(brand) > 0 ? 'text-blue-700' : 'text-red-600'}`}>
                            • Total Stock: {getTotalStock(brand)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge
                        variant={
                          getTotalStock(brand) === 0 ? 'destructive' :
                            brand.allVariants.some((v: any) => {
                              const sp = v.sellingPrice;
                              return sp === null || sp === undefined || (typeof sp === 'number' && Number.isNaN(sp));
                            }) ? 'secondary' :
                              brand.allVariants.some((v: any) => v.status === 'low-stock') ? 'secondary' : 'default'
                        }
                      >
                        {getTotalStock(brand) === 0 ? 'Out of Stock' :
                          brand.allVariants.some((v: any) => {
                            const sp = v.sellingPrice;
                            return sp === null || sp === undefined || (typeof sp === 'number' && Number.isNaN(sp));
                          }) ? 'Missing Prices' :
                            brand.allVariants.some((v: any) => v.status === 'low-stock') ? 'Low Stock' : 'In Stock'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Expandable Variants Table */}
                {expandedBrands.includes(brand.id) && (
                  <div className="border-t">
                    {/* Flavors Section */}
                    {brand.flavors.length > 0 && (
                      <div className="bg-blue-50/20">
                        <div className="px-4 py-3 border-b border-blue-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                              <h4 className="font-semibold text-blue-800">Flavors ({brand.flavors.length})</h4>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenBulkPriceDialog(brand.id, 'flavors')}
                              className="text-blue-700 border-blue-300 hover:bg-blue-100"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Set Price for All Flavors
                            </Button>
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-blue-50/30">
                              <TableHead className="text-blue-800 text-center">Flavor Name</TableHead>
                              <TableHead className="text-blue-800 text-center">Total Stock</TableHead>
                              <TableHead className="text-blue-800 text-center">Allocated</TableHead>
                              <TableHead className="text-blue-800 text-center">Available</TableHead>
                              <TableHead className="text-blue-800 text-center">Selling Price</TableHead>
                              <TableHead className="text-blue-800 text-center">DSP</TableHead>
                              <TableHead className="text-blue-800 text-center">RSP</TableHead>
                              <TableHead className="text-blue-800 text-center">Status</TableHead>
                              <TableHead className="text-blue-800 text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {brand.flavors.map((flavor) => {
                              const allocated = getVariantAllocatedStock(flavor);
                              const available = getVariantAvailableStock(flavor);
                              // Only flag as invalid if null, undefined, or NaN (allow 0 as valid price)
                              const sellingPriceRaw = (flavor as any).sellingPrice;
                              const hasNoPrice = sellingPriceRaw === null || sellingPriceRaw === undefined || (typeof sellingPriceRaw === 'number' && Number.isNaN(sellingPriceRaw));
                              return (
                                <TableRow
                                  key={`flavor-${flavor.id}`}
                                  className={`hover:bg-blue-50/20 ${hasNoPrice ? 'bg-yellow-50/50 border-l-4 border-l-yellow-500' : 'bg-blue-50/10'
                                    }`}
                                >
                                  <TableCell className="font-medium text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />}
                                      <span>{flavor.name}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-semibold text-center">{flavor.stock}</TableCell>
                                  <TableCell className="text-orange-600 font-medium text-center">{allocated}</TableCell>
                                  <TableCell className="text-green-600 font-medium text-center">{available}</TableCell>
                                  <TableCell className="text-center">
                                    {typeof (flavor as any).sellingPrice === 'number' ? `₱${(flavor as any).sellingPrice.toFixed(2)}` : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {typeof (flavor as any).dspPrice === 'number' ? `₱${(flavor as any).dspPrice.toFixed(2)}` : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {typeof (flavor as any).rspPrice === 'number' ? `₱${(flavor as any).rspPrice.toFixed(2)}` : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge
                                      variant={
                                        flavor.stock === 0 ? 'destructive' :
                                          hasNoPrice ? 'secondary' :
                                            (flavor as any).status === 'low-stock' ? 'secondary' : 'default'
                                      }
                                    >
                                      {flavor.stock === 0 ? 'Out of Stock' :
                                        hasNoPrice ? 'No Price Set' :
                                          (flavor as any).status === 'low-stock' ? 'Low Stock' : 'In Stock'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditVariant(brand.id, flavor, 'flavor')}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>

                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => setDeleteVariantId(flavor.id)}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Archive this product?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This will hide <strong>{flavor.name}</strong> from inventory. Existing purchase orders and history will be preserved.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel onClick={() => setDeleteVariantId(null)}>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() => deleteVariantId && handleDeleteVariant(deleteVariantId)}
                                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                              disabled={isDeleting}
                                            >
                                              {isDeleting ? "Archiving..." : "Archive"}
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Batteries Section */}
                    {brand.batteries.length > 0 && (
                      <div className="bg-green-50/20">
                        <div className="px-4 py-3 border-b border-green-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-2 rounded-full bg-green-500"></div>
                              <h4 className="font-semibold text-green-800">Batteries ({brand.batteries.length})</h4>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenBulkPriceDialog(brand.id, 'batteries')}
                              className="text-green-700 border-green-300 hover:bg-green-100"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Set Price for All Batteries
                            </Button>
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-green-50/30">
                              <TableHead className="text-green-800 text-center">Battery Name</TableHead>
                              <TableHead className="text-green-800 text-center">Total Stock</TableHead>
                              <TableHead className="text-green-800 text-center">Allocated</TableHead>
                              <TableHead className="text-green-800 text-center">Available</TableHead>
                              <TableHead className="text-green-800 text-center">Selling Price</TableHead>
                              <TableHead className="text-green-800 text-center">DSP</TableHead>
                              <TableHead className="text-green-800 text-center">RSP</TableHead>
                              <TableHead className="text-green-800 text-center">Status</TableHead>
                              <TableHead className="text-green-800 text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {brand.batteries.map((battery) => {
                              const allocated = getVariantAllocatedStock(battery);
                              const available = getVariantAvailableStock(battery);
                              // Only flag as invalid if null, undefined, or NaN (allow 0 as valid price)
                              const sellingPriceRaw = (battery as any).sellingPrice;
                              const hasNoPrice = sellingPriceRaw === null || sellingPriceRaw === undefined || (typeof sellingPriceRaw === 'number' && Number.isNaN(sellingPriceRaw));
                              return (
                                <TableRow
                                  key={`battery-${battery.id}`}
                                  className={`hover:bg-green-50/20 ${hasNoPrice ? 'bg-yellow-50/50 border-l-4 border-l-yellow-500' : 'bg-green-50/10'
                                    }`}
                                >
                                  <TableCell className="font-medium text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />}
                                      <span>{battery.name}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-semibold text-center">{battery.stock}</TableCell>
                                  <TableCell className="text-orange-600 font-medium text-center">{allocated}</TableCell>
                                  <TableCell className="text-green-600 font-medium text-center">{available}</TableCell>
                                  <TableCell className="text-center">
                                    {typeof (battery as any).sellingPrice === 'number' ? `₱${(battery as any).sellingPrice.toFixed(2)}` : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {typeof (battery as any).dspPrice === 'number' ? `₱${(battery as any).dspPrice.toFixed(2)}` : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {typeof (battery as any).rspPrice === 'number' ? `₱${(battery as any).rspPrice.toFixed(2)}` : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge
                                      variant={
                                        battery.stock === 0 ? 'destructive' :
                                          hasNoPrice ? 'secondary' :
                                            (battery as any).status === 'low-stock' ? 'secondary' : 'default'
                                      }
                                    >
                                      {battery.stock === 0 ? 'Out of Stock' :
                                        hasNoPrice ? 'No Price Set' :
                                          (battery as any).status === 'low-stock' ? 'Low Stock' : 'In Stock'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditVariant(brand.id, battery, 'battery')}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>

                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => setDeleteVariantId(battery.id)}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Archive this product?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              This will hide <strong>{battery.name}</strong> from inventory. Existing purchase orders and history will be preserved.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel onClick={() => setDeleteVariantId(null)}>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() => deleteVariantId && handleDeleteVariant(deleteVariantId)}
                                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                              disabled={isDeleting}
                                            >
                                              {isDeleting ? "Archiving..." : "Archive"}
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* POSM Section */}
                    {(brand as any).posms && (brand as any).posms.length > 0 && (
                      <div className="bg-purple-50/20">
                        <div className="px-4 py-3 border-b border-purple-200">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                            <h4 className="font-semibold text-purple-800">POSM ({(brand as any).posms.length})</h4>
                          </div>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-purple-50/30">
                              <TableHead className="text-purple-800 text-center">POSM Name</TableHead>
                              <TableHead className="text-purple-800 text-center">Total Stock</TableHead>
                              <TableHead className="text-purple-800 text-center">Allocated</TableHead>
                              <TableHead className="text-purple-800 text-center">Available</TableHead>
                              <TableHead className="text-purple-800 text-center">Selling Price</TableHead>
                              <TableHead className="text-purple-800 text-center">DSP</TableHead>
                              <TableHead className="text-purple-800 text-center">RSP</TableHead>
                              <TableHead className="text-purple-800 text-center">Status</TableHead>
                              <TableHead className="text-purple-800 text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(brand as any).posms.map((posm: any) => {
                              const allocated = getVariantAllocatedStock(posm.id);
                              const available = getVariantAvailableStock(posm);
                              // Only flag as invalid if null, undefined, or NaN (allow 0 as valid price)
                              const sellingPriceRaw = (posm as any).sellingPrice;
                              const hasNoPrice = sellingPriceRaw === null || sellingPriceRaw === undefined || (typeof sellingPriceRaw === 'number' && Number.isNaN(sellingPriceRaw));
                              return (
                                <TableRow
                                  key={`posm-${posm.id}`}
                                  className={`hover:bg-purple-50/20 ${hasNoPrice ? 'bg-yellow-50/50 border-l-4 border-l-yellow-500' : 'bg-purple-50/10'
                                    }`}
                                >
                                  <TableCell className="font-medium text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />}
                                      <span>{posm.name}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-semibold text-center">{posm.stock}</TableCell>
                                  <TableCell className="text-orange-600 font-medium text-center">{allocated}</TableCell>
                                  <TableCell className="text-green-600 font-medium text-center">{available}</TableCell>
                                  <TableCell className="text-center">
                                    {typeof (posm as any).sellingPrice === 'number' ? `₱${(posm as any).sellingPrice.toFixed(2)}` : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {typeof (posm as any).dspPrice === 'number' ? `₱${(posm as any).dspPrice.toFixed(2)}` : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {typeof (posm as any).rspPrice === 'number' ? `₱${(posm as any).rspPrice.toFixed(2)}` : '-'}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Badge
                                      variant={
                                        posm.stock === 0 ? 'destructive' :
                                          (posm as any).status === 'low-stock' ? 'secondary' : 'default'
                                      }
                                    >
                                      {posm.stock === 0 ? 'Out of Stock' :
                                        (posm as any).status === 'low-stock' ? 'Low Stock' : 'In Stock'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditVariant(brand.id, posm, 'posm')}
                                      className="text-purple-600 hover:text-purple-800 hover:bg-purple-100"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* All Other Custom Variant Types */}
                    {getVariantsByTypeEntries(brand)
                      .filter(([type]) => type !== 'flavor' && type !== 'battery' && type !== 'POSM' && type !== 'posm')
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([variantType, variants]) => {
                        if (variants.length === 0) return null;
                        
                        const colors = getVariantTypeColor(variantType);
                        const typeDisplay = variantType.toUpperCase();
                        
                        return (
                          <div key={variantType} className="bg-gray-50/20">
                            <div className="px-4 py-3 border-b border-gray-200">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={`h-2 w-2 rounded-full bg-${colors.dot}`}></div>
                                  <h4 className={`font-semibold text-${colors.color}`}>{typeDisplay} ({variants.length})</h4>
                                </div>
                              </div>
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-gray-50/30">
                                  <TableHead className="text-gray-800 text-center">Name</TableHead>
                                  <TableHead className="text-gray-800 text-center">Total Stock</TableHead>
                                  <TableHead className="text-gray-800 text-center">Allocated</TableHead>
                                  <TableHead className="text-gray-800 text-center">Available</TableHead>
                                  <TableHead className="text-gray-800 text-center">Selling Price</TableHead>
                                  <TableHead className="text-gray-800 text-center">DSP</TableHead>
                                  <TableHead className="text-gray-800 text-center">RSP</TableHead>
                                  <TableHead className="text-gray-800 text-center">Status</TableHead>
                                  <TableHead className="text-gray-800 text-center">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {variants.map((variant) => {
                                  const allocated = getVariantAllocatedStock(variant);
                                  const available = getVariantAvailableStock(variant);
                                  const sellingPriceRaw = (variant as any).sellingPrice;
                                  const hasNoPrice = sellingPriceRaw === null || sellingPriceRaw === undefined || (typeof sellingPriceRaw === 'number' && Number.isNaN(sellingPriceRaw));
                                  
                                  return (
                                    <TableRow
                                      key={variant.id}
                                      className={`hover:bg-gray-50/20 ${hasNoPrice ? 'bg-yellow-50/50 border-l-4 border-l-yellow-500' : 'bg-gray-50/10'}`}
                                    >
                                      <TableCell className="font-medium text-center">
                                        <div className="flex items-center justify-center gap-2">
                                          {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />}
                                          <span>{variant.name}</span>
                                        </div>
                                      </TableCell>
                                      <TableCell className="font-semibold text-center">{variant.stock}</TableCell>
                                      <TableCell className="text-orange-600 font-medium text-center">{allocated}</TableCell>
                                      <TableCell className="text-green-600 font-medium text-center">{available}</TableCell>
                                      <TableCell className="text-center">
                                        {typeof (variant as any).sellingPrice === 'number' ? `₱${(variant as any).sellingPrice.toFixed(2)}` : '-'}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {typeof (variant as any).dspPrice === 'number' ? `₱${(variant as any).dspPrice.toFixed(2)}` : '-'}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        {typeof (variant as any).rspPrice === 'number' ? `₱${(variant as any).rspPrice.toFixed(2)}` : '-'}
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Badge
                                          variant={
                                            variant.stock === 0 ? 'destructive' :
                                              hasNoPrice ? 'secondary' :
                                                (variant as any).status === 'low-stock' ? 'secondary' : 'default'
                                          }
                                        >
                                          {variant.stock === 0 ? 'Out of Stock' :
                                            hasNoPrice ? 'No Price Set' :
                                              (variant as any).status === 'low-stock' ? 'Low Stock' : 'In Stock'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditVariant(brand.id, variant, variantType as any)}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => setDeleteVariantId(variant.id)}
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>Archive this product?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  This will hide <strong>{variant.name}</strong> from inventory. Existing purchase orders and history will be preserved.
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel onClick={() => setDeleteVariantId(null)}>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                  onClick={() => deleteVariantId && handleDeleteVariant(deleteVariantId)}
                                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                  disabled={isDeleting}
                                                >
                                                  {isDeleting ? "Archiving..." : "Archive"}
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        );
                      })}

                    {/* Empty state if no variants */}
                    {brand.allVariants.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No variants found for this brand</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Empty state if no brands */}
            {filteredBrands.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No brands found</h3>
                <p>
                  {searchQuery ? 'Try adjusting your search criteria' : 'No brands have been added yet'}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Variant Dialog */}
      <Dialog open={editVariantOpen} onOpenChange={setEditVariantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editingVariant?.variantType}</DialogTitle>
          </DialogHeader>
          {editingVariant && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={editingVariant.name}
                  disabled
                  className="bg-muted cursor-not-allowed"
                />
              </div>
              <div>
                <Label htmlFor="stock">Stock</Label>
                <Input
                  id="stock"
                  type="number"
                  min="0"
                  value={editingVariant.stock}
                  onChange={(e) => {
                    const value = Math.max(0, parseInt(e.target.value) || 0);
                    setEditingVariant({ ...editingVariant, stock: value });
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Update the total stock count for this variant
                </p>
              </div>
              <div>
                <Label htmlFor="selling_price">Selling Price</Label>
                <Input
                  id="selling_price"
                  type="number"
                  value={sellingPriceInputValue}
                  placeholder={editingVariant.sellingPrice === 0 ? '0' : String(editingVariant.sellingPrice || 0)}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    setSellingPriceInputValue(inputValue);
                    const value = inputValue === '' ? 0 : Number(inputValue);
                    setEditingVariant({ ...editingVariant, sellingPrice: value });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="dsp_price">DSP (Dealer Selling Price)</Label>
                <Input
                  id="dsp_price"
                  type="number"
                  value={dspPriceInputValue}
                  placeholder={editingVariant.dspPrice === 0 ? '0' : String(editingVariant.dspPrice || 0)}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    setDspPriceInputValue(inputValue);
                    const value = inputValue === '' ? 0 : Number(inputValue);
                    setEditingVariant({ ...editingVariant, dspPrice: value });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="rsp_price">RSP (Retail Selling Price)</Label>
                <Input
                  id="rsp_price"
                  type="number"
                  value={rspPriceInputValue}
                  placeholder={editingVariant.rspPrice === 0 ? '0' : String(editingVariant.rspPrice || 0)}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    setRspPriceInputValue(inputValue);
                    const value = inputValue === '' ? 0 : Number(inputValue);
                    setEditingVariant({ ...editingVariant, rspPrice: value });
                  }}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => {
                  setEditVariantOpen(false);
                  setPriceInputValue('');
                  setSellingPriceInputValue('');
                  setDspPriceInputValue('');
                  setRspPriceInputValue('');
                }}>
                  Cancel
                </Button>
                <Button onClick={handleConfirmUpdate}>
                  Update
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Brand Dialog */}
      <Dialog open={editBrandOpen} onOpenChange={setEditBrandOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Brand</DialogTitle>
          </DialogHeader>
          {editingBrand && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="brandName">Brand Name</Label>
                <Input
                  id="brandName"
                  value={editingBrand.name}
                  onChange={(e) => setEditingBrand({ ...editingBrand, name: e.target.value })}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setEditBrandOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleConfirmBrandUpdate}>
                  Update
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Price Update Dialog */}
      <Dialog open={bulkPriceDialogOpen} onOpenChange={setBulkPriceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Prices for All {bulkPriceType === 'flavors' ? 'Flavors' : 'Batteries'}</DialogTitle>
          </DialogHeader>
          {bulkPriceBrandId && bulkPriceType && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="bulkPrice">
                  Selling Price (₱) for all {bulkPriceType === 'flavors' ? 'flavors' : 'batteries'} in this brand
                </Label>
                <Input
                  id="bulkPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bulkPriceValue}
                  placeholder="Enter selling price"
                  onChange={(e) => setBulkPriceValue(e.target.value)}
                  disabled={updatingBulkPrice}
                />
              </div>
              <div>
                <Label htmlFor="bulkDsp">
                  DSP (₱) for all {bulkPriceType === 'flavors' ? 'flavors' : 'batteries'} in this brand
                </Label>
                <Input
                  id="bulkDsp"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bulkDspValue}
                  placeholder="Enter DSP"
                  onChange={(e) => setBulkDspValue(e.target.value)}
                  disabled={updatingBulkPrice}
                />
              </div>
              <div>
                <Label htmlFor="bulkRsp">
                  RSP (₱) for all {bulkPriceType === 'flavors' ? 'flavors' : 'batteries'} in this brand
                </Label>
                <Input
                  id="bulkRsp"
                  type="number"
                  step="0.01"
                  min="0"
                  value={bulkRspValue}
                  placeholder="Enter RSP"
                  onChange={(e) => setBulkRspValue(e.target.value)}
                  disabled={updatingBulkPrice}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                This will update Selling Price, DSP, and RSP for all {bulkPriceType === 'flavors' ? 'flavors' : 'batteries'} in this brand.
              </p>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setBulkPriceDialogOpen(false);
                    setBulkPriceValue('');
                    setBulkDspValue('');
                    setBulkRspValue('');
                  }}
                  disabled={updatingBulkPrice}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmBulkPriceUpdate}
                  disabled={updatingBulkPrice}
                >
                  {updatingBulkPrice ? 'Updating...' : 'Update All Prices'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Stock Edit Dialog */}
      <Dialog open={bulkStockDialogOpen} onOpenChange={setBulkStockDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Stock for All Variants</DialogTitle>
          </DialogHeader>
          {bulkStockBrandId && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Update the total stock count for each variant. Changes will be applied to all variants in this brand.
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Variant Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                      <TableHead className="text-right">New Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bulkStockVariants.map((variant) => (
                      <TableRow key={variant.id}>
                        <TableCell className="font-medium">{variant.name}</TableCell>
                        <TableCell>
                          <Badge variant={variant.type === 'flavor' ? 'default' : variant.type === 'battery' ? 'secondary' : 'outline'}>
                            {variant.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-muted-foreground">{variant.allocatedStock || 0}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-muted-foreground">{variant.stock}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            value={bulkStockVariants.find(v => v.id === variant.id)?.stock || 0}
                            onChange={(e) => handleBulkStockChange(variant.id, parseInt(e.target.value) || 0)}
                            className="w-24 text-right"
                            disabled={updatingBulkStock}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setBulkStockDialogOpen(false);
                    setBulkStockBrandId(null);
                    setBulkStockVariants([]);
                  }}
                  disabled={updatingBulkStock}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirmBulkStockUpdate}
                  disabled={updatingBulkStock}
                >
                  {updatingBulkStock ? 'Updating...' : `Update Stock for ${bulkStockVariants.length} Variants`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Return History Dialog */}
      <Dialog open={returnHistoryOpen} onOpenChange={setReturnHistoryOpen}>
        <DialogContent className="max-w-3xl w-[95vw] sm:w-full max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Leader Stock Returns
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              History of stock returned from team leaders to main inventory
            </p>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {loadingReturns ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : returnHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <RotateCcw className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="font-medium">No returns found</p>
                <p className="text-sm text-muted-foreground">Returns from team leaders will appear here.</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Leader</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Signature</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returnHistory.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                          </TableCell>
                          <TableCell className="font-medium">{entry.leaderName}</TableCell>
                          <TableCell>{entry.brandName}</TableCell>
                          <TableCell>{entry.variantName}</TableCell>
                          <TableCell className="text-right font-semibold">{entry.quantity}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {entry.notes || '—'}
                          </TableCell>
                          <TableCell>
                            {entry.signatureUrl ? (
                              <img
                                src={entry.signatureUrl}
                                alt="Signature"
                                className="h-8 cursor-pointer border rounded hover:opacity-80 transition-opacity"
                                onClick={() => setViewSignatureUrl(entry.signatureUrl)}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3 p-1">
                  {returnHistory.map((entry) => (
                    <div key={entry.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{entry.leaderName}</span>
                        <Badge variant="secondary" className="text-xs font-semibold">
                          {entry.quantity} units
                        </Badge>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Product:</span>{' '}
                        {entry.brandName} — {entry.variantName}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                      </div>
                      {entry.notes && (
                        <div className="text-xs text-muted-foreground border-t pt-1 mt-1">
                          {entry.notes}
                        </div>
                      )}
                      {entry.signatureUrl && (
                        <div className="border-t pt-2 mt-1">
                          <span className="text-xs text-muted-foreground block mb-1">Signature:</span>
                          <img
                            src={entry.signatureUrl}
                            alt="Signature"
                            className="h-12 cursor-pointer border rounded hover:opacity-80 transition-opacity"
                            onClick={() => setViewSignatureUrl(entry.signatureUrl)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Signature Viewer Dialog */}
      <Dialog open={!!viewSignatureUrl} onOpenChange={() => setViewSignatureUrl(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Signature</DialogTitle>
          </DialogHeader>
          {viewSignatureUrl && (
            <div className="flex items-center justify-center p-4">
              <img src={viewSignatureUrl} alt="Signature" className="max-w-full max-h-64 border rounded" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
