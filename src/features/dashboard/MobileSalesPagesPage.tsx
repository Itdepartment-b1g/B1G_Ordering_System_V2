import { useAuth } from '@/features/auth';
import { MobileSalesNavWidgets } from './MobileSalesNavWidgets';

export default function MobileSalesPagesPage() {
  const { user } = useAuth();
  const name = user?.full_name || user?.email || 'User';

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Welcome back, {name}!</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your dashboard widgets are here. Please select a page you want to work on.
        </p>
      </div>
      <MobileSalesNavWidgets />
    </div>
  );
}
