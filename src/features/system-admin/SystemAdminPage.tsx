import { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Loader2, Plus, Building2, User, Mail, Calendar, Eye, Badge as BadgeIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { Company } from '@/types/database.types';

export default function SystemAdminPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

    const [newCompany, setNewCompany] = useState({
        company_name: '',
        company_email: '',
        super_admin_name: '',
        super_admin_email: '',
    });

    useEffect(() => {
        fetchCompanies();
    }, []);

    const fetchCompanies = async () => {
        try {
            const { data, error } = await supabase
                .from('companies')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setCompanies(data || []);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error fetching companies",
                description: error.message
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateCompany = async () => {
        if (!newCompany.company_name || !newCompany.company_email || !newCompany.super_admin_email || !newCompany.super_admin_name) {
            toast({
                variant: "destructive",
                title: "Missing fields",
                description: "Please fill in all required fields"
            });
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newCompany.company_email) || !emailRegex.test(newCompany.super_admin_email)) {
            toast({
                variant: "destructive",
                title: "Invalid email",
                description: "Please enter valid email addresses"
            });
            return;
        }

        try {
            setIsCreating(true);

            // Get Supabase URL from the client
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            if (!supabaseUrl) {
                throw new Error('Supabase URL not configured');
            }

            // Call the Edge Function to create company and user
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData?.session?.access_token;

            if (!accessToken) {
                throw new Error('Not authenticated');
            }

            const response = await fetch(`${supabaseUrl}/functions/v1/create-company`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
                },
                body: JSON.stringify({
                    company_name: newCompany.company_name,
                    company_email: newCompany.company_email,
                    super_admin_name: newCompany.super_admin_name,
                    super_admin_email: newCompany.super_admin_email,
                    super_admin_password: 'tempPassword123!', // Default password
                }),
            });

            if (!response.ok) {
                let errorMessage = 'Failed to create company and super admin';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch {
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to create company and super admin');
            }

            toast({
                title: "Success",
                description: "Company and Super Admin created successfully"
            });

            setIsDialogOpen(false);
            setNewCompany({ company_name: '', company_email: '', super_admin_name: '', super_admin_email: '' });
            fetchCompanies();

        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message
            });
        } finally {
            setIsCreating(false);
        }
    };

    const handleViewDetails = (company: Company) => {
        setSelectedCompany(company);
        setDetailsDialogOpen(true);
    };

    const getStatusBadge = (status: string) => {
        if (status === 'active') {
            return <Badge variant="default">Active</Badge>;
        }
        return <Badge variant="destructive">Inactive</Badge>;
    };

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">System Administration</h1>
                    <p className="text-muted-foreground mt-2">
                        Manage all companies and their super administrators
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Company
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Create New Company</DialogTitle>
                            <DialogDescription>
                                Add a new company and create their super administrator account. The super admin will be able to manage their company's data.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-6 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="company_name">Company Name *</Label>
                                <Input
                                    id="company_name"
                                    value={newCompany.company_name}
                                    onChange={(e) => setNewCompany({ ...newCompany, company_name: e.target.value })}
                                    placeholder="e.g. Acme Corporation"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="company_email">Company Email *</Label>
                                <Input
                                    id="company_email"
                                    type="email"
                                    value={newCompany.company_email}
                                    onChange={(e) => setNewCompany({ ...newCompany, company_email: e.target.value })}
                                    placeholder="info@acmecorp.com"
                                />
                            </div>
                            <div className="border-t pt-6">
                                <h3 className="text-sm font-semibold mb-5">Super Administrator Details</h3>
                                <div className="space-y-5">
                                    <div className="space-y-2">
                                        <Label htmlFor="super_admin_name">Super Admin Name *</Label>
                                        <Input
                                            id="super_admin_name"
                                            value={newCompany.super_admin_name}
                                            onChange={(e) => setNewCompany({ ...newCompany, super_admin_name: e.target.value })}
                                            placeholder="Full Name"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="super_admin_email">Super Admin Email *</Label>
                                        <Input
                                            id="super_admin_email"
                                            type="email"
                                            value={newCompany.super_admin_email}
                                            onChange={(e) => setNewCompany({ ...newCompany, super_admin_email: e.target.value })}
                                            placeholder="admin@acmecorp.com"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isCreating}>
                                Cancel
                            </Button>
                            <Button onClick={handleCreateCompany} disabled={isCreating}>
                                {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Create Company
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Summary Cards */}
            <div className="grid gap-6 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{companies.length}</div>
                        <p className="text-xs text-muted-foreground mt-1">Active companies in system</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium">Active Companies</CardTitle>
                        <BadgeIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {companies.filter((c) => c.status === 'active').length}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Currently active</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <CardTitle className="text-sm font-medium">Inactive Companies</CardTitle>
                        <BadgeIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {companies.filter((c) => c.status === 'inactive').length}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Currently inactive</p>
                    </CardContent>
                </Card>
            </div>

            {/* Companies Table */}
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle>All Companies</CardTitle>
                </CardHeader>
                <CardContent>
                    {companies.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p className="text-base">No companies found</p>
                            <p className="text-sm mt-2">Click "Add Company" to create your first company</p>
                        </div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="h-12">Company Name</TableHead>
                                        <TableHead className="h-12">Company Email</TableHead>
                                        <TableHead className="h-12">Super Admin</TableHead>
                                        <TableHead className="h-12">Super Admin Email</TableHead>
                                        <TableHead className="h-12">Status</TableHead>
                                        <TableHead className="h-12">Created At</TableHead>
                                        <TableHead className="h-12">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {companies.map((company) => (
                                        <TableRow key={company.id} className="h-14">
                                            <TableCell className="font-medium py-4">{company.company_name}</TableCell>
                                            <TableCell className="py-4">
                                                <div className="flex items-center gap-2">
                                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                                    {company.company_email}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <div className="flex items-center gap-2">
                                                    <User className="h-4 w-4 text-muted-foreground" />
                                                    {company.super_admin_name}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4">{company.super_admin_email}</TableCell>
                                            <TableCell className="py-4">{getStatusBadge(company.status)}</TableCell>
                                            <TableCell className="py-4">
                                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Calendar className="h-4 w-4" />
                                                    {new Date(company.created_at).toLocaleDateString()}
                                                </div>
                                            </TableCell>
                                            <TableCell className="py-4">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleViewDetails(company)}
                                                >
                                                    <Eye className="h-4 w-4 mr-2" />
                                                    View Details
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Company Details Dialog */}
            <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Company Details</DialogTitle>
                        <DialogDescription>
                            Detailed information about the selected company
                        </DialogDescription>
                    </DialogHeader>
                    {selectedCompany && (
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label className="text-sm font-semibold">Company Name</Label>
                                    <p className="text-sm mt-1">{selectedCompany.company_name}</p>
                                </div>
                                <div>
                                    <Label className="text-sm font-semibold">Company Email</Label>
                                    <p className="text-sm mt-1">{selectedCompany.company_email}</p>
                                </div>
                                <div>
                                    <Label className="text-sm font-semibold">Super Admin Name</Label>
                                    <p className="text-sm mt-1">{selectedCompany.super_admin_name}</p>
                                </div>
                                <div>
                                    <Label className="text-sm font-semibold">Super Admin Email</Label>
                                    <p className="text-sm mt-1">{selectedCompany.super_admin_email}</p>
                                </div>
                                <div>
                                    <Label className="text-sm font-semibold">Status</Label>
                                    <div className="mt-1">{getStatusBadge(selectedCompany.status)}</div>
                                </div>
                                <div>
                                    <Label className="text-sm font-semibold">Created At</Label>
                                    <p className="text-sm mt-1">
                                        {new Date(selectedCompany.created_at).toLocaleString()}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-sm font-semibold">Updated At</Label>
                                    <p className="text-sm mt-1">
                                        {selectedCompany.updated_at 
                                            ? new Date(selectedCompany.updated_at).toLocaleString()
                                            : 'N/A'}
                                    </p>
                                </div>
                                <div>
                                    <Label className="text-sm font-semibold">Company ID</Label>
                                    <p className="text-sm mt-1 font-mono text-xs">{selectedCompany.id}</p>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
