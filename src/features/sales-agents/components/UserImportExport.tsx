import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Upload, FileSpreadsheet, Loader2, FileUp, FileDown, MoreVertical } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface UserProfile {
    id: string;
    name: string;
    email: string;
    phone: string;
    region: string;
    cities: string[];
    role: string;
    status: string;
}

interface UserImportExportProps {
    users: UserProfile[];
    onRefresh: () => void;
}

export function UserImportExport({ users, onRefresh }: UserImportExportProps) {
    const { user: currentUser } = useAuth();
    const { toast } = useToast();
    const [isImporting, setIsImporting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleExport = () => {
        try {
            setIsExporting(true);

            const exportData = users.map(user => ({
                'Full Name': user.name,
                'Email': user.email,
                'Phone': user.phone,
                'Role': user.role,
                'Region': user.region,
                'Cities': user.cities.join(', '),
                'Status': user.status
            }));

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(exportData);
            XLSX.utils.book_append_sheet(wb, ws, 'Users');

            XLSX.writeFile(wb, `Users_Export_${new Date().toISOString().split('T')[0]}.xlsx`);

            toast({ title: "Export Successful", description: "User list has been downloaded." });
        } catch (error) {
            console.error('Export error:', error);
            toast({ title: "Export Failed", description: "Failed to generate Excel file.", variant: "destructive" });
        } finally {
            setIsExporting(false);
        }
    };

    const handleDownloadTemplate = () => {
        const templateData = [
            {
                'Full Name': 'John Doe',
                'Email': 'john@example.com',
                'Phone': '09123456789',
                'Role': 'mobile_sales',
                'Region': 'NCR',
                'Cities': 'Manila, Quezon City',
                'Password': 'tempPassword123!'
            },
            {
                'Full Name': 'Jane Smith',
                'Email': 'jane@example.com',
                'Phone': '09987654321',
                'Role': 'team_leader',
                'Region': 'Region IV-A',
                'Cities': 'Cabuyao, Santa Rosa',
                'Password': 'tempPassword123!'
            }
        ];

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(templateData);

        // Add instruction note
        const notes = [
            ['ROLES GUIDE:'],
            ['admin - Administrator access'],
            ['finance - Financial management'],
            ['manager - Operational manager'],
            ['team_leader - Team supervisor'],
            ['mobile_sales - Field agent'],
            [''],
            ['IMPORTANT:'],
            ['- Password must be at least 6 characters.'],
            ['- Cities should be comma-separated.'],
            ['- Roles must be lowercase as shown above.']
        ];
        XLSX.utils.sheet_add_aoa(ws, notes, { origin: 'I1' });

        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.writeFile(wb, 'User_Import_Template.xlsx');
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws) as any[];

                if (data.length === 0) {
                    toast({ title: "Import Error", description: "The Excel file is empty.", variant: "destructive" });
                    return;
                }

                let successCount = 0;
                let failCount = 0;
                const errors: string[] = [];

                for (const row of data) {
                    const email = row['Email'] || row['email'];
                    const fullName = row['Full Name'] || row['full_name'] || row['FullName'];
                    const role = (row['Role'] || row['role'] || 'mobile_sales').toLowerCase();
                    const phone = row['Phone'] || row['phone'];
                    const region = row['Region'] || row['region'];
                    const cities = row['Cities'] || row['cities'];
                    const password = row['Password'] || row['password'] || 'tempPassword123!';

                    if (!email || !fullName) {
                        failCount++;
                        errors.push(`Missing email or name for: ${fullName || email || 'Unknown row'}`);
                        continue;
                    }

                    try {
                        const { data: fnRes, error: fnErr } = await supabase.functions.invoke('create-agent', {
                            body: {
                                email: email.trim(),
                                password: password,
                                full_name: fullName.trim(),
                                role: role,
                                phone: phone ? String(phone) : null,
                                region: region || null,
                                city: cities || null,
                                status: 'active',
                                company_id: currentUser?.company_id
                            }
                        });

                        if (fnErr || (fnRes && fnRes.error)) {
                            throw new Error(fnErr?.message || fnRes?.error || 'Unknown error');
                        }

                        successCount++;
                    } catch (err: any) {
                        console.error(`Failed to import ${email}:`, err);
                        failCount++;
                        errors.push(`${email}: ${err.message}`);
                    }
                }

                toast({
                    title: "Import Complete",
                    description: `Successfully imported ${successCount} users. ${failCount} failed.`,
                    variant: failCount > 0 ? "destructive" : "default"
                });

                if (errors.length > 0) {
                    console.error('Import Errors:', errors);
                }

                onRefresh();
            } catch (error: any) {
                console.error('File reading error:', error);
                toast({ title: "Import Failed", description: "Failed to read Excel file.", variant: "destructive" });
            } finally {
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };

        reader.readAsBinaryString(file);
    };

    return (
        <>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx, .xls"
                className="hidden"
            />
            
            {/* Mobile: Dropdown Menu */}
            <div className="md:hidden">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={handleDownloadTemplate}>
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            Download Template
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExport} disabled={isExporting}>
                            {isExporting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <FileDown className="mr-2 h-4 w-4" />
                            )}
                            Export Users
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleImportClick} disabled={isImporting}>
                            {isImporting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <FileUp className="mr-2 h-4 w-4" />
                            )}
                            Import Users
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Desktop: All Buttons */}
            <div className="hidden md:flex gap-2">
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Template
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
                    {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                    Export
                </Button>
                <Button variant="outline" size="sm" onClick={handleImportClick} disabled={isImporting}>
                    {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
                    Import
                </Button>
            </div>
        </>
    );
}
