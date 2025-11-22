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
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Building2, User } from 'lucide-react';

interface Company {
    id: string;
    name: string;
    email: string;
    subscription_status: string;
    created_at: string;
}

export default function SystemAdminPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const [newCompany, setNewCompany] = useState({
        name: '',
        companyEmail: '',
        adminEmail: '',
        adminName: '',
        adminPassword: ''
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
        if (!newCompany.name || !newCompany.companyEmail || !newCompany.adminEmail || !newCompany.adminName || !newCompany.adminPassword) {
            toast({
                variant: "destructive",
                title: "Missing fields",
                description: "Please fill in all fields"
            });
            return;
        }

        try {
            setIsCreating(true);

            const { data, error } = await supabase.functions.invoke('create-company', {
                body: {
                    company_name: newCompany.name,
                    company_email: newCompany.companyEmail,
                    admin_email: newCompany.adminEmail,
                    admin_name: newCompany.adminName,
                    admin_password: newCompany.adminPassword
                }
            });

            if (error) throw error;

            toast({
                title: "Success",
                description: "Company and Admin created successfully"
            });

            setIsDialogOpen(false);
            setNewCompany({ name: '', companyEmail: '', adminEmail: '', adminName: '', adminPassword: '' });
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

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">System Administration</h1>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Company
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create New Company</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Company Name</Label>
                                <Input
                                    value={newCompany.name}
                                    onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                                    placeholder="e.g. Acme Corp"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Company Email</Label>
                                <Input
                                    value={newCompany.companyEmail}
                                    onChange={(e) => setNewCompany({ ...newCompany, companyEmail: e.target.value })}
                                    placeholder="info@acmecorp.com"
                                    type="email"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Admin Name</Label>
                                <Input
                                    value={newCompany.adminName}
                                    onChange={(e) => setNewCompany({ ...newCompany, adminName: e.target.value })}
                                    placeholder="Full Name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Admin Email</Label>
                                <Input
                                    value={newCompany.adminEmail}
                                    onChange={(e) => setNewCompany({ ...newCompany, adminEmail: e.target.value })}
                                    placeholder="admin@example.com"
                                    type="email"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Admin Password</Label>
                                <Input
                                    value={newCompany.adminPassword}
                                    onChange={(e) => setNewCompany({ ...newCompany, adminPassword: e.target.value })}
                                    placeholder="********"
                                    type="password"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleCreateCompany} disabled={isCreating}>
                                {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Create Company
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {companies.map((company) => (
                    <Card key={company.id}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {company.name}
                            </CardTitle>
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{company.subscription_status}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {company.email}
                            </p>
                            <div className="mt-4 text-xs text-muted-foreground flex items-center">
                                <User className="mr-1 h-3 w-3" />
                                Created: {new Date(company.created_at).toLocaleDateString()}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
