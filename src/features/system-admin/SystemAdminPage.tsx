import { useAuth } from '@/features/auth';
import { ExecutiveAccountsTab } from './ExecutiveAccountsTab';
import { WarehouseAccountsTab } from './WarehouseAccountsTab';
import { ShieldCheck, Users, Warehouse } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function SystemAdminPage() {
    const { user } = useAuth();

    if (user?.role !== 'system_administrator') {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <ShieldCheck className="h-16 w-16 text-destructive opacity-50" />
                <h2 className="text-2xl font-bold text-destructive">Access Denied</h2>
                <p className="text-muted-foreground">This page is restricted to System Administrators only.</p>
                <Button variant="outline" onClick={() => window.history.back()}>Go Back</Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 md:p-8">
            <Tabs defaultValue="executive" className="space-y-6">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="executive" className="gap-2">
                        <Users className="h-4 w-4" />
                        Executive accounts
                    </TabsTrigger>
                    <TabsTrigger value="warehouse" className="gap-2">
                        <Warehouse className="h-4 w-4" />
                        Warehouse accounts
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="executive" className="mt-0">
                    <ExecutiveAccountsTab />
                </TabsContent>
                <TabsContent value="warehouse" className="mt-0">
                    <WarehouseAccountsTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}
