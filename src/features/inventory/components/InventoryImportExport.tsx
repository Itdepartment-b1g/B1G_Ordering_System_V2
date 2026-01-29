import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Upload, FileSpreadsheet, Loader2, FileUp, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useInventory, type Brand } from '../InventoryContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';

interface InventoryImportExportProps {
    brands: Brand[];
}

export const InventoryImportExport: React.FC<InventoryImportExportProps> = ({ brands }) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const { refreshInventory } = useInventory();
    const [importing, setImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = () => {
        try {
            const wb = XLSX.utils.book_new();

            if (brands.length === 0) {
                // If no brands, create an empty sheet with headers as template
                const ws = XLSX.utils.json_to_sheet([
                    { 'Brand Name': '', 'Variant Name': '', 'Variant Type': 'flavor', 'Stock': 0, 'Unit Price': 0, 'Selling Price': 0, 'DSP Price': 0, 'RSP Price': 0 }
                ]);
                XLSX.utils.book_append_sheet(wb, ws, "Template");
            } else {
                brands.forEach(brand => {
                    const allVariants = [
                        ...brand.flavors.map(v => ({ ...v, type: 'flavor' })),
                        ...brand.batteries.map(v => ({ ...v, type: 'battery' })),
                        ...(brand.posms || []).map(v => ({ ...v, type: 'posm' }))
                    ].map(v => ({
                        'Variant Name': v.name,
                        'Variant Type': v.type,
                        'Stock': v.stock,
                        'Unit Price': v.price || 0,
                        'Selling Price': v.sellingPrice || 0,
                        'DSP Price': v.dspPrice || 0,
                        'RSP Price': v.rspPrice || 0,
                    }));

                    const ws = XLSX.utils.json_to_sheet(allVariants);

                    // Set column widths
                    const wscols = [
                        { wch: 30 }, // Variant Name
                        { wch: 15 }, // Variant Type
                        { wch: 10 }, // Stock
                        { wch: 15 }, // Unit Price
                        { wch: 15 }, // Selling Price
                        { wch: 15 }, // DSP Price
                        { wch: 15 }, // RSP Price
                    ];
                    ws['!cols'] = wscols;

                    XLSX.utils.book_append_sheet(wb, ws, brand.name.substring(0, 31)); // sheet names limited to 31 chars
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
            { 'Brand Name': 'Example Brand', 'Variant Name': 'POSM 1', 'Variant Type': 'posm', 'Stock': 20, 'Unit Price': 0, 'Selling Price': 0, 'DSP Price': 0, 'RSP Price': 0 },
        ];
        const ws = XLSX.utils.json_to_sheet(templateData);
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

                // Fetch all variant types for the company once
                const { data: vtData } = await supabase
                    .from('variant_types')
                    .select('id, name')
                    .eq('company_id', user.company_id);

                const variantTypes = vtData || [];
                let successCount = 0;
                let errorCount = 0;

                for (const item of allData) {
                    try {
                        // 1. Get or Create Brand
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

                        // 2. Get variant_type_id
                        const dbVariantType = item.variantType === 'posm' ? 'POSM' : item.variantType;
                        const vt = variantTypes.find(t => t.name.toLowerCase() === dbVariantType.toLowerCase());

                        // 3. Get or Create Variant
                        let { data: variant } = await supabase
                            .from('variants')
                            .select('id')
                            .eq('company_id', user.company_id)
                            .eq('brand_id', brand!.id)
                            .eq('name', item.variantName)
                            .maybeSingle();

                        if (!variant) {
                            const sku = `${item.brandName.toUpperCase().replace(/\s+/g, '')}-${dbVariantType === 'flavor' ? 'F' : dbVariantType === 'battery' ? 'B' : 'P'}-${item.variantName.toUpperCase().replace(/\s+/g, '')}`;
                            const { data: newVariant, error: vErr } = await supabase
                                .from('variants')
                                .insert({
                                    company_id: user.company_id,
                                    brand_id: brand!.id,
                                    name: item.variantName,
                                    variant_type: dbVariantType,
                                    variant_type_id: vt?.id,
                                    sku
                                })
                                .select('id')
                                .single();
                            if (vErr) throw vErr;
                            variant = newVariant;
                        }

                        // 4. Update Main Inventory
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
                                    reorder_level: item.variantType === 'flavor' ? 50 : 30
                                });
                        }
                        successCount++;
                    } catch (err) {
                        console.error(`Error importing ${item.brandName} - ${item.variantName}:`, err);
                        errorCount++;
                    }
                }

                await refreshInventory();
                toast({
                    title: "Import Complete",
                    description: `Successfully processed ${successCount} items. ${errorCount > 0 ? `${errorCount} errors occurred.` : ''}`,
                });
            } catch (error: any) {
                toast({ title: "Import Failed", description: error.message, variant: "destructive" });
            } finally {
                setImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
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
    );
};
