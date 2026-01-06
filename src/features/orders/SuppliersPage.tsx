import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit, Trash2, Loader2, Building2 } from 'lucide-react';
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

interface Supplier {
  id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export default function SuppliersPage() {
  const { user } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  // Form states
  const [supplierForm, setSupplierForm] = useState({
    company_name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    status: 'active' as 'active' | 'inactive'
  });
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { toast } = useToast();

  // Fetch suppliers
  const fetchSuppliers = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('suppliers')
        .select('id, company_name, contact_person, email, phone, address, status, created_at, updated_at')
        .order('company_name');

      if (error) throw error;
      setSuppliers(data || []);
    } catch (error: any) {
      console.error('Error fetching suppliers:', error);
      toast({
        title: 'Error',
        description: 'Failed to load suppliers',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // Filter suppliers by search query
  const filteredSuppliers = suppliers.filter(supplier =>
    supplier.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.contact_person.toLowerCase().includes(searchQuery.toLowerCase()) ||
    supplier.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Phone number formatting for Philippines with +63 prefix
  const formatPhilippinePhone = (value: string) => {
    // Always keep +63 prefix
    if (!value.startsWith('+63 ')) {
      value = '+63 ' + value.replace('+63', '').trim();
    }

    // Remove +63 prefix temporarily to work with the number
    const withoutPrefix = value.substring(4);

    // Remove all non-digit characters
    const cleaned = withoutPrefix.replace(/\D/g, '');

    // Format based on length: +63 9XX-XXX-XXXX (10 digits after +63)
    if (cleaned.length === 0) return '+63 ';
    if (cleaned.length <= 3) return `+63 ${cleaned}`;
    if (cleaned.length <= 6) return `+63 ${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;

    // Limit to 10 digits after +63 (Philippine mobile: 9XX-XXX-XXXX)
    return `+63 ${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };

  // Validate Philippine phone number
  const validatePhilippinePhone = (phone: string) => {
    // Remove +63 and all non-digit characters
    const cleaned = phone.replace('+63', '').replace(/\D/g, '');
    // Philippine mobile: 9XX-XXX-XXXX (10 digits starting with 9)
    return cleaned.length === 10 && cleaned.startsWith('9');
  };

  // Validation
  const validateForm = () => {
    if (!supplierForm.company_name.trim()) {
      toast({ title: 'Error', description: 'Company name is required', variant: 'destructive' });
      return false;
    }
    if (!supplierForm.contact_person.trim()) {
      toast({ title: 'Error', description: 'Contact person is required', variant: 'destructive' });
      return false;
    }
    if (!supplierForm.email.trim()) {
      toast({ title: 'Error', description: 'Email is required', variant: 'destructive' });
      return false;
    }
    if (!supplierForm.phone.trim()) {
      toast({ title: 'Error', description: 'Phone number is required', variant: 'destructive' });
      return false;
    }
    if (!validatePhilippinePhone(supplierForm.phone)) {
      toast({
        title: 'Error',
        description: 'Please enter a valid Philippine mobile number (e.g., +63 917-123-4567)',
        variant: 'destructive'
      });
      return false;
    }
    return true;
  };

  // Create Supplier
  const handleCreateSupplier = async () => {
    if (!validateForm()) return;

    if (!user?.company_id) {
      toast({ title: 'Error', description: 'User company information not found', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('suppliers')
        .insert({
          company_id: user.company_id,
          company_name: supplierForm.company_name.trim(),
          contact_person: supplierForm.contact_person.trim(),
          email: supplierForm.email.trim(),
          phone: supplierForm.phone.trim(),
          address: supplierForm.address.trim(),
          status: supplierForm.status
        });

      if (error) throw error;

      toast({ title: 'Success', description: 'Supplier created successfully' });
      resetForm();
      setCreateDialogOpen(false);
      await fetchSuppliers();
    } catch (error: any) {
      console.error('Error creating supplier:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create supplier',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Supplier
  const handleEditSupplier = async () => {
    if (!editingSupplier || !validateForm()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({
          company_name: supplierForm.company_name.trim(),
          contact_person: supplierForm.contact_person.trim(),
          email: supplierForm.email.trim(),
          phone: supplierForm.phone.trim(),
          address: supplierForm.address.trim(),
          status: supplierForm.status
        })
        .eq('id', editingSupplier.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Supplier updated successfully' });
      setEditDialogOpen(false);
      setEditingSupplier(null);
      resetForm();
      await fetchSuppliers();
    } catch (error: any) {
      console.error('Error updating supplier:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update supplier',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Supplier
  const handleDeleteSupplier = async () => {
    if (!deletingSupplier) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', deletingSupplier.id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Supplier deleted successfully' });
      setDeleteDialogOpen(false);
      setDeletingSupplier(null);
      await fetchSuppliers();
    } catch (error: any) {
      console.error('Error deleting supplier:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete supplier. It may have associated purchase orders.',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSupplierForm({
      company_name: '',
      contact_person: '',
      email: '',
      phone: '',
      address: '',
      status: 'active'
    });
  };

  const openEditDialog = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setSupplierForm({
      company_name: supplier.company_name,
      contact_person: supplier.contact_person,
      email: supplier.email,
      phone: supplier.phone,
      address: supplier.address,
      status: supplier.status
    });
    setEditDialogOpen(true);
  };

  const openViewDialog = (supplier: Supplier) => {
    setViewingSupplier(supplier);
    setViewDialogOpen(true);
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
          <h1 className="text-3xl font-bold">Supplier Management</h1>
          <p className="text-muted-foreground">Manage your suppliers and vendor contacts</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Supplier
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{suppliers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {suppliers.filter(s => s.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {suppliers.filter(s => s.status === 'inactive').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">B1G Corporation</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {suppliers.filter(s => s.company_name === 'B1G Corporation').length > 0 ? '✓' : '✗'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search suppliers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile View */}
          <div className="md:hidden space-y-3">
            {filteredSuppliers.map(supplier => (
              <div key={supplier.id} className="rounded-lg border bg-background p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold">{supplier.company_name}</h4>
                  <Badge variant={supplier.status === 'active' ? 'default' : 'secondary'}>
                    {supplier.status}
                  </Badge>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Contact: {supplier.contact_person}</p>
                  <p>Email: {supplier.email}</p>
                  <p>Phone: {supplier.phone}</p>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={() => openViewDialog(supplier)}>
                    View
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(supplier)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeletingSupplier(supplier);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSuppliers.map(supplier => (
                  <TableRow key={supplier.id}>
                    <TableCell className="font-medium">{supplier.company_name}</TableCell>
                    <TableCell>{supplier.contact_person}</TableCell>
                    <TableCell>{supplier.email}</TableCell>
                    <TableCell>{supplier.phone}</TableCell>
                    <TableCell>
                      <Badge variant={supplier.status === 'active' ? 'default' : 'secondary'}>
                        {supplier.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openViewDialog(supplier)}
                        >
                          <Building2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(supplier)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDeletingSupplier(supplier);
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
          </div>
        </CardContent>
      </Card>

      {/* Create Supplier Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input
                  placeholder="e.g., Company Name"
                  value={supplierForm.company_name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, company_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Person *</Label>
                <Input
                  placeholder="e.g., John Doe"
                  value={supplierForm.contact_person}
                  onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="supplier@example.com"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone *</Label>
                <Input
                  placeholder="+63 917-123-4567"
                  value={supplierForm.phone || '+63 '}
                  onChange={(e) => {
                    const formatted = formatPhilippinePhone(e.target.value);
                    setSupplierForm({ ...supplierForm, phone: formatted });
                  }}
                  onFocus={(e) => {
                    if (!supplierForm.phone || supplierForm.phone === '') {
                      setSupplierForm({ ...supplierForm, phone: '+63 ' });
                    }
                  }}
                  maxLength={17}
                />
                <p className="text-xs text-muted-foreground">Format: +63 9XX-XXX-XXXX</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea
                placeholder="Complete address"
                value={supplierForm.address}
                onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={supplierForm.status}
                onValueChange={(value: 'active' | 'inactive') => setSupplierForm({ ...supplierForm, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleCreateSupplier} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Supplier'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Supplier Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Name *</Label>
                <Input
                  placeholder="e.g., B1G Corporation"
                  value={supplierForm.company_name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, company_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Person *</Label>
                <Input
                  placeholder="e.g., John Doe"
                  value={supplierForm.contact_person}
                  onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="supplier@example.com"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone *</Label>
                <Input
                  placeholder="+63 917-123-4567"
                  value={supplierForm.phone || '+63 '}
                  onChange={(e) => {
                    const formatted = formatPhilippinePhone(e.target.value);
                    setSupplierForm({ ...supplierForm, phone: formatted });
                  }}
                  onFocus={(e) => {
                    if (!supplierForm.phone || supplierForm.phone === '') {
                      setSupplierForm({ ...supplierForm, phone: '+63 ' });
                    }
                  }}
                  maxLength={17}
                />
                <p className="text-xs text-muted-foreground">Format: +63 9XX-XXX-XXXX</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea
                placeholder="Complete address"
                value={supplierForm.address}
                onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={supplierForm.status}
                onValueChange={(value: 'active' | 'inactive') => setSupplierForm({ ...supplierForm, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleEditSupplier} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Supplier'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Supplier Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Supplier Details</DialogTitle>
          </DialogHeader>
          {viewingSupplier && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Company Name</Label>
                  <p className="font-medium mt-1">{viewingSupplier.company_name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge variant={viewingSupplier.status === 'active' ? 'default' : 'secondary'}>
                      {viewingSupplier.status}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Contact Person</Label>
                  <p className="font-medium mt-1">{viewingSupplier.contact_person}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Phone</Label>
                  <p className="font-medium mt-1">{viewingSupplier.phone}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="font-medium mt-1">{viewingSupplier.email}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Address</Label>
                <p className="font-medium mt-1">{viewingSupplier.address}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p className="font-medium mt-1">
                    {new Date(viewingSupplier.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Last Updated</Label>
                  <p className="font-medium mt-1">
                    {new Date(viewingSupplier.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Supplier Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deletingSupplier?.company_name}</strong>?
              This action cannot be undone. All purchase orders associated with this supplier must be reassigned or deleted first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSupplier}
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

