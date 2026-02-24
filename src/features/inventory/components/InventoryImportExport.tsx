import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, Loader2, FileUp, FileDown, ArrowRight, Plus, Edit, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import * as XLSX from 'xlsx';
import { useInventory, type Brand } from '../InventoryContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';

interface InventoryImportExportProps {
    brands: Brand[];
}

interface ImportPreviewItem {
    action: 'create' | 'update' | 'delete';
    brandName: string;
    variantName: string;
    variantType: string;
    before?: {
        stock: number;
        unitPrice: number;
        sellingPrice: number;
        dspPrice: number;
        rspPrice: number;
    };
    after?: {
        stock: number;
        unitPrice: number;
        sellingPrice: number;
        dspPrice: number;
        rspPrice: number;
    };
}

export const InventoryImportExport: React.FC<InventoryImportExportProps> = ({ brands }) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const { refreshInventory } = useInventory();
    const [importing, setImporting] = useState(false);
    const [replaceMode, setReplaceMode] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState<ImportPreviewItem[]>([]);
    const [pendingImportData, setPendingImportData] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = async () => {
        try {
            if (!user?.company_id) {
                toast({ title: "Error", description: "Company ID not found", variant: "destructive" });
                return;
            }

            const wb = XLSX.utils.book_new();

            // Fetch all brands with ALL their variants (including custom types)
            const { data: brandsData, error } = await supabase
                .from('brands')
                .select(`
                    id,
                    name,
                    variants (
                        id,
                        name,
                        variant_type,
                        is_active,
                        main_inventory (
                            stock,
                            unit_price,
                            selling_price,
                            dsp_price,
                            rsp_price
                        )
                    )
                `)
                .eq('company_id', user.company_id)
                .eq('is_active', true)
                .order('name');

            if (error) throw error;

            if (!brandsData || brandsData.length === 0) {
                const ws = XLSX.utils.json_to_sheet([
                    { 'Brand Name': '', 'Variant Name': '', 'Variant Type': 'flavor', 'Stock': 0, 'Unit Price': 0, 'Selling Price': 0, 'DSP Price': 0, 'RSP Price': 0 }
                ]);
                XLSX.utils.book_append_sheet(wb, ws, "Template");
            } else {
                brandsData.forEach((brand: any) => {
                    const allVariants = (brand.variants || [])
                        .filter((v: any) => v.is_active !== false)
                        .map((v: any) => {
                            const inventory = Array.isArray(v.main_inventory) ? v.main_inventory[0] : v.main_inventory;
                            return {
                                'Variant Name': v.name,
                                'Variant Type': v.variant_type,
                                'Stock': inventory?.stock || 0,
                                'Unit Price': inventory?.unit_price || 0,
                                'Selling Price': inventory?.selling_price || 0,
                                'DSP Price': inventory?.dsp_price || 0,
                                'RSP Price': inventory?.rsp_price || 0,
                            };
                        });

                    if (allVariants.length > 0) {
                        const ws = XLSX.utils.json_to_sheet(allVariants);
                        const wscols = [
                            { wch: 30 },
                            { wch: 15 },
                            { wch: 10 },
                            { wch: 15 },
                            { wch: 15 },
                            { wch: 15 },
                            { wch: 15 },
                        ];
                        ws['!cols'] = wscols;
                        XLSX.utils.book_append_sheet(wb, ws, brand.name.substring(0, 31));
                    }
                });
            }

            XLSX.writeFile(wb, `B1G_Inventory_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
            toast({ title: "Success", description: "Inventory exported successfully" });
        } catch (error: any) {
            console.error("Export error:", error);
            toast({ title: "Export Failed", description: error.message, variant: "destructive" });
        }
    };

    const downloadTemplate = () => {
        const wb = XLSX.utils.book_new();
        const templateData = [
            { 'Brand Name': 'Example Brand', 'Variant Name': 'Flavor 1', 'Variant Type': 'flavor', 'Stock': 100, 'Unit Price': 100, 'Selling Price': 150, 'DSP Price': 130, 'RSP Price': 180 },
            { 'Brand Name': 'Example Brand', 'Variant Name': 'Battery 1', 'Variant Type': 'battery', 'Stock': 50, 'Unit Price': 500, 'Selling Price': 700, 'DSP Price': 600, 'RSP Price': 850 },
            { 'Brand Name': 'Example Brand', 'Variant Name': 'POSM 1', 'Variant Type': 'POSM', 'Stock': 20, 'Unit Price': 0, 'Selling Price': 0, 'DSP Price': 0, 'RSP Price': 0 },
            { 'Brand Name': 'Example Brand', 'Variant Name': 'FOC Item 1', 'Variant Type': 'FOC', 'Stock': 10, 'Unit Price': 0, 'Selling Price': 0, 'DSP Price': 0, 'RSP Price': 0 },
        ];
        const ws = XLSX.utils.json_to_sheet(templateData);
        
        // Add note about custom variant types
        const note = 'Note: Variant Type must match types defined in your system (e.g., flavor, battery, POSM, FOC, etc.)';
        
        XLSX.utils.book_append_sheet(wb, ws, "Inventory Template");
        XLSX.writeFile(wb, "B1G_Inventory_Template.xlsx");
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user?.company_id) return;

        setImporting(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });

                const allData: any[] = [];
                workbook.SheetNames.forEach(sheetName => {
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet);
                    jsonData.forEach((row: any) => {
                        const brandName = row['Brand Name'] || sheetName;
                        if (brandName && row['Variant Name']) {
                            allData.push({
                                brandName: String(brandName).trim(),
                                variantName: String(row['Variant Name']).trim(),
                                variantType: String(row['Variant Type'] || 'flavor').toLowerCase().trim(),
                                stock: Number(row['Stock']) || 0,
                                unitPrice: Number(row['Unit Price'] || 0),
                                sellingPrice: Number(row['Selling Price'] || 0),
                                dspPrice: Number(row['DSP Price'] || 0),
                                rspPrice: Number(row['RSP Price'] || 0)
                            });
                        }
                    });
                });

                if (allData.length === 0) {
                    throw new Error("No valid data found in Excel file.");
                }

                // Build preview
                await buildPreview(allData);
                setPendingImportData(allData);
                setImporting(false);
                setShowPreview(true);
            } catch (error: any) {
                toast({ title: "Import Failed", description: error.message, variant: "destructive" });
                setImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const buildPreview = async (importData: any[]) => {
        const preview: ImportPreviewItem[] = [];
        
        try {
            // Get all existing inventory with variant and brand info
            const { data: existingInventory } = await supabase
                .from('main_inventory')
                .select(`
                    id,
                    variant_id,
                    stock,
                    unit_price,
                    selling_price,
                    dsp_price,
                    rsp_price,
                    variants (
                        id,
                        name,
                        variant_type,
                        brand_id,
                        brands (
                            id,
                            name
                        )
                    )
                `)
                .eq('company_id', user!.company_id);

            const existingMap = new Map();
            (existingInventory || []).forEach((inv: any) => {
                const key = `${inv.variants?.brands?.name}|${inv.variants?.name}`.toLowerCase();
                existingMap.set(key, {
                    variantId: inv.variant_id,
                    brandName: inv.variants?.brands?.name || '',
                    variantName: inv.variants?.name || '',
                    variantType: inv.variants?.variant_type || '',
                    stock: inv.stock,
                    unitPrice: inv.unit_price,
                    sellingPrice: inv.selling_price,
                    dspPrice: inv.dsp_price,
                    rspPrice: inv.rsp_price
                });
            });

            const importedKeys = new Set<string>();

            // Check each import item
            for (const item of importData) {
                const key = `${item.brandName}|${item.variantName}`.toLowerCase();
                importedKeys.add(key);
                const existing = existingMap.get(key);

                if (existing) {
                    // Update
                    preview.push({
                        action: 'update',
                        brandName: item.brandName,
                        variantName: item.variantName,
                        variantType: item.variantType,
                        before: {
                            stock: existing.stock,
                            unitPrice: existing.unitPrice,
                            sellingPrice: existing.sellingPrice,
                            dspPrice: existing.dspPrice,
                            rspPrice: existing.rspPrice
                        },
                        after: {
                            stock: item.stock,
                            unitPrice: item.unitPrice,
                            sellingPrice: item.sellingPrice,
                            dspPrice: item.dspPrice,
                            rspPrice: item.rspPrice
                        }
                    });
                } else {
                    // Create
                    preview.push({
                        action: 'create',
                        brandName: item.brandName,
                        variantName: item.variantName,
                        variantType: item.variantType,
                        after: {
                            stock: item.stock,
                            unitPrice: item.unitPrice,
                            sellingPrice: item.sellingPrice,
                            dspPrice: item.dspPrice,
                            rspPrice: item.rspPrice
                        }
                    });
                }
            }

            // Check for items to delete in replace mode
            if (replaceMode) {
                existingMap.forEach((existing, key) => {
                    if (!importedKeys.has(key)) {
                        preview.push({
                            action: 'delete',
                            brandName: existing.brandName,
                            variantName: existing.variantName,
                            variantType: existing.variantType,
                            before: {
                                stock: existing.stock,
                                unitPrice: existing.unitPrice,
                                sellingPrice: existing.sellingPrice,
                                dspPrice: existing.dspPrice,
                                rspPrice: existing.rspPrice
                            }
                        });
                    }
                });
            }

            setPreviewData(preview);
        } catch (error) {
            console.error('Error building preview:', error);
            throw new Error('Failed to build preview');
        }
    };

    const executeImport = async () => {
        if (!user?.company_id || pendingImportData.length === 0) return;

        setImporting(true);
        setShowPreview(false);
        
        try {
            const allData = pendingImportData;

            const { data: vtData } = await supabase
                .from('variant_types')
                .select('id, name')
                .eq('company_id', user.company_id);

            const variantTypes = vtData || [];
            let successCount = 0;
            let errorCount = 0;
            const importedVariantIds: string[] = [];

            for (const item of allData) {
                try {
                    let { data: brand } = await supabase
                        .from('brands')
                        .select('id')
                        .eq('company_id', user.company_id)
                        .eq('name', item.brandName)
                        .maybeSingle();

                    if (!brand) {
                        const { data: newBrand, error: bErr } = await supabase
                            .from('brands')
                            .insert({
                                name: item.brandName,
                                company_id: user.company_id
                            })
                            .select('id')
                            .single();
                        if (bErr) throw bErr;
                        brand = newBrand;
                    }

                    // Find variant type - case insensitive match for any custom type
                    const vt = variantTypes.find(t => t.name.toLowerCase() === item.variantType.toLowerCase());
                    
                    if (!vt) {
                        console.warn(`Variant type "${item.variantType}" not found for ${item.brandName} - ${item.variantName}. Skipping.`);
                        errorCount++;
                        continue;
                    }

                    let { data: variant } = await supabase
                        .from('variants')
                        .select('id, name, variant_type_id')
                        .eq('company_id', user.company_id)
                        .eq('brand_id', brand!.id)
                        .eq('name', item.variantName)
                        .maybeSingle();

                    if (!variant) {
                        // Generate SKU with first 2 letters of variant type
                        const typePrefix = vt.name.substring(0, 2).toUpperCase();
                        const sku = `${item.brandName.toUpperCase().replace(/\s+/g, '')}-${typePrefix}-${item.variantName.toUpperCase().replace(/\s+/g, '')}`;
                        
                        const { data: newVariant, error: vErr } = await supabase
                            .from('variants')
                            .insert({
                                company_id: user.company_id,
                                brand_id: brand!.id,
                                name: item.variantName,
                                variant_type_id: vt.id,
                                sku
                            })
                            .select('id, name, variant_type_id')
                            .single();
                        if (vErr) throw vErr;
                        variant = newVariant;
                    } else {
                        if (vt && variant.variant_type_id !== vt.id) {
                            await supabase
                                .from('variants')
                                .update({ variant_type_id: vt.id })
                                .eq('id', variant.id);
                        }
                    }

                    if (variant?.id) {
                        importedVariantIds.push(variant.id);
                    }

                    const { data: existingInv } = await supabase
                        .from('main_inventory')
                        .select('id')
                        .eq('company_id', user.company_id)
                        .eq('variant_id', variant!.id)
                        .maybeSingle();

                    if (existingInv) {
                        await supabase
                            .from('main_inventory')
                            .update({
                                stock: item.stock,
                                unit_price: item.unitPrice,
                                selling_price: item.sellingPrice,
                                dsp_price: item.dspPrice,
                                rsp_price: item.rspPrice
                            })
                            .eq('id', existingInv.id);
                    } else {
                        // Set default reorder level based on variant type
                        const reorderLevel = vt.name.toLowerCase() === 'flavor' ? 50 : 30;
                        
                        await supabase
                            .from('main_inventory')
                            .insert({
                                company_id: user.company_id,
                                variant_id: variant!.id,
                                stock: item.stock,
                                unit_price: item.unitPrice,
                                selling_price: item.sellingPrice,
                                dsp_price: item.dspPrice,
                                rsp_price: item.rspPrice,
                                reorder_level: reorderLevel
                            });
                    }
                    successCount++;
                } catch (err) {
                    console.error(`Error importing ${item.brandName} - ${item.variantName}:`, err);
                    errorCount++;
                }
            }

            let deletedCount = 0;
            if (replaceMode && importedVariantIds.length > 0) {
                try {
                    const { data: allInventory } = await supabase
                        .from('main_inventory')
                        .select('id, variant_id')
                        .eq('company_id', user.company_id);

                    const inventoryToDelete = (allInventory || []).filter(
                        inv => !importedVariantIds.includes(inv.variant_id)
                    );

                    if (inventoryToDelete.length > 0) {
                        const idsToDelete = inventoryToDelete.map(inv => inv.id);
                        const { error: delError } = await supabase
                            .from('main_inventory')
                            .delete()
                            .in('id', idsToDelete);
                        
                        if (!delError) {
                            deletedCount = inventoryToDelete.length;
                        }
                    }
                } catch (delErr) {
                    console.error('Error deleting old inventory:', delErr);
                }
            }

            await refreshInventory();
            
            const description = replaceMode 
                ? `Successfully processed ${successCount} items. ${deletedCount > 0 ? `Removed ${deletedCount} items not in import. ` : ''}${errorCount > 0 ? `${errorCount} errors occurred.` : ''}`
                : `Successfully processed ${successCount} items. ${errorCount > 0 ? `${errorCount} errors occurred.` : ''}`;
            
            toast({
                title: "Import Complete",
                description,
            });
            
            setPendingImportData([]);
            setPreviewData([]);
        } catch (error: any) {
            toast({ title: "Import Failed", description: error.message, variant: "destructive" });
        } finally {
            setImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const cancelImport = () => {
        setShowPreview(false);
        setPendingImportData([]);
        setPreviewData([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const createCount = previewData.filter(p => p.action === 'create').length;
    const updateCount = previewData.filter(p => p.action === 'update').length;
    const deleteCount = previewData.filter(p => p.action === 'delete').length;

    return (
        <>
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={importing}>
                        <FileSpreadsheet className="h-4 w-4 mr-2 text-green-600" />
                        Template
                    </Button>

                    <Button variant="outline" size="sm" onClick={handleExport} disabled={importing}>
                        <FileDown className="h-4 w-4 mr-2 text-blue-600" />
                        Export All
                    </Button>

                    <div className="relative">
                        <input
                            type="file"
                            accept=".xlsx, .xls"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={handleFileUpload}
                            ref={fileInputRef}
                            disabled={importing}
                        />
                        <Button variant="outline" size="sm" disabled={importing}>
                            {importing ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <FileUp className="h-4 w-4 mr-2 text-purple-600" />
                            )}
                            Import Excel
                        </Button>
                    </div>
                </div>

                <div className="flex items-center space-x-2">
                    <Switch 
                        id="replace-mode" 
                        checked={replaceMode} 
                        onCheckedChange={setReplaceMode}
                        disabled={importing}
                    />
                    <Label htmlFor="replace-mode" className="text-sm text-muted-foreground cursor-pointer">
                        Replace Mode: Remove inventory items not in import file
                    </Label>
                </div>
            </div>

            {/* Preview Dialog */}
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
                    <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4">
                        <DialogTitle>Review Import Changes</DialogTitle>
                        <div className="flex gap-4 mt-2">
                            {createCount > 0 && (
                                <Badge variant="default" className="bg-green-600">
                                    <Plus className="h-3 w-3 mr-1" />
                                    {createCount} New
                                </Badge>
                            )}
                            {updateCount > 0 && (
                                <Badge variant="default" className="bg-blue-600">
                                    <Edit className="h-3 w-3 mr-1" />
                                    {updateCount} Updates
                                </Badge>
                            )}
                            {deleteCount > 0 && (
                                <Badge variant="default" className="bg-red-600">
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    {deleteCount} Deletions
                                </Badge>
                            )}
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-auto px-6">
                        <div className="border rounded-lg">
                        <Table>
                            <TableHeader className="sticky top-0 bg-muted z-10">
                                <TableRow>
                                    <TableHead className="w-24 bg-muted">Action</TableHead>
                                    <TableHead className="bg-muted">Brand</TableHead>
                                    <TableHead className="bg-muted">Variant</TableHead>
                                    <TableHead className="bg-muted">Type</TableHead>
                                    <TableHead className="text-center bg-muted">Before</TableHead>
                                    <TableHead className="w-8 bg-muted"></TableHead>
                                    <TableHead className="text-center bg-muted">After</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {previewData.map((item, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>
                                            <Badge 
                                                variant={item.action === 'create' ? 'default' : item.action === 'update' ? 'secondary' : 'destructive'}
                                                className={
                                                    item.action === 'create' ? 'bg-green-600' : 
                                                    item.action === 'update' ? 'bg-blue-600' : ''
                                                }
                                            >
                                                {item.action === 'create' && <Plus className="h-3 w-3 mr-1" />}
                                                {item.action === 'update' && <Edit className="h-3 w-3 mr-1" />}
                                                {item.action === 'delete' && <Trash2 className="h-3 w-3 mr-1" />}
                                                {item.action.charAt(0).toUpperCase() + item.action.slice(1)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-medium">{item.brandName}</TableCell>
                                        <TableCell>{item.variantName}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{item.variantType}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            {item.before && (
                                                <div className="text-xs space-y-1">
                                                    <div>Stock: <span className="font-semibold">{item.before.stock}</span></div>
                                                    <div>Unit: ₱{item.before.unitPrice}</div>
                                                    <div>Selling: ₱{item.before.sellingPrice}</div>
                                                    <div>DSP: ₱{item.before.dspPrice}</div>
                                                    <div>RSP: ₱{item.before.rspPrice}</div>
                                                </div>
                                            )}
                                            {!item.before && <span className="text-muted-foreground text-xs">-</span>}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            {item.action !== 'delete' && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                                        </TableCell>
                                        <TableCell>
                                            {item.after && (
                                                <div className="text-xs space-y-1">
                                                    <div>Stock: <span className="font-semibold">{item.after.stock}</span></div>
                                                    <div>Unit: ₱{item.after.unitPrice}</div>
                                                    <div>Selling: ₱{item.after.sellingPrice}</div>
                                                    <div>DSP: ₱{item.after.dspPrice}</div>
                                                    <div>RSP: ₱{item.after.rspPrice}</div>
                                                </div>
                                            )}
                                            {!item.after && <span className="text-muted-foreground text-xs">-</span>}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        </div>
                    </div>

                    <DialogFooter className="flex-shrink-0 px-6 pb-6 pt-4">
                        <Button variant="outline" onClick={cancelImport} disabled={importing}>
                            Cancel
                        </Button>
                        <Button onClick={executeImport} disabled={importing}>
                            {importing ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                'Confirm Import'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
