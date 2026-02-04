import { useAuth } from '@/features/auth';
import { ExecutiveAccountsTab } from './ExecutiveAccountsTab';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
            <ExecutiveAccountsTab />
        </div>
    );
}
