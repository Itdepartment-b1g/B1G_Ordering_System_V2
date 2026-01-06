import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Search,
    Building2,
    Users,
    Package,
    ShoppingCart,
    DollarSign,
    ArrowLeft,
    ExternalLink,
    Loader2,
    ShieldCheck,
    Globe,
    Activity,
    ChevronRight,
    LayoutGrid
} from 'lucide-react';
import type { Company } from '@/types/database.types';
import { PortalClients, PortalInventory, PortalOrders, PortalFinance } from './portal';
import { motion, AnimatePresence } from 'framer-motion';

export default function ManagementPortal() {
    const { user, startImpersonation } = useAuth();
    const navigate = useNavigate();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('clients');

    const handleLiveView = () => {
        if (selectedCompany) {
            startImpersonation(selectedCompany);
            navigate('/dashboard');
        }
    };

    useEffect(() => {
        fetchCompanies();
    }, []);

    const fetchCompanies = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('companies')
                .select('id, company_name, company_email, status, created_at, updated_at')
                .order('company_name');

            if (error) throw error;
            setCompanies(data || []);
        } catch (error) {
            console.error('Error fetching companies:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredCompanies = companies.filter(c =>
        c.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.company_email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (user?.role !== 'system_administrator') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <ShieldCheck className="h-16 w-16 text-destructive opacity-50" />
                <h2 className="text-2xl font-bold text-destructive">Access Denied</h2>
                <p className="text-muted-foreground">This portal is restricted to System Administrators only.</p>
                <Button variant="outline" onClick={() => window.history.back()}>Go Back</Button>
            </div>
        );
    }

    if (selectedCompany) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="container mx-auto p-4 md:p-8 space-y-8"
            >
                {/* Company Header */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/5 via-background to-primary/10 border p-8 shadow-sm">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Building2 className="h-64 w-64 -rotate-12" />
                    </div>

                    <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                        <div className="flex items-center gap-6">
                            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner">
                                <Building2 className="h-8 w-8 text-primary" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-3xl font-extrabold tracking-tight italic">
                                        {selectedCompany.company_name.toUpperCase()}
                                    </h1>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${selectedCompany.status === 'active' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'
                                        }`}>
                                        {selectedCompany.status}
                                    </span>
                                </div>
                                <p className="text-muted-foreground font-medium">{selectedCompany.company_email}</p>
                                <p className="text-[10px] font-mono text-muted-foreground mt-1 opacity-50">{selectedCompany.id}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <Button variant="outline" size="lg" className="rounded-xl px-6" onClick={() => setSelectedCompany(null)}>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                All Companies
                            </Button>
                            <Button
                                size="lg"
                                className="rounded-xl px-6 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground transform transition-all active:scale-95"
                                onClick={handleLiveView}
                            >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Live View
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Main Content Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
                        <TabsList className="bg-muted/50 p-1.5 rounded-2xl h-auto border">
                            <TabsTrigger value="clients" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                <Users className="h-4 w-4 mr-2" />
                                Clients
                            </TabsTrigger>
                            <TabsTrigger value="inventory" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                <Package className="h-4 w-4 mr-2" />
                                Inventory
                            </TabsTrigger>
                            <TabsTrigger value="orders" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                <ShoppingCart className="h-4 w-4 mr-2" />
                                Orders
                            </TabsTrigger>
                            <TabsTrigger value="finance" className="rounded-xl px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                                <DollarSign className="h-4 w-4 mr-2" />
                                Finance
                            </TabsTrigger>
                        </TabsList>

                        <div className="flex items-center gap-4 bg-muted/30 px-4 py-2 rounded-xl border">
                            <Activity className="h-4 w-4 text-primary animate-pulse" />
                            <span className="text-sm font-semibold whitespace-nowrap">Viewing Tenant Environment</span>
                        </div>
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                            className="bg-background/50 backdrop-blur-sm"
                        >
                            <TabsContent value="clients" className="m-0 focus-visible:ring-0">
                                <PortalClients companyId={selectedCompany.id} />
                            </TabsContent>
                            <TabsContent value="inventory" className="m-0 focus-visible:ring-0">
                                <PortalInventory companyId={selectedCompany.id} />
                            </TabsContent>
                            <TabsContent value="orders" className="m-0 focus-visible:ring-0">
                                <PortalOrders companyId={selectedCompany.id} />
                            </TabsContent>
                            <TabsContent value="finance" className="m-0 focus-visible:ring-0">
                                <PortalFinance companyId={selectedCompany.id} />
                            </TabsContent>
                        </motion.div>
                    </AnimatePresence>
                </Tabs>
            </motion.div>
        );
    }

    return (
        <div className="container mx-auto p-4 md:p-8 space-y-12">
            {/* Hero Section */}
            <div className="flex flex-col md:flex-row items-end justify-between gap-8 pb-4 border-b">
                <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
                        <Globe className="h-3 w-3" />
                        Network Overview
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tighter">
                        MANAGEMENT <span className="text-primary italic">PORTAL</span>
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed">
                        Cross-tenant command center. Access real-time operational data, audit reports, and company health across the entire B2B ecosystem.
                    </p>
                </div>

                <div className="flex items-center gap-4 text-right">
                    <div className="hidden lg:block">
                        <p className="text-xs font-bold uppercase text-muted-foreground mb-1">Status</p>
                        <p className="text-sm font-semibold flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            Node: High Availability
                        </p>
                    </div>
                    <div className="h-12 w-px bg-border mx-2" />
                    <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20">
                        <span className="text-2xl font-black leading-none">{companies.length}</span>
                        <span className="text-[10px] font-bold uppercase opacity-80 mt-1">Foundations</span>
                    </div>
                </div>
            </div>

            {/* Selection Area */}
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="relative w-full md:max-w-md group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                            placeholder="Filter by Name, Email or ID..."
                            className="pl-11 h-12 rounded-2xl border-2 focus-visible:ring-primary/20 bg-muted/20"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <LayoutGrid className="h-4 w-4" />
                        {filteredCompanies.length} result(s)
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 space-y-4">
                        <Loader2 className="h-12 w-12 animate-spin text-primary opacity-50" />
                        <p className="text-muted-foreground font-medium animate-pulse">Syncing Network Data...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        <AnimatePresence>
                            {filteredCompanies.map((company, index) => (
                                <motion.div
                                    key={company.id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.3, delay: index * 0.05 }}
                                >
                                    <Card
                                        className="group relative overflow-hidden bg-card hover:bg-accent border-2 hover:border-primary/50 cursor-pointer transition-all duration-300 rounded-[2rem] h-full shadow-sm hover:shadow-2xl hover:shadow-primary/5 active:scale-[0.98]"
                                        onClick={() => setSelectedCompany(company)}
                                    >
                                        <CardContent className="p-8 space-y-6">
                                            <div className="flex items-start justify-between">
                                                <div className="h-14 w-14 rounded-2xl bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                                    <Building2 className="h-7 w-7 text-muted-foreground group-hover:text-primary transition-colors" />
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className={`h-2.5 w-2.5 rounded-full ${company.status === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
                                                </div>
                                            </div>

                                            <div>
                                                <h3 className="text-xl font-extrabold tracking-tight italic group-hover:text-primary transition-colors line-clamp-1">
                                                    {company.company_name.toUpperCase()}
                                                </h3>
                                                <p className="text-sm text-muted-foreground font-medium line-clamp-1 mt-1">
                                                    {company.company_email}
                                                </p>
                                            </div>

                                            <div className="pt-4 flex items-center justify-between border-t border-muted-foreground/10 group-hover:border-primary/20 transition-colors">
                                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                                    Explore Environment
                                                </div>
                                                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-1" />
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
}
