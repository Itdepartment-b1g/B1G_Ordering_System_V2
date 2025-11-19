import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Plus, Edit, Trash2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface Company {
  id: string;
  name: string;
  email: string;
  superAdminName: string;
  superAdminEmail: string;
  status: 'active' | 'inactive';
  usersCount: number;
  createdAt: string;
}

const DEMO_COMPANIES: Company[] = [
  {
    id: 'acme',
    name: 'ACME Corporation',
    email: 'contact@acme.com',
    superAdminName: 'John Doe',
    superAdminEmail: 'superadmin@acme.com',
    status: 'active',
    usersCount: 45,
    createdAt: '2024-01-15',
  },
  {
    id: 'techcorp',
    name: 'TechCorp Industries',
    email: 'info@techcorp.com',
    superAdminName: 'Sarah Johnson',
    superAdminEmail: 'superadmin@techcorp.com',
    status: 'active',
    usersCount: 32,
    createdAt: '2024-02-20',
  },
  {
    id: 'globalmart',
    name: 'GlobalMart Ltd',
    email: 'contact@globalmart.com',
    superAdminName: 'Mike Wilson',
    superAdminEmail: 'superadmin@globalmart.com',
    status: 'active',
    usersCount: 67,
    createdAt: '2024-03-10',
  },
];

export default function Companies() {
  const { toast } = useToast();
  const [companies, setCompanies] = useState<Company[]>(DEMO_COMPANIES);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    superAdminName: '',
    superAdminEmail: '',
    superAdminPassword: '',
  });

  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newCompany: Company = {
      id: formData.name.toLowerCase().replace(/\s+/g, ''),
      name: formData.name,
      email: formData.email,
      superAdminName: formData.superAdminName,
      superAdminEmail: formData.superAdminEmail,
      status: 'active',
      usersCount: 1,
      createdAt: new Date().toISOString().split('T')[0],
    };

    setCompanies([...companies, newCompany]);
    setIsDialogOpen(false);
    setFormData({
      name: '',
      email: '',
      superAdminName: '',
      superAdminEmail: '',
      superAdminPassword: '',
    });

    toast({
      title: 'Company created',
      description: `${formData.name} has been successfully provisioned.`,
    });
  };

  const handleDeleteCompany = (companyId: string) => {
    setCompanies(companies.filter(c => c.id !== companyId));
    toast({
      title: 'Company deleted',
      description: 'The company has been removed from the system.',
      variant: 'destructive',
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Companies</h1>
              <p className="text-muted-foreground">
                Manage company accounts and provision new tenants
              </p>
            </div>
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
                  Provision a new company account with an initial Super Admin user
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateCompany} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      placeholder="ACME Corporation"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">Company Email</Label>
                    <Input
                      id="companyEmail"
                      type="email"
                      placeholder="contact@acme.com"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="superAdminName">Super Admin Name</Label>
                    <Input
                      id="superAdminName"
                      placeholder="John Doe"
                      value={formData.superAdminName}
                      onChange={(e) => setFormData({ ...formData, superAdminName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="superAdminEmail">Super Admin Email</Label>
                    <Input
                      id="superAdminEmail"
                      type="email"
                      placeholder="superadmin@acme.com"
                      value={formData.superAdminEmail}
                      onChange={(e) => setFormData({ ...formData, superAdminEmail: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="superAdminPassword">Initial Password</Label>
                  <Input
                    id="superAdminPassword"
                    type="password"
                    placeholder="Create a secure password"
                    value={formData.superAdminPassword}
                    onChange={(e) => setFormData({ ...formData, superAdminPassword: e.target.value })}
                    required
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Create Company</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-4">
          {companies.map((company) => (
            <Card key={company.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{company.name}</CardTitle>
                    <CardDescription>{company.email}</CardDescription>
                  </div>
                  <Badge variant={company.status === 'active' ? 'default' : 'secondary'}>
                    {company.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Super Admin</p>
                    <p className="font-medium">{company.superAdminName}</p>
                    <p className="text-sm text-muted-foreground">{company.superAdminEmail}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Users</p>
                    <p className="text-2xl font-bold">{company.usersCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-medium">{company.createdAt}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteCompany(company.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
