import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Trash2, Loader2, Tag, AlertCircle } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface VariantType {
  id: string;
  company_id: string;
  name: string;
  display_name: string;
  description?: string;
  color_code?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export default function VariantTypesPage() {
  const { user } = useAuth();
  const [variantTypes, setVariantTypes] = useState<VariantType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    description: '',
    color_code: 'blue',
    sort_order: 0
  });
  const [editingType, setEditingType] = useState<VariantType | null>(null);
  const [deletingType, setDeletingType] = useState<VariantType | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { toast } = useToast();

  // Color options for badges
  const colorOptions = [
    { value: 'blue', label: 'Blue', className: 'bg-blue-100 text-blue-700' },
    { value: 'green', label: 'Green', className: 'bg-green-100 text-green-700' },
    { value: 'purple', label: 'Purple', className: 'bg-purple-100 text-purple-700' },
    { value: 'orange', label: 'Orange', className: 'bg-orange-100 text-orange-700' },
    { value: 'red', label: 'Red', className: 'bg-red-100 text-red-700' },
    { value: 'yellow', label: 'Yellow', className: 'bg-yellow-100 text-yellow-700' },
    { value: 'pink', label: 'Pink', className: 'bg-pink-100 text-pink-700' },
    { value: 'indigo', label: 'Indigo', className: 'bg-indigo-100 text-indigo-700' },
    { value: 'gray', label: 'Gray', className: 'bg-gray-100 text-gray-700' },
  ];

  // Fetch variant types
  const fetchVariantTypes = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('variant_types')
        .select('id, company_id, name, display_name, description, color_code, is_active, sort_order, created_at, updated_at');

      if (error) throw error;

      // Sort: non-zero values first (ascending), then zero values (by display_name)
      const sorted = (data || []).sort((a, b) => {
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

      setVariantTypes(sorted);
    } catch (error: any) {
      console.error('Error fetching variant types:', error);
      toast({
        title: 'Error',
        description: 'Failed to load variant types',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVariantTypes();
  }, []);

  // Filter types by search query
  const filteredTypes = variantTypes.filter(type =>
    type.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    type.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (type.description && type.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Get color class for badge
  const getColorClass = (colorCode?: string) => {
    const color = colorOptions.find(c => c.value === colorCode);
    return color?.className || 'bg-gray-100 text-gray-700';
  };

  // Create Variant Type
  const handleCreate = async () => {
    if (!formData.name.trim() || !formData.display_name.trim()) {
      toast({
        title: 'Error',
        description: 'Name and Display Name are required',
        variant: 'destructive'
      });
      return;
    }

    if (!user?.company_id) {
      toast({
        title: 'Error',
        description: 'User company information not found',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      // Check if name already exists
      const { data: existing } = await supabase
        .from('variant_types')
        .select('id')
        .eq('company_id', user.company_id)
        .eq('name', formData.name.trim().toLowerCase())
        .single();

      if (existing) {
        toast({
          title: 'Error',
          description: 'A variant type with this name already exists',
          variant: 'destructive'
        });
        return;
      }

      const { error } = await supabase
        .from('variant_types')
        .insert({
          company_id: user.company_id,
          name: formData.name.trim().toLowerCase(),
          display_name: formData.display_name.trim(),
          description: formData.description.trim() || null,
          color_code: formData.color_code,
          sort_order: formData.sort_order || 0
        });

      if (error) throw error;

      toast({ title: 'Success', description: 'Variant type created successfully' });
      setFormData({ name: '', display_name: '', description: '', color_code: 'blue', sort_order: 0 });
      setCreateDialogOpen(false);
      await fetchVariantTypes();
    } catch (error: any) {
      console.error('Error creating variant type:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create variant type',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Variant Type
  const handleEdit = async () => {
    if (!editingType || !formData.display_name.trim()) {
      toast({
        title: 'Error',
        description: 'Display Name is required',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('variant_types')
        .update({
          display_name: formData.display_name.trim(),
          description: formData.description.trim() || null,
          color_code: formData.color_code,
          sort_order: formData.sort_order || 0
        })
        .eq('id', editingType.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Variant type updated successfully' });
      setEditDialogOpen(false);
      setEditingType(null);
      setFormData({ name: '', display_name: '', description: '', color_code: 'blue', sort_order: 0 });
      await fetchVariantTypes();
    } catch (error: any) {
      console.error('Error updating variant type:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update variant type',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Variant Type
  const handleDelete = async () => {
    if (!deletingType) return;

    setSubmitting(true);
    try {
      // Check if any variants are using this type
      const { data: variantsUsingType, error: checkError } = await supabase
        .from('variants')
        .select('id, name')
        .eq('variant_type_id', deletingType.id)
        .limit(1);

      if (checkError) throw checkError;

      if (variantsUsingType && variantsUsingType.length > 0) {
        toast({
          title: 'Cannot Delete',
          description: 'This variant type is being used by existing variants. Please reassign or delete those variants first.',
          variant: 'destructive'
        });
        setDeleteDialogOpen(false);
        return;
      }

      const { error } = await supabase
        .from('variant_types')
        .delete()
        .eq('id', deletingType.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Variant type deleted successfully' });
      setDeleteDialogOpen(false);
      setDeletingType(null);
      await fetchVariantTypes();
    } catch (error: any) {
      console.error('Error deleting variant type:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete variant type',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (type: VariantType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      display_name: type.display_name,
      description: type.description || '',
      color_code: type.color_code || 'blue',
      sort_order: type.sort_order || 0
    });
    setEditDialogOpen(true);
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
          <h1 className="text-3xl font-bold">Variant Types Management</h1>
          <p className="text-muted-foreground">Manage variant types for future-proofing your product catalog</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Type
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Types</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{variantTypes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Types</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {variantTypes.filter(t => t.is_active).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive Types</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {variantTypes.filter(t => !t.is_active).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Variant Types</CardTitle>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredTypes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Tag className="h-12 w-12 mb-2" />
              <p>{searchQuery ? 'No types found matching your search' : 'No variant types found'}</p>
              {!searchQuery && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setCreateDialogOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Type
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Name (Code)</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead>Sort Order</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTypes.map(type => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">{type.display_name}</TableCell>
                    <TableCell className="text-muted-foreground">{type.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={getColorClass(type.color_code)}>
                        {colorOptions.find(c => c.value === type.color_code)?.label || 'Default'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {type.sort_order === 0 ? (
                        <span className="text-muted-foreground italic">Default</span>
                      ) : (
                        type.sort_order
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {type.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={type.is_active ? 'default' : 'secondary'}>
                        {type.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(type)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDeletingType(type);
                            setDeleteDialogOpen(true);
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
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Variant Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name (Code) *</Label>
              <Input
                placeholder="e.g., flavor, battery, posm"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value.toLowerCase() })}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase identifier (e.g., "flavor", "battery"). This cannot be changed after creation.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Display Name *</Label>
              <Input
                placeholder="e.g., Flavor, Battery, POSM"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                User-friendly name shown in the UI
              </p>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Select
                value={formData.color_code}
                onValueChange={(value) => setFormData({ ...formData, color_code: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map(color => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded ${color.className}`} />
                        {color.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Color used for badges in the UI
              </p>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                placeholder="Leave 0 for default/auto"
                min="1"
                value={formData.sort_order === 0 ? '' : formData.sort_order}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({
                    ...formData,
                    sort_order: value === '' ? 0 : Math.max(1, parseInt(value) || 0)
                  });
                }}
              />
              <p className="text-xs text-muted-foreground">
                Enter a number (1 or higher) to set custom order. Leave empty or 0 for default (sorted alphabetically).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Textarea
                placeholder="Brief description of this variant type"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Type'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Variant Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name (Code)</Label>
              <Input
                value={formData.name}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Name cannot be changed after creation
              </p>
            </div>
            <div className="space-y-2">
              <Label>Display Name *</Label>
              <Input
                placeholder="e.g., Flavor, Battery, POSM"
                value={formData.display_name}
                onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <Select
                value={formData.color_code}
                onValueChange={(value) => setFormData({ ...formData, color_code: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colorOptions.map(color => (
                    <SelectItem key={color.value} value={color.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded ${color.className}`} />
                        {color.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sort Order</Label>
              <Input
                type="number"
                placeholder="Leave 0 for default/auto"
                min="1"
                value={formData.sort_order === 0 ? '' : formData.sort_order}
                onChange={(e) => {
                  const value = e.target.value;
                  setFormData({
                    ...formData,
                    sort_order: value === '' ? 0 : Math.max(1, parseInt(value) || 0)
                  });
                }}
              />
              <p className="text-xs text-muted-foreground">
                Enter a number (1 or higher) to set custom order. Leave empty or 0 for default (sorted alphabetically).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Textarea
                placeholder="Brief description of this variant type"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <Button className="w-full" onClick={handleEdit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Type'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Variant Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingType?.display_name}</strong>?
              This action cannot be undone. This type can only be deleted if no variants are using it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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

