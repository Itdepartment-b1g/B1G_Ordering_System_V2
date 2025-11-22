import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Search, Edit, Package, ChevronRight, Users, TrendingUp, Eye, RefreshCw, Filter, Download, BarChart3, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useInventory, type Variant, type Brand } from './InventoryContext';
import { supabase } from '@/lib/supabase';

export default function MainInventoryPage() {
  const { brands, setBrands, updateBrandName, updateVariant, addOrUpdateInventory } = useInventory();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBrands, setExpandedBrands] = useState<string[]>([]);
  const [allocatedStock, setAllocatedStock] = useState<Record<string, number>>({});
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  
  // Dialog states
  const [editVariantOpen, setEditVariantOpen] = useState(false);
  const [editBrandOpen, setEditBrandOpen] = useState(false);
  
  // Edit variant states
  const [editingVariant, setEditingVariant] = useState<{
    brandId: string;
    variantId: string;
    variantType: 'flavor' | 'battery';
    name: string;
    stock: number;
    price: number;
    sellingPrice?: number;
    dspPrice?: number;
    rspPrice?: number;
  } | null>(null);
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
  const [updatingBulkPrice, setUpdatingBulkPrice] = useState(false);
  
  const { toast } = useToast();

  // Fetch allocated stock data
  const fetchAllocatedStock = async () => {
    try {
      setLoadingAllocations(true);
      
      // Step 1: Get all leader IDs
      const { data: leaderProfiles, error: leaderErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('position', 'Leader');

      if (leaderErr) throw leaderErr;

      const leaderIds = (leaderProfiles || []).map((p: any) => p.id);

      if (leaderIds.length === 0) {
        setAllocatedStock({});
        setLoadingAllocations(false);
        return;
      }

      // Step 2: Sum agent_inventory only for those leaders
      const { data: allocationData, error } = await supabase
        .from('agent_inventory')
        .select('variant_id, stock, agent_id')
        .in('agent_id', leaderIds);

      if (error) throw error;

      // Group allocations by variant_id
      const allocations: Record<string, number> = {};
      allocationData?.forEach(item => {
        allocations[item.variant_id] = (allocations[item.variant_id] || 0) + item.stock;
      });

      setAllocatedStock(allocations);
    } catch (error) {
      console.error('Error fetching allocated stock:', error);
      toast({
        title: 'Error',
        description: 'Failed to load allocation data',
        variant: 'destructive'
      });
    } finally {
      setLoadingAllocations(false);
    }
  };

  // Fetch allocated stock on component mount
  useEffect(() => {
    fetchAllocatedStock();
  }, []);

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
    return brand.flavors.reduce((sum, f) => sum + f.stock, 0) + 
           brand.batteries.reduce((sum, b) => sum + b.stock, 0);
  };

  const getAllocatedStock = (brand: Brand) => {
    const flavorAllocated = brand.flavors.reduce((sum, f) => sum + (allocatedStock[f.id] || 0), 0);
    const batteryAllocated = brand.batteries.reduce((sum, b) => sum + (allocatedStock[b.id] || 0), 0);
    return flavorAllocated + batteryAllocated;
  };

  const getAvailableStock = (brand: Brand) => {
    return getTotalStock(brand) - getAllocatedStock(brand);
  };

  const getVariantAllocatedStock = (variantId: string) => {
    return allocatedStock[variantId] || 0;
  };

  const getVariantAvailableStock = (variant: Variant) => {
    return variant.stock - getVariantAllocatedStock(variant.id);
  };

  const handleEditVariant = (brandId: string, variant: Variant, type: 'flavor' | 'battery') => {
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
    setBulkPriceDialogOpen(true);
  };

  const handleConfirmBulkPriceUpdate = async () => {
    if (!bulkPriceBrandId || !bulkPriceType) return;

    const price = bulkPriceValue === '' ? 0 : Number(bulkPriceValue);
    if (isNaN(price) || price < 0) {
      toast({
        title: "Error",
        description: "Please enter a valid price",
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
      
      // Update all variants in parallel
      const updatePromises = variants.map(variant => 
        updateVariant(
          variant.id,
          variant.name,
          variant.stock,
          (variant as any).price || 0, // Keep existing unit_price
          price // Set new selling_price
        )
      );

      await Promise.all(updatePromises);

      toast({
        title: "Success",
        description: `Updated selling price for all ${bulkPriceType} to ₱${price.toFixed(2)}`,
      });

      setBulkPriceDialogOpen(false);
      setBulkPriceBrandId(null);
      setBulkPriceType(null);
      setBulkPriceValue('');
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


  // Calculate stats
  const totalBrands = brands.length;
  const totalVariants = brands.reduce((sum, brand) => sum + brand.flavors.length + brand.batteries.length, 0);
  const totalStock = brands.reduce((sum, brand) => sum + getTotalStock(brand), 0);
  const totalAllocatedStock = brands.reduce((sum, brand) => sum + getAllocatedStock(brand), 0);
  const totalAvailableStock = totalStock - totalAllocatedStock;
  const lowStockItems = brands.reduce((sum, brand) => {
    const lowFlavors = brand.flavors.filter((f: any) => f.status === 'low-stock').length;
    const lowBatteries = brand.batteries.filter((b: any) => b.status === 'low-stock').length;
    return sum + lowFlavors + lowBatteries;
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
        <div className="flex gap-2">
          <Button 
            onClick={fetchAllocatedStock} 
            disabled={loadingAllocations}
            variant="outline"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loadingAllocations ? 'animate-spin' : ''}`} />
            Refresh Allocations
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
                  className={`p-4 cursor-pointer hover:bg-muted/70 transition-colors ${
                    (brand.flavors.some((f: any) => !f.sellingPrice || f.sellingPrice === 0) || 
                     brand.batteries.some((b: any) => !b.sellingPrice || b.sellingPrice === 0))
                      ? 'bg-yellow-50/50 border-l-4 border-l-yellow-500' 
                      : 'bg-muted/50'
                  }`}
                  onClick={() => toggleBrandExpand(brand.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ChevronRight 
                        className={`h-4 w-4 transition-transform ${
                          expandedBrands.includes(brand.id) ? 'rotate-90' : ''
                        }`} 
                      />
                      {(brand.flavors.some((f: any) => !f.sellingPrice || f.sellingPrice === 0) || 
                        brand.batteries.some((b: any) => !b.sellingPrice || b.sellingPrice === 0)) && (
                        <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
                      )}
                      <div>
                        <h3 className="font-semibold text-lg">{brand.name}</h3>
                        <div className="text-sm text-muted-foreground">
                          {brand.flavors.length} Flavors • {brand.batteries.length} Batteries • 
                          <span className={`ml-1 ${getTotalStock(brand) > 0 ? 'text-blue-700' : 'text-red-600'}`}>
                            Total Stock: {getTotalStock(brand)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                    <Badge 
                      variant={
                        getTotalStock(brand) === 0 ? 'destructive' : 
                        (brand.flavors.some((f: any) => !f.sellingPrice || f.sellingPrice === 0) || 
                         brand.batteries.some((b: any) => !b.sellingPrice || b.sellingPrice === 0)) ? 'secondary' :
                        (brand.flavors.some((f: any) => f.status === 'low-stock') || brand.batteries.some((b: any) => b.status === 'low-stock')) ? 'secondary' : 'default'
                      }
                    >
                      {getTotalStock(brand) === 0 ? 'Out of Stock' : 
                       (brand.flavors.some((f: any) => !f.sellingPrice || f.sellingPrice === 0) || 
                        brand.batteries.some((b: any) => !b.sellingPrice || b.sellingPrice === 0)) ? 'Missing Prices' :
                       (brand.flavors.some((f: any) => f.status === 'low-stock') || brand.batteries.some((b: any) => b.status === 'low-stock')) ? 'Low Stock' : 'In Stock'}
                    </Badge>
                      <Button variant="ghost" size="sm" onClick={(e) => {
                        e.stopPropagation();
                        handleEditBrand(brand);
                      }}>
                        <Edit className="h-4 w-4" />
                      </Button>
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
                              <TableHead className="text-blue-800">Flavor Name</TableHead>
                              <TableHead className="text-blue-800">Total Stock</TableHead>
                              <TableHead className="text-blue-800">Allocated</TableHead>
                              <TableHead className="text-blue-800">Available</TableHead>
                              <TableHead className="text-blue-800 text-right">Price</TableHead>
                              <TableHead className="text-blue-800 text-right">Status</TableHead>
                              <TableHead className="text-blue-800 text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {brand.flavors.map((flavor) => {
                              const allocated = getVariantAllocatedStock(flavor.id);
                              const available = getVariantAvailableStock(flavor);
                              const hasNoPrice = !(flavor as any).sellingPrice || (flavor as any).sellingPrice === 0 || Number((flavor as any).sellingPrice) === 0;
                              return (
                                <TableRow 
                                  key={`flavor-${flavor.id}`} 
                                  className={`hover:bg-blue-50/20 ${
                                    hasNoPrice ? 'bg-yellow-50/50 border-l-4 border-l-yellow-500' : 'bg-blue-50/10'
                                  }`}
                                >
                                  <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                      {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />}
                                      <span>{flavor.name}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-semibold">{flavor.stock}</TableCell>
                                  <TableCell className="text-orange-600 font-medium">{allocated}</TableCell>
                                  <TableCell className="text-green-600 font-medium">{available}</TableCell>
                                  <TableCell className="text-right">
                                    {typeof (flavor as any).sellingPrice === 'number' ? `₱${(flavor as any).sellingPrice.toFixed(2)}` : '-'}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge 
                                      variant={
                                        flavor.stock === 0 ? 'destructive' :
                                        !(flavor as any).sellingPrice || (flavor as any).sellingPrice === 0 ? 'secondary' :
                                        (flavor as any).status === 'low-stock' ? 'secondary' : 'default'
                                      }
                                    >
                                      {flavor.stock === 0 ? 'Out of Stock' : 
                                       !(flavor as any).sellingPrice || (flavor as any).sellingPrice === 0 ? 'No Price Set' :
                                       (flavor as any).status === 'low-stock' ? 'Low Stock' : 'In Stock'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditVariant(brand.id, flavor, 'flavor')}
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
                              <TableHead className="text-green-800">Battery Name</TableHead>
                              <TableHead className="text-green-800">Total Stock</TableHead>
                              <TableHead className="text-green-800">Allocated</TableHead>
                              <TableHead className="text-green-800">Available</TableHead>
                              <TableHead className="text-green-800 text-right">Price</TableHead>
                              <TableHead className="text-green-800 text-right">Status</TableHead>
                              <TableHead className="text-green-800 text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {brand.batteries.map((battery) => {
                              const allocated = getVariantAllocatedStock(battery.id);
                              const available = getVariantAvailableStock(battery);
                              const hasNoPrice = !(battery as any).sellingPrice || (battery as any).sellingPrice === 0 || Number((battery as any).sellingPrice) === 0;
                              return (
                                <TableRow 
                                  key={`battery-${battery.id}`} 
                                  className={`hover:bg-green-50/20 ${
                                    hasNoPrice ? 'bg-yellow-50/50 border-l-4 border-l-yellow-500' : 'bg-green-50/10'
                                  }`}
                                >
                                  <TableCell className="font-medium">
                                    <div className="flex items-center gap-2">
                                      {hasNoPrice && <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />}
                                      <span>{battery.name}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="font-semibold">{battery.stock}</TableCell>
                                  <TableCell className="text-orange-600 font-medium">{allocated}</TableCell>
                                  <TableCell className="text-green-600 font-medium">{available}</TableCell>
                                  <TableCell className="text-right">
                                    {typeof (battery as any).sellingPrice === 'number' ? `₱${(battery as any).sellingPrice.toFixed(2)}` : '-'}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Badge 
                                      variant={
                                        battery.stock === 0 ? 'destructive' :
                                        !(battery as any).sellingPrice || (battery as any).sellingPrice === 0 ? 'secondary' :
                                        (battery as any).status === 'low-stock' ? 'secondary' : 'default'
                                      }
                                    >
                                      {battery.stock === 0 ? 'Out of Stock' : 
                                       !(battery as any).sellingPrice || (battery as any).sellingPrice === 0 ? 'No Price Set' :
                                       (battery as any).status === 'low-stock' ? 'Low Stock' : 'In Stock'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleEditVariant(brand.id, battery, 'battery')}
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
                    
                    {/* Empty state if no variants */}
                    {brand.flavors.length === 0 && brand.batteries.length === 0 && (
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
                  onChange={(e) => setEditingVariant({...editingVariant, name: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="stock">Stock</Label>
                <Input
                  id="stock"
                  type="number"
                  value={editingVariant.stock}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div>
                <Label htmlFor="unit_price">Unit Price (Buying Price)</Label>
                <Input
                  id="unit_price"
                  type="number"
                  value={priceInputValue}
                  placeholder={editingVariant.price === 0 ? '0' : String(editingVariant.price)}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    setPriceInputValue(inputValue);
                    const value = inputValue === '' ? 0 : Number(inputValue);
                    setEditingVariant({...editingVariant, price: value});
                  }}
                />
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
                    setEditingVariant({...editingVariant, sellingPrice: value});
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
                    setEditingVariant({...editingVariant, dspPrice: value});
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
                    setEditingVariant({...editingVariant, rspPrice: value});
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
                  onChange={(e) => setEditingBrand({...editingBrand, name: e.target.value})}
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
            <DialogTitle>Set Price for All {bulkPriceType === 'flavors' ? 'Flavors' : 'Batteries'}</DialogTitle>
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
                  placeholder="Enter price"
                  onChange={(e) => setBulkPriceValue(e.target.value)}
                  disabled={updatingBulkPrice}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  This will update the selling price for all {bulkPriceType === 'flavors' ? 'flavors' : 'batteries'} in this brand.
                </p>
              </div>
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setBulkPriceDialogOpen(false);
                    setBulkPriceValue('');
                  }}
                  disabled={updatingBulkPrice}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmBulkPriceUpdate}
                  disabled={updatingBulkPrice || bulkPriceValue === ''}
                >
                  {updatingBulkPrice ? 'Updating...' : 'Update All Prices'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
