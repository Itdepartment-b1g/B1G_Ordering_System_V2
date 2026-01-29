import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Package, Archive, AlertTriangle, Activity, Database, Boxes, Layers } from 'lucide-react';
import { motion } from 'framer-motion';

export function PortalInventory({ companyId }: { companyId: string }) {
    const [inventory, setInventory] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchInventory();
    }, [companyId]);

    const fetchInventory = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('variants')
                .select(`
                    id,
                    name,
                    variant_type,
                    brands (
                        name
                    ),
                    main_inventory (
                        stock,
                        unit_price,
                        reorder_level
                    )
                `)
                .eq('company_id', companyId)
                .order('name');

            if (error) throw error;
            setInventory(data || []);
        } catch (error) {
            console.error('Error fetching inventory:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusColor = (stock: number, reorder: number) => {
        if (stock === 0) return 'destructive';
        if (stock < reorder) return 'secondary';
        return 'default';
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-24 space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary opacity-50" />
                <p className="text-muted-foreground font-medium italic">Scanning Stock Registries...</p>
            </div>
        );
    }

    const lowStockCount = inventory.filter(i => {
        const inv = Array.isArray(i.main_inventory) ? i.main_inventory[0] : i.main_inventory;
        return inv && inv.stock > 0 && inv.stock < (inv.reorder_level || 100);
    }).length;

    const outOfStockCount = inventory.filter(i => {
        const inv = Array.isArray(i.main_inventory) ? i.main_inventory[0] : i.main_inventory;
        return !inv || inv.stock === 0;
    }).length;

    return (
        <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { title: "Network SKU's", value: inventory.length, icon: Layers, color: "text-blue-500", bg: "bg-blue-50" },
                    { title: "Supply Risk (Low)", value: lowStockCount, icon: Activity, color: "text-yellow-600", bg: "bg-yellow-50" },
                    { title: "Critical Exhaustion", value: outOfStockCount, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" }
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                    >
                        <Card className="rounded-[2rem] border-2 shadow-sm relative overflow-hidden group">
                            <div className={`absolute top-0 right-0 p-6 opacity-10 group-hover:scale-110 transition-transform`}>
                                <stat.icon className={`h-16 w-16 ${stat.color}`} />
                            </div>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">{stat.title}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-4xl font-black italic tracking-tighter ${stat.color}`}>
                                    {stat.value.toLocaleString()}
                                </div>
                                <div className="mt-2 text-[10px] font-bold uppercase text-muted-foreground opacity-60">Verified Units</div>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </div>

            <Card className="rounded-[2.5rem] border overflow-hidden shadow-sm">
                <CardHeader className="bg-muted/30 border-b p-8">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                            <Database className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-xl font-extrabold italic tracking-tight">FOUNDATION INVENTORY</CardTitle>
                            <CardDescription className="text-xs font-medium">Real-time variants and SKU distribution for this environment</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <div className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-b-2">
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Manufacturer / Brand</TableHead>
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Variant Descriptor</TableHead>
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Category</TableHead>
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Quantum Level</TableHead>
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Financial Basis</TableHead>
                                <TableHead className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Operational Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {inventory.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-20 text-muted-foreground italic">
                                        This environment contains no registered inventory payloads.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                inventory.map((item) => {
                                    const inv = Array.isArray(item.main_inventory) ? item.main_inventory[0] : item.main_inventory;
                                    const stock = inv?.stock || 0;
                                    const reorder = inv?.reorder_level || 100;
                                    const status = stock === 0 ? 'CRITICAL' : stock < reorder ? 'LOW' : 'STABLE';

                                    return (
                                        <TableRow key={item.id} className="group hover:bg-muted/5 transition-colors border-b last:border-0">
                                            <TableCell className="px-8 py-6">
                                                <div className="text-sm font-black italic tracking-tight text-primary uppercase">{item.brands?.name || 'GENERIC'}</div>
                                            </TableCell>
                                            <TableCell className="px-8 py-6 font-bold tracking-tight text-base">
                                                {item.name}
                                            </TableCell>
                                            <TableCell className="px-8 py-6">
                                                <Badge variant="outline" className="rounded-lg px-2.5 py-0.5 text-[10px] font-black tracking-widest uppercase bg-muted/50 border-muted">
                                                    {item.variant_type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="px-8 py-6">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2 font-black text-lg tracking-tighter italic">
                                                        {stock.toLocaleString()}
                                                        {stock < reorder && stock > 0 && <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-ping" />}
                                                        {stock === 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />}
                                                    </div>
                                                    <div className="text-[10px] font-bold text-muted-foreground uppercase opacity-50">Units available</div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="px-8 py-6">
                                                <div className="font-bold text-sm">₱{(inv?.unit_price || 0).toLocaleString()}</div>
                                                <div className="text-[10px] font-bold text-muted-foreground uppercase opacity-50">Unit Basis</div>
                                            </TableCell>
                                            <TableCell className="px-8 py-6">
                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${status === 'STABLE' ? 'bg-green-100 text-green-700' :
                                                        status === 'LOW' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                    {status}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
}
