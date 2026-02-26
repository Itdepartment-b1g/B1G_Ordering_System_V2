import { useState, useEffect, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Plus, Trash2, ShoppingCart, Package, ClipboardCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';

// Matching the props passed from LeaderStockRequestPage
interface Brand {
    id: string;
    name: string;
}

interface Product {
    id: string;
    name: string;
    variant_type: string;
    brand_id: string; // Ensure we map this correctly
    stock?: number; // Added for Leader Inventory check
    brand?: {
        id: string;
        name: string;
    };
}

interface RequestItem {
    variant_id: string;
    quantity: number;
    product_name?: string;
    brand_name?: string;
}

interface CreateStockRequestDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRequestSubmitted: () => void;
    brands: Brand[];
    products: Product[];
    leaderId?: string; // Optional: The leader to request from (if agent)
    isMobileRequest?: boolean; // Optional: Changes status logic
    initialData?: {
        requestId: string;
        items: RequestItem[];
        notes: string;
    };
}

export function CreateStockRequestDialog({
    open,
    onOpenChange,
    onRequestSubmitted,
    brands = [],
    products = [],
    leaderId,
    isMobileRequest = false,
    initialData
}: CreateStockRequestDialogProps) {
    const { user } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    
    // Request State
    const [items, setItems] = useState<RequestItem[]>([]);
    const [notes, setNotes] = useState('');
    
    // Selection State
    const [selectedBrandId, setSelectedBrandId] = useState<string>('');
    // Store temporary quantities for the currently selected brand view: { variantId: quantityString }
    const [brandQuantities, setBrandQuantities] = useState<Record<string, string>>({});

    useEffect(() => {
        if (open) {
            if (initialData) {
                // Edit Mode: Pre-fill data
                setItems(initialData.items);
                setNotes(initialData.notes);
            } else {
                // Create Mode: Reset
                setItems([]);
                setNotes('');
            }
            setSelectedBrandId('');
            setBrandQuantities({});
        }
    }, [open, initialData]);

    // Derived state for products filtering (by brand)
    const brandProducts = useMemo(() => {
        if (!selectedBrandId) return [];
        return products.filter(p => p.brand_id === selectedBrandId || p.brand?.id === selectedBrandId);
    }, [selectedBrandId, products]);

    // Consolidate any duplicate variants coming from different inventory rows
    const consolidatedBrandProducts = useMemo(() => {
        const map = new Map<string, Product>();

        brandProducts.forEach((p) => {
            const existing = map.get(p.id);
            if (!existing) {
                map.set(p.id, p);
            } else {
                // If we have multiple rows for the same variant, keep one entry
                // and, for mobile requests, sum their stock for a clearer view.
                const combinedStock =
                    (existing.stock ?? 0) + (p.stock ?? 0);
                map.set(p.id, {
                    ...existing,
                    stock: combinedStock || undefined,
                });
            }
        });

        return Array.from(map.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
        );
    }, [brandProducts]);

    // Group consolidated variants by their variant_type (e.g. Flavor, Battery, FOC)
    const groupedVariantsByType = useMemo(() => {
        const groups = new Map<string, Product[]>();

        consolidatedBrandProducts.forEach((p) => {
            const rawType = p.variant_type || 'Other';
            const key = rawType.trim() || 'Other';
            const existing = groups.get(key) || [];
            existing.push(p);
            groups.set(key, existing);
        });

        // Preferred display order: Flavor, Battery, FOC, then others alphabetically
        const preferredOrder = ['flavor', 'battery', 'foc'];

        return Array.from(groups.entries())
            .sort(([typeA], [typeB]) => {
                const a = typeA.toLowerCase();
                const b = typeB.toLowerCase();
                const indexA = preferredOrder.indexOf(a);
                const indexB = preferredOrder.indexOf(b);

                // Known types first according to preferredOrder
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;

                // Fallback alphabetical
                return a.localeCompare(b);
            })
            .map(([type, items]) => ({
                type,
                items: items.sort((a, b) => a.name.localeCompare(b.name)),
            }));
    }, [consolidatedBrandProducts]);

    const handleBrandChange = (brandId: string) => {
        setSelectedBrandId(brandId);
        setBrandQuantities({}); // Reset quantities when switching brands
    };

    const handleQuantityChange = (variantId: string, value: string) => {
        setBrandQuantities(prev => ({
            ...prev,
            [variantId]: value
        }));
    };

    const handleAddBrandItems = () => {
        if (!selectedBrandId) return;

        const newItems: RequestItem[] = [];
        
        Object.entries(brandQuantities).forEach(([variantId, qtyStr]) => {
            const qty = parseInt(qtyStr);
            if (qty > 0) {
                const product = products.find(p => p.id === variantId);
                const brand = brands.find(b => b.id === selectedBrandId);
                if (product) {
                    newItems.push({
                        variant_id: variantId,
                        quantity: qty,
                        product_name: product.name,
                        brand_name: brand?.name || 'Unknown Brand'
                    });
                }
            }
        });

        if (newItems.length === 0) return;

        // Merge with existing items
        setItems(prevItems => {
            const merged = [...prevItems];
            newItems.forEach(newItem => {
                const existingIndex = merged.findIndex(i => i.variant_id === newItem.variant_id);
                if (existingIndex >= 0) {
                    merged[existingIndex].quantity += newItem.quantity;
                } else {
                    merged.push(newItem);
                }
            });
            return merged;
        });

        // Reset inputs
        setSelectedBrandId('');
        setBrandQuantities({});
        
        toast({
            title: "Items Added",
            description: `Added ${newItems.length} items to your request list.`,
        });
    };

    const handleRemoveItem = (index: number) => {
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (items.length === 0 || !user?.id) return;

        setLoading(true);
        try {
            // Determine Request Number: Use existing if editing, else generate new
            const requestNumber = initialData?.requestId || `SR-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

            // If editing, DELETE existing items for this request number first
            // We only delete items that are 'pending' or 'approved_by_leader' (safe states)
            if (initialData?.requestId) {
                const { error: deleteError } = await supabase
                    .from('stock_requests')
                    .delete()
                    .eq('request_number', initialData.requestId)
                    .in('status', ['pending', 'approved_by_leader']); // Safety check

                if (deleteError) throw deleteError;
            }

            // Create payload for all items
            const payload = items.map(item => {
                const effectiveLeaderId = leaderId || user.id;
                // ALWAYS insert as 'pending' first to satisfy RLS Policy for INSERT
                const status = 'pending';

                return {
                    request_number: requestNumber,
                    company_id: user.company_id,
                    leader_id: effectiveLeaderId,
                    agent_id: user.id, 
                    variant_id: item.variant_id,
                    requested_quantity: item.quantity,
                    leader_additional_quantity: 0, 
                    status: status, 
                    leader_notes: notes, 
                    is_combined_request: false
                };
            });

            const { data: insertedData, error } = await supabase
                .from('stock_requests')
                .insert(payload)
                .select();

            if (error) throw error;

            // Step 2: If this is a Leader Request (not mobile), we need to auto-approve it to 'approved_by_leader'
            // This is required because the Admin function expects 'approved_by_leader' status.
            if (!isMobileRequest && insertedData && insertedData.length > 0) {
                const requestIds = insertedData.map(r => r.id);
                
                const { error: updateError } = await supabase
                    .from('stock_requests')
                    .update({ 
                        status: 'approved_by_leader',
                        leader_approved_at: new Date().toISOString(),
                        leader_approved_by: user.id
                    })
                    .in('id', requestIds);

                if (updateError) {
                    console.error('Failed to auto-approve leader request:', updateError);
                    // We don't throw here to avoid failing the whole flow, the request exists as 'pending'
                    // The user might just see it as pending.
                     toast({
                        title: 'Warning',
                        description: 'Request created but failed to auto-approve. It requires manual approval.',
                        variant: 'destructive'
                    });
                }
            }

            toast({
                title: 'Success',
                description: `Stock Request ${requestNumber} ${initialData ? 'updated' : 'created'} with ${items.length} items.`,
            });
            setShowConfirmDialog(false);
            onRequestSubmitted();
            onOpenChange(false);
        } catch (error: any) {
            console.error('Error creating request:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to create stock request',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateItemQuantity = (index: number, newQty: number) => {
        if (newQty < 1) return;
        
        // For mobile requests, enforce stock limit
        if (isMobileRequest) {
            const item = items[index];
            const product = products.find(p => p.id === item.variant_id);
            const maxStock = product?.stock || 0;
            
            if (newQty > maxStock) {
                toast({
                    title: 'Stock Limit Exceeded',
                    description: `Only ${maxStock} units available for ${item.product_name}`,
                    variant: 'destructive'
                });
                return;
            }
        }
        
        setItems(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], quantity: newQty };
            return updated;
        });
    };

    // Calculate total summary
    const totalQty = items.reduce((acc, item) => acc + item.quantity, 0);

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Create Stock Request</DialogTitle>
                    <DialogDescription>
                        {initialData ? 'Modify your request items.' : 'Select a brand and add item quantities to build your request.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4 space-y-6 px-1">
                    {/* Brand Selection Area */}
                    <div className="bg-muted/30 p-4 rounded-lg border space-y-4">
                        <div className="space-y-2">
                            <Label>1. Select Brand</Label>
                            <Select value={selectedBrandId} onValueChange={handleBrandChange}>
                                <SelectTrigger className="bg-background">
                                    <SelectValue placeholder="Select a brand..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {brands.map(brand => (
                                        <SelectItem key={brand.id} value={brand.id}>
                                            {brand.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Product List for Selected Brand */}
                        {selectedBrandId && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                <Label>2. Enter Quantities</Label>
                                {consolidatedBrandProducts.length === 0 ? (
                                    <div className="text-center p-4 text-muted-foreground bg-background rounded border border-dashed">
                                        No products found for this brand.
                                    </div>
                                ) : (
                                    <div className="max-h-[320px] overflow-y-auto pr-1 space-y-3">
                                        {groupedVariantsByType.map(group => (
                                            <div key={group.type} className="space-y-1">
                                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                                                    {group.type}
                                                </p>
                                                <div className="space-y-1.5">
                                                    {group.items.map(product => {
                                                        const hasStock = isMobileRequest ? (product.stock || 0) > 0 : true;
                                                        const stockDisplay = isMobileRequest ? product.stock || 0 : null;

                                                        return (
                                                            <div
                                                                key={product.id}
                                                                className={`flex items-center justify-between p-2.5 bg-background rounded-md border ${!hasStock && isMobileRequest ? 'opacity-60 bg-muted' : ''}`}
                                                            >
                                                                <div className="flex-1 mr-3 min-w-0">
                                                                    <p
                                                                        className="font-medium text-sm truncate"
                                                                        title={product.name}
                                                                    >
                                                                        {product.name}
                                                                    </p>
                                                                    {isMobileRequest && (
                                                                        <div className="flex items-center gap-2 mt-1 text-xs">
                                                                            <span
                                                                                className={`px-2 py-0.5 rounded-full font-medium text-[10px] ${hasStock ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}
                                                                            >
                                                                                Stock: {stockDisplay}
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <Input 
                                                                    type="number" 
                                                                    min="0"
                                                                    max={isMobileRequest ? stockDisplay : undefined}
                                                                    placeholder="0"
                                                                    className="w-20 text-right h-8"
                                                                    value={brandQuantities[product.id] || ''}
                                                                    disabled={isMobileRequest && !hasStock}
                                                                    onChange={e => {
                                                                        const val = parseInt(e.target.value) || 0;
                                                                        if (isMobileRequest && stockDisplay !== null && val > stockDisplay) {
                                                                            // Don't allow entering more than available
                                                                            return;
                                                                        }
                                                                        handleQuantityChange(product.id, e.target.value);
                                                                    }}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                <Button 
                                    onClick={handleAddBrandItems} 
                                    className="w-full"
                                    disabled={brandProducts.length === 0 || !Object.values(brandQuantities).some(v => parseInt(v) > 0)}
                                >
                                    <Plus className="h-4 w-4 mr-2" /> Add Selection to Request
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Review List */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label>Request Summary ({items.length} items)</Label>
                            {items.length > 0 && <span className="text-sm font-medium text-primary">Total Qty: {totalQty}</span>}
                        </div>
                        
                        {items.length === 0 ? (
                            <div className="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground bg-muted/10">
                                <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No items added yet</p>
                            </div>
                        ) : (
                            <div className="border rounded-lg bg-card">
                                <div className="max-h-[200px] overflow-y-auto divide-y">
                                    {items.map((item, index) => {
                                        const product = products.find(p => p.id === item.variant_id);
                                        const maxStock = isMobileRequest ? (product?.stock || 0) : undefined;
                                        
                                        return (
                                        <div key={index} className="flex justify-between items-center p-3 hover:bg-muted/50 transition-colors">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="bg-primary/10 p-2 rounded-full">
                                                    <Package className="h-4 w-4 text-primary" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-sm truncate">{item.product_name}</p>
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-xs text-muted-foreground">{item.brand_name}</p>
                                                        {isMobileRequest && maxStock !== undefined && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                                                                Max: {maxStock}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 ml-4">
                                                <Input 
                                                    type="number" 
                                                    min="1"
                                                    max={maxStock}
                                                    className="w-16 h-8 text-center"
                                                    value={item.quantity}
                                                    onChange={(e) => handleUpdateItemQuantity(index, parseInt(e.target.value) || 0)}
                                                />
                                                <Button 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    onClick={() => handleRemoveItem(index)}
                                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label>Notes (Optional)</Label>
                        <Textarea 
                            placeholder="Any special instructions for the admin..." 
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="resize-none"
                            rows={3}
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => setShowConfirmDialog(true)} disabled={loading || items.length === 0} className="w-full sm:w-auto">
                        {initialData ? 'Update Request' : 'Review & Submit'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* Confirmation dialog with review */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
            <AlertDialogContent className="max-w-md">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <ClipboardCheck className="h-5 w-5" />
                        Review & Confirm Stock Request
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Please review your request before submitting. You are about to request the following items:
                            </p>
                            <div className="border rounded-lg divide-y max-h-[240px] overflow-y-auto bg-muted/30">
                                {items.map((item, index) => (
                                    <div key={index} className="flex justify-between items-center px-3 py-2.5 text-sm">
                                        <span className="font-medium truncate flex-1 mr-2">{item.product_name}</span>
                                        <span className="text-muted-foreground shrink-0">{item.brand_name}</span>
                                        <span className="font-semibold text-primary shrink-0 ml-2 w-8 text-right">{item.quantity}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex justify-between text-sm font-medium pt-1 border-t">
                                <span>Total items:</span>
                                <span>{items.length}</span>
                            </div>
                            <div className="flex justify-between text-sm font-medium">
                                <span>Total quantity:</span>
                                <span className="text-primary">{totalQty}</span>
                            </div>
                            {notes.trim() && (
                                <div className="pt-2 border-t">
                                    <p className="text-xs text-muted-foreground mb-1">Notes:</p>
                                    <p className="text-sm bg-muted/50 p-2 rounded">{notes}</p>
                                </div>
                            )}
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSubmit} disabled={loading} className="bg-primary text-primary-foreground">
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Submitting...
                            </>
                        ) : (
                            initialData ? 'Update Request' : 'Submit Stock Request'
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        </>
    );
}
