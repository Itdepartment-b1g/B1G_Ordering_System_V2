import { useState, useEffect } from 'react';
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
import { Loader2, Plus, User, Mail, Calendar, Eye, EyeOff, Edit, Building2, Shield, Search, Activity, ChevronRight, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { Profile, Company, ExecutiveCompanyAssignment } from '@/types/database.types';
import { useAuth } from '@/features/auth';
import { motion, AnimatePresence } from 'framer-motion';

interface ExecutiveWithAssignments extends Profile {
    assignments?: ExecutiveCompanyAssignment[];
    assignedCompanies?: Company[];
}

export function ExecutiveAccountsTab() {
    const { toast } = useToast();
    const { user } = useAuth();
    const [executives, setExecutives] = useState<ExecutiveWithAssignments[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
    const [selectedExecutive, setSelectedExecutive] = useState<ExecutiveWithAssignments | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    
    const [newExecutive, setNewExecutive] = useState({
        full_name: '',
        email: '',
        phone: '',
        password: '',
        company_ids: [] as string[],
    });

    const [editExecutive, setEditExecutive] = useState({
        id: '',
        full_name: '',
        email: '',
        phone: '',
        company_ids: [] as string[],
    });

    useEffect(() => {
        fetchExecutives();
        fetchCompanies();
    }, []);

    const fetchExecutives = async () => {
        try {
            setIsLoading(true);
            
            // Fetch all executives
            const { data: executivesData, error: executivesError } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'executive')
                .order('created_at', { ascending: false });

            if (executivesError) throw executivesError;

            // Fetch assignments for each executive
            if (executivesData && executivesData.length > 0) {
                const executiveIds = executivesData.map(e => e.id);
                
                const { data: assignmentsData, error: assignmentsError } = await supabase
                    .from('executive_company_assignments')
                    .select(`
                        *,
                        company:companies(*)
                    `)
                    .in('executive_id', executiveIds);

                if (assignmentsError) throw assignmentsError;

                // Group assignments by executive
                const executivesWithAssignments = executivesData.map(exec => ({
                    ...exec,
                    assignments: assignmentsData?.filter(a => a.executive_id === exec.id) || [],
                    assignedCompanies: assignmentsData
                        ?.filter(a => a.executive_id === exec.id)
                        .map(a => a.company)
                        .filter(Boolean) || []
                }));

                setExecutives(executivesWithAssignments);
            } else {
                setExecutives([]);
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error fetching executives",
                description: error.message
            });
        } finally {
            setIsLoading(false);
        }
    };

    const fetchCompanies = async () => {
        try {
            const { data, error } = await supabase
                .from('companies')
                .select('*')
                .eq('status', 'active')
                .order('company_name');

            if (error) throw error;
            setCompanies(data || []);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error fetching companies",
                description: error.message
            });
        }
    };

    const handleCreateExecutive = async () => {
        if (!newExecutive.full_name || !newExecutive.email || !newExecutive.password) {
            toast({
                variant: "destructive",
                title: "Missing fields",
                description: "Please fill in all required fields"
            });
            return;
        }

        if (newExecutive.company_ids.length === 0) {
            toast({
                variant: "destructive",
                title: "No companies selected",
                description: "Please select at least one company for the executive"
            });
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newExecutive.email)) {
            toast({
                variant: "destructive",
                title: "Invalid email",
                description: "Please enter a valid email address"
            });
            return;
        }

        try {
            setIsCreating(true);

            // Get Supabase URL
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            if (!supabaseUrl) {
                throw new Error('Supabase URL not configured');
            }

            // Get access token
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData?.session?.access_token;

            if (!accessToken) {
                throw new Error('Not authenticated');
            }

            // Call the Edge Function
            const response = await fetch(`${supabaseUrl}/functions/v1/create-executive`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
                },
                body: JSON.stringify({
                    full_name: newExecutive.full_name,
                    email: newExecutive.email,
                    password: newExecutive.password,
                    phone: newExecutive.phone || null,
                    company_ids: newExecutive.company_ids,
                }),
            });

            if (!response.ok) {
                let errorMessage = 'Failed to create executive account';
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
                throw new Error(result.error || 'Failed to create executive account');
            }

            toast({
                title: "Success",
                description: "Executive account created successfully"
            });

            setIsDialogOpen(false);
            setNewExecutive({ 
                full_name: '', 
                email: '', 
                phone: '', 
                password: '', 
                company_ids: [] 
            });
            setShowPassword(false);
            fetchExecutives();

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

    const handleEditExecutive = async () => {
        if (!editExecutive.id || editExecutive.company_ids.length === 0) {
            toast({
                variant: "destructive",
                title: "Invalid data",
                description: "Please select at least one company"
            });
            return;
        }

        try {
            setIsCreating(true);

            // Update profile info
            const { error: profileError } = await supabase
                .from('profiles')
                .update({
                    full_name: editExecutive.full_name,
                    phone: editExecutive.phone || null,
                })
                .eq('id', editExecutive.id);

            if (profileError) throw profileError;

            // Delete existing assignments
            const { error: deleteError } = await supabase
                .from('executive_company_assignments')
                .delete()
                .eq('executive_id', editExecutive.id);

            if (deleteError) throw deleteError;

            // Insert new assignments
            const assignments = editExecutive.company_ids.map(companyId => ({
                executive_id: editExecutive.id,
                company_id: companyId,
                assigned_by: user?.id,
            }));

            const { error: insertError } = await supabase
                .from('executive_company_assignments')
                .insert(assignments);

            if (insertError) throw insertError;

            toast({
                title: "Success",
                description: "Executive account updated successfully"
            });

            setEditDialogOpen(false);
            fetchExecutives();

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

    const openEditDialog = (executive: ExecutiveWithAssignments) => {
        setEditExecutive({
            id: executive.id,
            full_name: executive.full_name,
            email: executive.email,
            phone: executive.phone || '',
            company_ids: executive.assignments?.map(a => a.company_id) || [],
        });
        setEditDialogOpen(true);
    };

    const openDetailsDialog = (executive: ExecutiveWithAssignments) => {
        setSelectedExecutive(executive);
        setDetailsDialogOpen(true);
    };

    const toggleCompanySelection = (companyId: string, isNew: boolean = true) => {
        if (isNew) {
            setNewExecutive(prev => ({
                ...prev,
                company_ids: prev.company_ids.includes(companyId)
                    ? prev.company_ids.filter(id => id !== companyId)
                    : [...prev.company_ids, companyId]
            }));
        } else {
            setEditExecutive(prev => ({
                ...prev,
                company_ids: prev.company_ids.includes(companyId)
                    ? prev.company_ids.filter(id => id !== companyId)
                    : [...prev.company_ids, companyId]
            }));
        }
    };

    const getStatusBadge = (status: string) => {
        if (status === 'active') {
            return <Badge variant="default">Active</Badge>;
        }
        return <Badge variant="destructive">Inactive</Badge>;
    };

    const filteredExecutives = executives.filter(exec =>
        exec.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exec.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        exec.assignedCompanies?.some(c => c.company_name.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary opacity-50" />
                <p className="text-muted-foreground font-medium animate-pulse">Loading Executive Accounts...</p>
            </div>
        );
    }

    return (
        <div className="space-y-12">
            {/* Hero Section */}
            <div className="flex flex-col md:flex-row items-end justify-between gap-8 pb-4 border-b">
                <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
                        <Shield className="h-3 w-3" />
                        C-Suite Access
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tighter">
                        EXECUTIVE <span className="text-primary italic">ACCOUNTS</span>
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
                        Manage high-level executive accounts with cross-company visibility. Executives can view aggregated data from multiple companies in a unified dashboard.
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden lg:block text-right">
                        <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Total Accounts</p>
                        <p className="text-sm font-semibold flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            {executives.length} Active
                        </p>
                    </div>
                    <div className="h-12 w-px bg-border mx-2" />
                    <Dialog open={isDialogOpen} onOpenChange={(open) => {
                        setIsDialogOpen(open);
                        if (!open) setShowPassword(false);
                    }}>
                        <DialogTrigger asChild>
                            <Button 
                                size="lg" 
                                className="rounded-xl px-6 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground transform transition-all active:scale-95"
                            >
                                <Plus className="mr-2 h-5 w-5" />
                                Add Executive
                            </Button>
                        </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] rounded-3xl p-0 overflow-hidden">
                        {/* Premium Header with Gradient */}
                        <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-primary/5 border-b px-6 py-6 md:px-8 md:py-8">
                            <div className="absolute top-0 right-0 p-8 opacity-5">
                                <Shield className="h-32 w-32 -rotate-12" />
                            </div>
                            <div className="relative flex items-start gap-4">
                                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner shrink-0">
                                    <Shield className="h-7 w-7 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <DialogTitle className="text-2xl md:text-3xl font-black tracking-tight">
                                        CREATE EXECUTIVE <span className="text-primary italic">ACCOUNT</span>
                                    </DialogTitle>
                                    <DialogDescription className="text-base mt-2 leading-relaxed">
                                        Provision a high-level account with cross-company visibility and aggregated analytics access.
                                    </DialogDescription>
                                </div>
                            </div>
                        </div>

                        <ScrollArea className="max-h-[calc(90vh-250px)]">
                            <div className="px-6 py-6 md:px-8 md:py-8 space-y-8">
                                {/* Personal Information Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 mb-4">
                                        <User className="h-5 w-5 text-primary" />
                                        <h3 className="text-lg font-bold">Personal Information</h3>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="full_name" className="text-sm font-semibold flex items-center gap-1.5">
                                                Full Name
                                                <span className="text-destructive">*</span>
                                            </Label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="full_name"
                                                    value={newExecutive.full_name}
                                                    onChange={(e) => setNewExecutive({ ...newExecutive, full_name: e.target.value })}
                                                    placeholder="John Doe"
                                                    className="h-12 rounded-xl pl-10 border-2 focus-visible:border-primary"
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <Label htmlFor="email" className="text-sm font-semibold flex items-center gap-1.5">
                                                Email Address
                                                <span className="text-destructive">*</span>
                                            </Label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    value={newExecutive.email}
                                                    onChange={(e) => setNewExecutive({ ...newExecutive, email: e.target.value })}
                                                    placeholder="executive@company.com"
                                                    className="h-12 rounded-xl pl-10 border-2 focus-visible:border-primary"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="phone" className="text-sm font-semibold">Phone Number</Label>
                                            <div className="relative">
                                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="phone"
                                                    value={newExecutive.phone}
                                                    onChange={(e) => setNewExecutive({ ...newExecutive, phone: e.target.value })}
                                                    placeholder="+1 (555) 000-0000"
                                                    className="h-12 rounded-xl pl-10 border-2 focus-visible:border-primary"
                                                />
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <Label htmlFor="password" className="text-sm font-semibold flex items-center gap-1.5">
                                                Password
                                                <span className="text-destructive">*</span>
                                            </Label>
                                            <div className="relative">
                                                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="password"
                                                    type={showPassword ? "text" : "password"}
                                                    value={newExecutive.password}
                                                    onChange={(e) => setNewExecutive({ ...newExecutive, password: e.target.value })}
                                                    placeholder="••••••••"
                                                    className="h-12 rounded-xl pl-10 pr-10 border-2 focus-visible:border-primary"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                                                >
                                                    {showPassword ? (
                                                        <EyeOff className="h-4 w-4" />
                                                    ) : (
                                                        <Eye className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
                                            <p className="text-xs text-muted-foreground">Minimum 6 characters required</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Company Assignment Section */}
                                <div className="space-y-4 pt-6 border-t">
                                    <div className="flex items-start justify-between gap-4 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                                <Building2 className="h-5 w-5 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold">Company Access</h3>
                                                <p className="text-xs text-muted-foreground">Assign visibility permissions</p>
                                            </div>
                                        </div>
                                        <Badge variant="secondary" className="text-base px-3 py-1 font-bold">
                                            {newExecutive.company_ids.length} / {companies.length}
                                        </Badge>
                                    </div>
                                    
                                    <p className="text-sm text-muted-foreground leading-relaxed bg-muted/30 p-4 rounded-xl border">
                                        Select companies this executive can view. They will see aggregated analytics and performance data from all selected organizations in a unified dashboard.
                                    </p>
                                    
                                    <div className="space-y-2 max-h-72 overflow-y-auto border-2 rounded-2xl p-3 md:p-4 bg-gradient-to-br from-muted/20 to-muted/10">
                                        {companies.map((company) => (
                                            <div 
                                                key={company.id} 
                                                className="flex items-start md:items-center gap-3 p-3 md:p-4 rounded-xl hover:bg-accent/50 transition-all duration-200 border border-transparent hover:border-primary/20 group cursor-pointer"
                                                onClick={() => toggleCompanySelection(company.id, true)}
                                            >
                                                <Checkbox
                                                    id={`company-${company.id}`}
                                                    checked={newExecutive.company_ids.includes(company.id)}
                                                    onCheckedChange={() => toggleCompanySelection(company.id, true)}
                                                    className="mt-0.5 md:mt-0"
                                                />
                                                <Label
                                                    htmlFor={`company-${company.id}`}
                                                    className="text-sm cursor-pointer flex-1 min-w-0"
                                                >
                                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 md:gap-4">
                                                        <span className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                                                            {company.company_name}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground truncate md:text-right">
                                                            {company.company_email}
                                                        </span>
                                                    </div>
                                                </Label>
                                            </div>
                                        ))}
                                        {companies.length === 0 && (
                                            <div className="text-center py-12">
                                                <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                                                <p className="text-sm text-muted-foreground">No active companies available</p>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {newExecutive.company_ids.length > 0 && (
                                        <div className="flex items-center gap-2 text-sm p-4 bg-primary/5 rounded-xl border border-primary/20">
                                            <Activity className="h-4 w-4 text-primary" />
                                            <span className="font-semibold text-primary">
                                                {newExecutive.company_ids.length} {newExecutive.company_ids.length === 1 ? 'company' : 'companies'} selected
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </ScrollArea>

                        {/* Premium Footer */}
                        <div className="border-t bg-muted/20 px-6 py-4 md:px-8 md:py-6 flex flex-col-reverse md:flex-row items-stretch md:items-center justify-end gap-3">
                            <Button 
                                variant="outline" 
                                onClick={() => setIsDialogOpen(false)} 
                                disabled={isCreating}
                                className="rounded-xl h-12 text-base font-semibold"
                            >
                                Cancel
                            </Button>
                            <Button 
                                onClick={handleCreateExecutive} 
                                disabled={isCreating}
                                className="rounded-xl h-12 text-base font-bold shadow-lg shadow-primary/30 px-8"
                            >
                                {isCreating ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Creating Account...
                                    </>
                                ) : (
                                    <>
                                        <Shield className="mr-2 h-5 w-5" />
                                        Create Executive Account
                                    </>
                                )}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
            </div>

            {/* Search and Filter */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="relative w-full md:max-w-md group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                            placeholder="Search by name, email, or company..."
                            className="pl-11 h-12 rounded-2xl border-2 focus-visible:ring-primary/20 bg-muted/20"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Users className="h-4 w-4" />
                        {filteredExecutives.length} result(s)
                    </div>
                </div>

                {executives.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center py-24 space-y-4 bg-muted/30 rounded-3xl border-2 border-dashed"
                    >
                        <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <Shield className="h-10 w-10 text-primary opacity-50" />
                        </div>
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-bold">No executives yet</h3>
                            <p className="text-muted-foreground max-w-md">
                                Click "Add Executive" to create your first executive account with cross-company access
                            </p>
                        </div>
                    </motion.div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <AnimatePresence>
                            {filteredExecutives.map((executive, index) => (
                                <motion.div
                                    key={executive.id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.3, delay: index * 0.05 }}
                                >
                                    <Card
                                        className="group relative overflow-hidden bg-card hover:bg-accent border-2 hover:border-primary/50 cursor-pointer transition-all duration-300 rounded-[2rem] h-full shadow-sm hover:shadow-2xl hover:shadow-primary/5 active:scale-[0.98]"
                                        onClick={() => openDetailsDialog(executive)}
                                    >
                                        {/* Background Decoration */}
                                        <div className="absolute top-0 right-0 p-8 opacity-5">
                                            <Shield className="h-32 w-32 -rotate-12" />
                                        </div>

                                        <CardContent className="p-8 space-y-6 relative">
                                            {/* Header with Icon and Status */}
                                            <div className="flex items-start justify-between">
                                                <div className="h-14 w-14 rounded-2xl bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                                    <User className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className={`h-2.5 w-2.5 rounded-full ${
                                                        executive.status === 'active' 
                                                            ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' 
                                                            : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                                                    }`} />
                                                </div>
                                            </div>

                                            {/* Executive Info */}
                                            <div>
                                                <h3 className="text-xl font-extrabold tracking-tight italic group-hover:text-primary transition-colors line-clamp-1">
                                                    {executive.full_name.toUpperCase()}
                                                </h3>
                                                <p className="text-sm text-muted-foreground font-medium line-clamp-1 mt-1">
                                                    {executive.email}
                                                </p>
                                                {executive.phone && (
                                                    <p className="text-xs text-muted-foreground mt-1">{executive.phone}</p>
                                                )}
                                            </div>

                                            {/* Company Assignments */}
                                            <div className="space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                        {executive.assignedCompanies?.length || 0} Companies
                                                    </span>
                                                </div>
                                                {executive.assignedCompanies && executive.assignedCompanies.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {executive.assignedCompanies.slice(0, 3).map((company) => (
                                                            <Badge 
                                                                key={company.id} 
                                                                variant="secondary" 
                                                                className="text-[10px] px-2 py-0.5"
                                                            >
                                                                {company.company_name}
                                                            </Badge>
                                                        ))}
                                                        {executive.assignedCompanies.length > 3 && (
                                                            <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                                                                +{executive.assignedCompanies.length - 3} more
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Footer Actions */}
                                            <div className="pt-4 flex items-center justify-between border-t border-muted-foreground/10 group-hover:border-primary/20 transition-colors">
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <Calendar className="h-3 w-3" />
                                                    {new Date(executive.created_at).toLocaleDateString()}
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="rounded-xl h-8 px-3"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openEditDialog(executive);
                                                    }}
                                                >
                                                    <Edit className="h-3 w-3 mr-1" />
                                                    Edit
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* Edit Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] rounded-3xl p-0 overflow-hidden">
                    {/* Premium Header */}
                    <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-primary/5 border-b px-6 py-6 md:px-8 md:py-8">
                        <div className="absolute top-0 right-0 p-8 opacity-5">
                            <Edit className="h-32 w-32 -rotate-12" />
                        </div>
                        <div className="relative flex items-start gap-4">
                            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner shrink-0">
                                <Edit className="h-7 w-7 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <DialogTitle className="text-2xl md:text-3xl font-black tracking-tight">
                                    EDIT EXECUTIVE <span className="text-primary italic">ACCOUNT</span>
                                </DialogTitle>
                                <DialogDescription className="text-base mt-2 leading-relaxed">
                                    Update account information and modify company access permissions.
                                </DialogDescription>
                            </div>
                        </div>
                    </div>

                    <ScrollArea className="max-h-[calc(90vh-250px)]">
                        <div className="px-6 py-6 md:px-8 md:py-8 space-y-8">
                            {/* Personal Information */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-4">
                                    <User className="h-5 w-5 text-primary" />
                                    <h3 className="text-lg font-bold">Personal Information</h3>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="edit_full_name" className="text-sm font-semibold flex items-center gap-1.5">
                                            Full Name
                                            <span className="text-destructive">*</span>
                                        </Label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                id="edit_full_name"
                                                value={editExecutive.full_name}
                                                onChange={(e) => setEditExecutive({ ...editExecutive, full_name: e.target.value })}
                                                className="h-12 rounded-xl pl-10 border-2 focus-visible:border-primary"
                                            />
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        <Label htmlFor="edit_email" className="text-sm font-semibold">Email (Read Only)</Label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                                            <Input
                                                id="edit_email"
                                                value={editExecutive.email}
                                                disabled
                                                className="bg-muted/50 h-12 rounded-xl pl-10 border-2 cursor-not-allowed"
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="space-y-2">
                                    <Label htmlFor="edit_phone" className="text-sm font-semibold">Phone Number</Label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="edit_phone"
                                            value={editExecutive.phone}
                                            onChange={(e) => setEditExecutive({ ...editExecutive, phone: e.target.value })}
                                            placeholder="+1 (555) 000-0000"
                                            className="h-12 rounded-xl pl-10 border-2 focus-visible:border-primary"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Company Assignment */}
                            <div className="space-y-4 pt-6 border-t">
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                            <Building2 className="h-5 w-5 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold">Company Access</h3>
                                            <p className="text-xs text-muted-foreground">Modify visibility permissions</p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="text-base px-3 py-1 font-bold">
                                        {editExecutive.company_ids.length} / {companies.length}
                                    </Badge>
                                </div>
                                
                                <div className="space-y-2 max-h-72 overflow-y-auto border-2 rounded-2xl p-3 md:p-4 bg-gradient-to-br from-muted/20 to-muted/10">
                                    {companies.map((company) => (
                                        <div 
                                            key={company.id} 
                                            className="flex items-start md:items-center gap-3 p-3 md:p-4 rounded-xl hover:bg-accent/50 transition-all duration-200 border border-transparent hover:border-primary/20 group cursor-pointer"
                                            onClick={() => toggleCompanySelection(company.id, false)}
                                        >
                                            <Checkbox
                                                id={`edit-company-${company.id}`}
                                                checked={editExecutive.company_ids.includes(company.id)}
                                                onCheckedChange={() => toggleCompanySelection(company.id, false)}
                                                className="mt-0.5 md:mt-0"
                                            />
                                            <Label
                                                htmlFor={`edit-company-${company.id}`}
                                                className="text-sm cursor-pointer flex-1 min-w-0"
                                            >
                                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-1 md:gap-4">
                                                    <span className="font-semibold text-base truncate group-hover:text-primary transition-colors">
                                                        {company.company_name}
                                                    </span>
                                                    <span className="text-xs text-muted-foreground truncate md:text-right">
                                                        {company.company_email}
                                                    </span>
                                                </div>
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                                
                                {editExecutive.company_ids.length > 0 && (
                                    <div className="flex items-center gap-2 text-sm p-4 bg-primary/5 rounded-xl border border-primary/20">
                                        <Activity className="h-4 w-4 text-primary" />
                                        <span className="font-semibold text-primary">
                                            {editExecutive.company_ids.length} {editExecutive.company_ids.length === 1 ? 'company' : 'companies'} selected
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </ScrollArea>

                    {/* Premium Footer */}
                    <div className="border-t bg-muted/20 px-6 py-4 md:px-8 md:py-6 flex flex-col-reverse md:flex-row items-stretch md:items-center justify-end gap-3">
                        <Button 
                            variant="outline" 
                            onClick={() => setEditDialogOpen(false)} 
                            disabled={isCreating}
                            className="rounded-xl h-12 text-base font-semibold"
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleEditExecutive} 
                            disabled={isCreating}
                            className="rounded-xl h-12 text-base font-bold shadow-lg shadow-primary/30 px-8"
                        >
                            {isCreating ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Updating...
                                </>
                            ) : (
                                <>
                                    <Edit className="mr-2 h-5 w-5" />
                                    Update Account
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Details Dialog */}
            <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
                <DialogContent className="max-w-3xl rounded-3xl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl font-bold">Executive Details</DialogTitle>
                        <DialogDescription className="text-base">
                            Comprehensive information about the executive account
                        </DialogDescription>
                    </DialogHeader>
                    {selectedExecutive && (
                        <div className="space-y-6 py-4">
                            {/* Executive Header Card */}
                            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-background to-primary/10 border-2 p-6">
                                <div className="absolute top-0 right-0 p-6 opacity-5">
                                    <Shield className="h-32 w-32 -rotate-12" />
                                </div>
                                
                                <div className="relative flex items-center gap-4">
                                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
                                        <User className="h-8 w-8 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-2xl font-extrabold tracking-tight italic">
                                            {selectedExecutive.full_name.toUpperCase()}
                                        </h3>
                                        <p className="text-muted-foreground font-medium">{selectedExecutive.email}</p>
                                    </div>
                                    {getStatusBadge(selectedExecutive.status)}
                                </div>
                            </div>

                            {/* Info Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-muted/30 border">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone</Label>
                                    <p className="text-base font-semibold mt-1">{selectedExecutive.phone || 'N/A'}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-muted/30 border">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Created</Label>
                                    <p className="text-base font-semibold mt-1">
                                        {new Date(selectedExecutive.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="col-span-2 p-4 rounded-xl bg-muted/30 border">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">User ID</Label>
                                    <p className="text-xs font-mono mt-1 opacity-70">{selectedExecutive.id}</p>
                                </div>
                            </div>
                            
                            {/* Assigned Companies */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Building2 className="h-5 w-5 text-primary" />
                                    <Label className="text-base font-bold">Assigned Companies</Label>
                                    <Badge variant="secondary" className="ml-auto">
                                        {selectedExecutive.assignedCompanies?.length || 0} total
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {selectedExecutive.assignedCompanies && selectedExecutive.assignedCompanies.length > 0 ? (
                                        selectedExecutive.assignedCompanies.map((company) => (
                                            <div key={company.id} className="flex items-center gap-3 p-4 bg-gradient-to-br from-muted/50 to-muted/30 rounded-xl border hover:border-primary/50 transition-colors">
                                                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                                    <Building2 className="h-5 w-5 text-primary" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold truncate">{company.company_name}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{company.company_email}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="col-span-2 text-center py-8 text-muted-foreground">
                                            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">No companies assigned</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="gap-2">
                        <Button 
                            variant="outline" 
                            onClick={() => setDetailsDialogOpen(false)}
                            className="rounded-xl"
                        >
                            Close
                        </Button>
                        {selectedExecutive && (
                            <Button 
                                onClick={() => {
                                    setDetailsDialogOpen(false);
                                    openEditDialog(selectedExecutive);
                                }}
                                className="rounded-xl shadow-lg shadow-primary/20"
                            >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit Account
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
