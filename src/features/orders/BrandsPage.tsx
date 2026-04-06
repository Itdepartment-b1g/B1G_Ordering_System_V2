import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Trash2, Loader2, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Brand {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

interface Variant {
  id: string;
  brand_id: string;
  name: string;
  variant_type: string;
  description?: string;
  sku?: string;
  created_at: string;
}

interface VariantType {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  color_code?: string;
  sort_order: number;
}

export default function BrandsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  /** Keeps Main Inventory "Add stock" variant picker in sync after catalog changes. */
  const invalidateWarehouseInventoryCatalog = () => {
    void queryClient.invalidateQueries({ queryKey: ['warehouse-inventory-catalog'] });
  };
  const [brands, setBrands] = useState<Brand[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantTypes, setVariantTypes] = useState<VariantType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  // Variant panel: search and type filter (when a brand is open)
  const [variantSearchQuery, setVariantSearchQuery] = useState('');
  const [variantTypeFilter, setVariantTypeFilter] = useState<'all' | 'flavor' | 'battery' | 'posm'>('all');

  // Dialog states
  const [createBrandDialogOpen, setCreateBrandDialogOpen] = useState(false);
  const [editBrandDialogOpen, setEditBrandDialogOpen] = useState(false);
  const [deleteBrandDialogOpen, setDeleteBrandDialogOpen] = useState(false);
  const [createVariantDialogOpen, setCreateVariantDialogOpen] = useState(false);
  const [editVariantDialogOpen, setEditVariantDialogOpen] = useState(false);
  const [deleteVariantDialogOpen, setDeleteVariantDialogOpen] = useState(false);

  // Form states
  const [brandForm, setBrandForm] = useState({ name: '', description: '' });
  const [variantForm, setVariantForm] = useState({
    name: '',
    variant_type: '',
    description: '',
    sku: '',
    brand_id: ''
  });
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [deletingBrand, setDeletingBrand] = useState<Brand | null>(null);
  const [deletingVariant, setDeletingVariant] = useState<Variant | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { toast } = useToast();

  // Fetch brands, variants, and variant types
  const fetchData = async () => {
    try {
      setLoading(true);

      const { data: brandsData, error: brandsError } = await supabase
        .from('brands')
        .select('id, name, description, created_at, updated_at')
        .order('name');

      if (brandsError) throw brandsError;
      setBrands(brandsData || []);

      const { data: variantsData, error: variantsError } = await supabase
        .from('variants')
        .select('id, brand_id, name, variant_type, description, sku, created_at')
        .order('name');

      if (variantsError) throw variantsError;
      setVariants(variantsData || []);

      // Fetch variant types
      const { data: typesData, error: typesError } = await supabase
        .from('variant_types')
        .select('id, name, display_name, description, color_code, sort_order')
        .eq('is_active', true);

      // Sort: non-zero values first (ascending), then zero values (by display_name)
      let sortedTypes = typesData || [];
      if (typesData) {
        sortedTypes = typesData.sort((a, b) => {
          // If both are non-zero, sort by sort_order
          if (a.sort_order > 0 && b.sort_order > 0) {
            return a.sort_order - b.sort_order;
          }
          // If one is zero and one is not, non-zero comes first
          if (a.sort_order > 0 && b.sort_order === 0) return -1;
          if (a.sort_order === 0 && b.sort_order > 0) return 1;
          // If both are zero, sort alphabetically by display_name
          if (a.sort_order === 0 && b.sort_order === 0) {
            return a.display_name.localeCompare(b.display_name);
          }
          return 0;
        });
      }

      if (typesError) {
        console.warn('Error fetching variant types (may not exist yet):', typesError);
        // If table doesn't exist, use fallback hardcoded types
        // Note: names must match DB constraint ('flavor', 'battery', 'POSM')
        setVariantTypes([
          { id: 'flavor', name: 'flavor', display_name: 'Flavor', color_code: 'blue', sort_order: 1, description: undefined },
          { id: 'battery', name: 'battery', display_name: 'Battery', color_code: 'green', sort_order: 2, description: undefined },
          { id: 'posm', name: 'posm', display_name: 'POSM', color_code: 'purple', sort_order: 3, description: undefined },
        ]);
      } else {
        setVariantTypes(sortedTypes);
        // Set default variant type if none selected
        if (sortedTypes && sortedTypes.length > 0 && !variantForm.variant_type) {
          setVariantForm(prev => ({ ...prev, variant_type: sortedTypes[0].name }));
        }
      }
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load brands and variants',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Reset variant search and type filter when switching to another brand
  useEffect(() => {
    setVariantSearchQuery('');
    setVariantTypeFilter('all');
  }, [selectedBrand]);

  // Filter brands by search query
  const filteredBrands = brands.filter(brand =>
    brand.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get variants for selected brand
  const brandVariants = selectedBrand
    ? variants.filter(v => v.brand_id === selectedBrand)
    : [];

  // Filter variants by search (name, SKU, description) and type (flavor / battery / posm / all)
  const filteredBrandVariants = brandVariants.filter(v => {
    const matchSearch = !variantSearchQuery.trim() || [
      v.name,
      v.sku ?? '',
      v.description ?? ''
    ].some(field => field.toLowerCase().includes(variantSearchQuery.toLowerCase()));
    const matchType =
      variantTypeFilter === 'all' ||
      v.variant_type?.toLowerCase() === variantTypeFilter;
    return matchSearch && matchType;
  });

  // Create Brand
  const handleCreateBrand = async () => {
    if (!brandForm.name.trim()) {
      toast({ title: 'Error', description: 'Brand name is required', variant: 'destructive' });
      return;
    }

    if (!user?.company_id) {
      toast({ title: 'Error', description: 'User company information not found', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const nameTrim = brandForm.name.trim();
      const description = brandForm.description.trim() || null;

      const { data: existing, error: findErr } = await supabase
        .from('brands')
        .select('id, is_active')
        .eq('company_id', user.company_id)
        .eq('name', nameTrim)
        .maybeSingle();
      if (findErr) throw findErr;

      if (existing) {
        if (existing.is_active === true) {
          toast({
            title: 'Error',
            description: `A brand named "${nameTrim}" already exists.`,
            variant: 'destructive',
          });
          return;
        }
        const { error } = await supabase
          .from('brands')
          .update({ is_active: true, description })
          .eq('id', existing.id);
        if (error) throw error;
        toast({ title: 'Success', description: 'Brand restored successfully' });
      } else {
        const { error } = await supabase.from('brands').insert({
          company_id: user.company_id,
          name: nameTrim,
          description,
          is_active: true,
        });
        if (error) throw error;
        toast({ title: 'Success', description: 'Brand created successfully' });
      }

      setBrandForm({ name: '', description: '' });
      setCreateBrandDialogOpen(false);
      invalidateWarehouseInventoryCatalog();
      await fetchData();
    } catch (error: any) {
      console.error('Error creating brand:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create brand',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Brand
  const handleEditBrand = async () => {
    if (!editingBrand || !brandForm.name.trim()) {
      toast({ title: 'Error', description: 'Brand name is required', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({
          name: brandForm.name.trim(),
          description: brandForm.description.trim() || null
        })
        .eq('id', editingBrand.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Brand updated successfully' });
      setEditBrandDialogOpen(false);
      setEditingBrand(null);
      setBrandForm({ name: '', description: '' });
      invalidateWarehouseInventoryCatalog();
      await fetchData();
    } catch (error: any) {
      console.error('Error updating brand:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update brand',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Brand
  const handleDeleteBrand = async () => {
    if (!deletingBrand) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('brands')
        .delete()
        .eq('id', deletingBrand.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Brand deleted successfully' });
      setDeleteBrandDialogOpen(false);
      setDeletingBrand(null);
      if (selectedBrand === deletingBrand.id) {
        setSelectedBrand('');
      }
      invalidateWarehouseInventoryCatalog();
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting brand:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete brand. It may have associated variants.',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Create Variant
  const handleCreateVariant = async () => {
    if (!variantForm.name.trim() || !variantForm.brand_id || !variantForm.variant_type) {
      toast({ title: 'Error', description: 'Variant name, brand, and type are required', variant: 'destructive' });
      return;
    }

    if (!user?.company_id) {
      toast({ title: 'Error', description: 'User company information not found', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Find the variant type to get its ID and name
      const selectedType = variantTypes.find(t => t.name === variantForm.variant_type);
      if (!selectedType) {
        toast({
          title: 'Error',
          description: 'Selected variant type not found',
          variant: 'destructive'
        });
        return;
      }

      // Use variant_type_id as the primary reference
      // The trigger will automatically sync variant_type from variant_type_id
      const insertData: any = {
        company_id: user.company_id,
        brand_id: variantForm.brand_id,
        name: variantForm.name.trim(),
        variant_type_id: selectedType.id,
        description: variantForm.description.trim() || null,
        sku: variantForm.sku.trim() || null
      };

      const { error } = await supabase
        .from('variants')
        .insert(insertData);

      if (error) throw error;

      toast({ title: 'Success', description: 'Variant created successfully' });
      const defaultType = variantTypes.length > 0 ? variantTypes[0].name : '';
      setVariantForm({ name: '', variant_type: defaultType, description: '', sku: '', brand_id: '' });
      setCreateVariantDialogOpen(false);
      invalidateWarehouseInventoryCatalog();
      await fetchData();
    } catch (error: any) {
      console.error('Error creating variant:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create variant',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Variant
  const handleEditVariant = async () => {
    if (!editingVariant || !variantForm.name.trim() || !variantForm.variant_type) {
      toast({ title: 'Error', description: 'Variant name and type are required', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      // Find the variant type to get its ID and name
      const selectedType = variantTypes.find(t => t.name === variantForm.variant_type);
      if (!selectedType) {
        toast({
          title: 'Error',
          description: 'Selected variant type not found',
          variant: 'destructive'
        });
        return;
      }

      // Use variant_type_id as the primary reference
      // The trigger will automatically sync variant_type from variant_type_id
      const updateData: any = {
        name: variantForm.name.trim(),
        variant_type_id: selectedType.id,
        description: variantForm.description.trim() || null,
        sku: variantForm.sku.trim() || null
      };

      const { error } = await supabase
        .from('variants')
        .update(updateData)
        .eq('id', editingVariant.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Variant updated successfully' });
      setEditVariantDialogOpen(false);
      setEditingVariant(null);
      const defaultType = variantTypes.length > 0 ? variantTypes[0].name : '';
      setVariantForm({ name: '', variant_type: defaultType, description: '', sku: '', brand_id: '' });
      invalidateWarehouseInventoryCatalog();
      await fetchData();
    } catch (error: any) {
      console.error('Error updating variant:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update variant',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Variant
  const handleDeleteVariant = async () => {
    if (!deletingVariant) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('variants')
        .delete()
        .eq('id', deletingVariant.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Variant deleted successfully' });
      setDeleteVariantDialogOpen(false);
      setDeletingVariant(null);
      invalidateWarehouseInventoryCatalog();
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting variant:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete variant. It may be used in inventory.',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditBrandDialog = (brand: Brand) => {
    setEditingBrand(brand);
    setBrandForm({ name: brand.name, description: brand.description || '' });
    setEditBrandDialogOpen(true);
  };

  const openEditVariantDialog = (variant: Variant) => {
    setEditingVariant(variant);
    // Try to match the variant type with available types, fallback to lowercase
    const variantTypeName = variant.variant_type.toLowerCase();
    const matchingType = variantTypes.find(t => t.name.toLowerCase() === variantTypeName);
    setVariantForm({
      name: variant.name,
      variant_type: matchingType ? matchingType.name : variantTypeName,
      description: variant.description || '',
      sku: variant.sku || '',
      brand_id: variant.brand_id
    });
    setEditVariantDialogOpen(true);
  };

  const getVariantTypeBadge = (type: string) => {
    const lowerType = type.toLowerCase();
    const variantType = variantTypes.find(t => t.name.toLowerCase() === lowerType);
    if (variantType && variantType.color_code) {
      const colorMap: Record<string, string> = {
        blue: 'bg-blue-100 text-blue-700',
        green: 'bg-green-100 text-green-700',
        purple: 'bg-purple-100 text-purple-700',
        orange: 'bg-orange-100 text-orange-700',
        red: 'bg-red-100 text-red-700',
        yellow: 'bg-yellow-100 text-yellow-700',
        pink: 'bg-pink-100 text-pink-700',
        indigo: 'bg-indigo-100 text-indigo-700',
        gray: 'bg-gray-100 text-gray-700',
      };
      return colorMap[variantType.color_code] || 'bg-gray-100 text-gray-700';
    }
    // Fallback for hardcoded types
    if (lowerType === 'flavor') return 'bg-blue-100 text-blue-700';
    if (lowerType === 'battery') return 'bg-green-100 text-green-700';
    if (lowerType === 'posm') return 'bg-purple-100 text-purple-700';
    return 'bg-gray-100 text-gray-700';
  };

  const getVariantTypeDisplayName = (type: string) => {
    const lowerType = type.toLowerCase();
    const variantType = variantTypes.find(t => t.name.toLowerCase() === lowerType);
    return variantType ? variantType.display_name : type.toUpperCase();
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Brand Management</h1>
          <p className="text-muted-foreground">Manage brands and their product variants</p>
        </div>
        <Button onClick={() => setCreateBrandDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Brand
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Brands</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{brands.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Variants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{variants.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Variant Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(variants.map(v => v.variant_type)).size}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Brands List */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Brands</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search brands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filteredBrands.map(brand => (
                <div
                  key={brand.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedBrand === brand.id
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-muted'
                    }`}
                  onClick={() => setSelectedBrand(brand.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium">{brand.name}</h4>
                      {brand.description && (
                        <p className="text-sm text-muted-foreground truncate">
                          {brand.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {variants.filter(v => v.brand_id === brand.id).length} variants
                      </p>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditBrandDialog(brand);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingBrand(brand);
                          setDeleteBrandDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Variants for Selected Brand */}
        <Card className="lg:col-span-2 flex flex-col min-h-0">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {selectedBrand
                    ? `${brands.find(b => b.id === selectedBrand)?.name} - Variants`
                    : 'Select a Brand'}
                </CardTitle>
                {selectedBrand && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Manage variants for this brand
                  </p>
                )}
              </div>
              {selectedBrand && (
                <Button
                  onClick={() => {
                    setVariantForm({ ...variantForm, brand_id: selectedBrand });
                    setCreateVariantDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Variant
                </Button>
              )}
            </div>
            {/* Search and type filter - only when a brand is selected */}
            {selectedBrand && brandVariants.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search variants by name, SKU, or description..."
                    value={variantSearchQuery}
                    onChange={(e) => setVariantSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">Type:</Label>
                  <Select
                    value={variantTypeFilter}
                    onValueChange={(v: 'all' | 'flavor' | 'battery' | 'posm') => setVariantTypeFilter(v)}
                  >
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="flavor">Flavor</SelectItem>
                      <SelectItem value="battery">Battery</SelectItem>
                      <SelectItem value="posm">POSM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 min-h-0 flex flex-col pt-0">
            {!selectedBrand ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground flex-1">
                <Package className="h-12 w-12 mb-2" />
                <p>Select a brand to view and manage its variants</p>
              </div>
            ) : brandVariants.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground flex-1">
                <Package className="h-12 w-12 mb-2" />
                <p>No variants found for this brand</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setVariantForm({ ...variantForm, brand_id: selectedBrand });
                    setCreateVariantDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Variant
                </Button>
              </div>
            ) : (
              <div className="flex-1 min-h-0 border rounded-md overflow-hidden flex flex-col">
                <div className="overflow-auto flex-1 min-h-0" style={{ maxHeight: '400px' }}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBrandVariants.map(variant => (
                        <TableRow key={variant.id}>
                          <TableCell className="font-medium">{variant.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={getVariantTypeBadge(variant.variant_type)}>
                              {getVariantTypeDisplayName(variant.variant_type)}
                            </Badge>
                          </TableCell>
                          <TableCell>{variant.sku || '-'}</TableCell>
                          <TableCell className="max-w-xs truncate">
                            {variant.description || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditVariantDialog(variant)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setDeletingVariant(variant);
                                  setDeleteVariantDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {filteredBrandVariants.length === 0 && (variantSearchQuery.trim() || variantTypeFilter !== 'all') && (
                  <p className="text-sm text-muted-foreground text-center py-4 border-t">
                    No variants match your search or filter.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Brand Dialog */}
      <Dialog open={createBrandDialogOpen} onOpenChange={setCreateBrandDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Brand</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Brand Name *</Label>
              <Input
                placeholder="e.g., RELX, JUUL"
                value={brandForm.name}
                onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Input
                placeholder="Brief description of the brand"
                value={brandForm.description}
                onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={handleCreateBrand} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Brand'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Brand Dialog */}
      <Dialog open={editBrandDialogOpen} onOpenChange={setEditBrandDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Brand</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Brand Name *</Label>
              <Input
                placeholder="e.g., RELX, JUUL"
                value={brandForm.name}
                onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Input
                placeholder="Brief description of the brand"
                value={brandForm.description}
                onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={handleEditBrand} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Brand'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Brand Confirmation */}
      <AlertDialog open={deleteBrandDialogOpen} onOpenChange={setDeleteBrandDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingBrand?.name}</strong>?
              This action cannot be undone. All variants associated with this brand must be deleted or reassigned first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBrand}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Variant Dialog */}
      <Dialog open={createVariantDialogOpen} onOpenChange={setCreateVariantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Variant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Variant Name *</Label>
              <Input
                placeholder="e.g., Mint, Mango, Display Stand"
                value={variantForm.name}
                onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              {variantTypes.length > 0 ? (
                variantTypes.length <= 4 ? (
                  // Use tabs for 4 or fewer types (cleaner visual)
                  <Tabs
                    value={variantForm.variant_type}
                    onValueChange={(v) => setVariantForm({ ...variantForm, variant_type: v })}
                  >
                    <TabsList className={`grid w-full ${variantTypes.length <= 2 ? 'grid-cols-2' : variantTypes.length <= 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                      {variantTypes.map(type => (
                        <TabsTrigger key={type.id} value={type.name}>
                          {type.display_name}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                ) : (
                  // Use Select dropdown for more than 4 types (scalable)
                  <Select
                    value={variantForm.variant_type}
                    onValueChange={(v) => setVariantForm({ ...variantForm, variant_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a variant type">
                        {variantForm.variant_type ? (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={`${getVariantTypeBadge(variantForm.variant_type)} w-fit`}
                            >
                              {getVariantTypeDisplayName(variantForm.variant_type)}
                            </Badge>
                          </div>
                        ) : (
                          'Select a variant type'
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {variantTypes.map(type => (
                        <SelectItem key={type.id} value={type.name}>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={`${getVariantTypeBadge(type.name)} w-fit`}
                            >
                              {type.display_name}
                            </Badge>
                            {type.description && (
                              <span className="text-xs text-muted-foreground ml-2">
                                {type.description}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              ) : (
                <div className="p-4 border rounded-md bg-muted">
                  <p className="text-sm text-muted-foreground">
                    No variant types found. Please create variant types first in the Variant Types page.
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>SKU (Optional)</Label>
              <Input
                placeholder="e.g., RELX-MINT-001"
                value={variantForm.sku}
                onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Input
                placeholder="Additional details about this variant"
                value={variantForm.description}
                onChange={(e) => setVariantForm({ ...variantForm, description: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={handleCreateVariant} disabled={submitting || variantTypes.length === 0}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Variant'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Variant Dialog */}
      <Dialog open={editVariantDialogOpen} onOpenChange={setEditVariantDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Variant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Variant Name *</Label>
              <Input
                placeholder="e.g., Mint, Mango, Display Stand"
                value={variantForm.name}
                onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              {variantTypes.length > 0 ? (
                variantTypes.length <= 4 ? (
                  // Use tabs for 4 or fewer types (cleaner visual)
                  <Tabs
                    value={variantForm.variant_type}
                    onValueChange={(v) => setVariantForm({ ...variantForm, variant_type: v })}
                  >
                    <TabsList className={`grid w-full ${variantTypes.length <= 2 ? 'grid-cols-2' : variantTypes.length <= 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
                      {variantTypes.map(type => (
                        <TabsTrigger key={type.id} value={type.name}>
                          {type.display_name}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                ) : (
                  // Use Select dropdown for more than 4 types (scalable)
                  <Select
                    value={variantForm.variant_type}
                    onValueChange={(v) => setVariantForm({ ...variantForm, variant_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a variant type">
                        {variantForm.variant_type ? (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={`${getVariantTypeBadge(variantForm.variant_type)} w-fit`}
                            >
                              {getVariantTypeDisplayName(variantForm.variant_type)}
                            </Badge>
                          </div>
                        ) : (
                          'Select a variant type'
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {variantTypes.map(type => (
                        <SelectItem key={type.id} value={type.name}>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="secondary"
                              className={`${getVariantTypeBadge(type.name)} w-fit`}
                            >
                              {type.display_name}
                            </Badge>
                            {type.description && (
                              <span className="text-xs text-muted-foreground ml-2">
                                {type.description}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              ) : (
                <div className="p-4 border rounded-md bg-muted">
                  <p className="text-sm text-muted-foreground">
                    No variant types found. Please create variant types first in the Variant Types page.
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>SKU (Optional)</Label>
              <Input
                placeholder="e.g., RELX-MINT-001"
                value={variantForm.sku}
                onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Input
                placeholder="Additional details about this variant"
                value={variantForm.description}
                onChange={(e) => setVariantForm({ ...variantForm, description: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={handleEditVariant} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Variant'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Variant Confirmation */}
      <AlertDialog open={deleteVariantDialogOpen} onOpenChange={setDeleteVariantDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variant</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingVariant?.name}</strong>?
              This action cannot be undone and may affect inventory records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteVariant}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

