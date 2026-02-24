import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, Phone, MapPin, Calendar, User, Search, Filter, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function PortalClients({ companyId }: { companyId: string }) {
    const [clients, setClients] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchClients();
    }, [companyId]);

    const fetchClients = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('clients')
                .select(`
                    *,
                    profiles!agent_id (
                        full_name,
                        email
                    )
                `)
                .eq('company_id', companyId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setClients(data || []);
        } catch (error) {
            console.error('Error fetching clients:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-24 space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
                <p className="text-muted-foreground font-medium italic">Resolving Client Records...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative w-full md:max-w-md group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                        placeholder="Search records by name, store, or email..."
                        className="pl-11 h-11 rounded-xl border focus-visible:ring-primary/20 bg-muted/10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="rounded-xl px-4 border">
                        <Filter className="h-4 w-4 mr-2" />
                        Refine
                    </Button>
                    <Button variant="outline" className="rounded-xl px-4 border">
                        <Download className="h-4 w-4 mr-2" />
                        Export Data
                    </Button>
                </div>
            </div>

            <Card className="rounded-[2rem] border overflow-hidden shadow-sm">
                <div className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/30">
                            <TableRow className="hover:bg-transparent border-b-2">
                                <TableHead className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Client Profile</TableHead>
                                <TableHead className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tenant Operator (Agent)</TableHead>
                                <TableHead className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contact Vectors</TableHead>
                                <TableHead className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Classification</TableHead>
                                <TableHead className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</TableHead>
                                <TableHead className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Onboarding</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredClients.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-16 text-muted-foreground italic">
                                        No matching client entities found in this Foundation environment.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredClients.map((client) => (
                                    <TableRow key={client.id} className="group hover:bg-muted/5 transition-colors border-b last:border-0">
                                        <TableCell className="px-6 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground font-black group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                    {client.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-bold tracking-tight text-base">{client.name}</div>
                                                    <div className="text-xs font-semibold text-primary italic">{client.company || 'Direct Client'}</div>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-6 py-5">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2 text-sm font-bold">
                                                    <div className="h-2 w-2 rounded-full bg-primary" />
                                                    {client.profiles?.full_name || 'System Operator'}
                                                </div>
                                                <div className="text-xs text-muted-foreground ml-4">{client.profiles?.email}</div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-6 py-5">
                                            <div className="space-y-1.5">
                                                {client.email && (
                                                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary transition-colors cursor-pointer">
                                                        <Mail className="h-3 w-3" />
                                                        {client.email}
                                                    </div>
                                                )}
                                                {client.phone && (
                                                    <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                                        <Phone className="h-3 w-3" />
                                                        {client.phone}
                                                    </div>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-6 py-5">
                                            <Badge variant="secondary" className="rounded-lg px-2.5 py-0.5 text-[10px] font-black tracking-widest uppercase bg-primary/5 text-primary border-primary/20">
                                                {client.account_type || 'Standard'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="px-6 py-5">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${client.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                <span className={`h-1.5 w-1.5 rounded-full ${client.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`} />
                                                {client.status}
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-6 py-5">
                                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                                <Calendar className="h-3 w-3" />
                                                {new Date(client.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
}
