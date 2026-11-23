import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Eye,
  LayoutDashboard,
  Package,
  Plus,
  Send,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export type MobileBottomNavItem = {
  label: string;
  ariaLabel: string;
  to: string;
  icon: LucideIcon;
  /** Match only this path, not nested pages. */
  end?: boolean;
  /** Center action, drawn as a raised button. */
  primary?: boolean;
};

export const mobileSalesBottomNavItems: MobileBottomNavItem[] = [
  { label: 'Dashboard', ariaLabel: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true },
  { label: 'Inventory', ariaLabel: 'My Inventory', to: '/my-inventory', icon: Package },
  { label: 'Create', ariaLabel: 'Orders', to: '/my-orders', icon: Plus, end: true, primary: true },
  { label: 'Clients', ariaLabel: 'Clients', to: '/my-clients', icon: ShoppingBag, end: true },
  { label: 'Request', ariaLabel: 'Request Inventory', to: '/inventory/mobile-request', icon: Send },
];

function OrdersActionSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-2">
        <SheetHeader className="pb-3 text-left">
          <SheetTitle className="text-base">Orders</SheetTitle>
          <SheetDescription>What would you like to do?</SheetDescription>
        </SheetHeader>
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => go('/my-orders?create=1')}
            className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left active:bg-accent"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Plus className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Create order</span>
              <span className="block text-xs text-muted-foreground">Start a new client order</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => go('/my-orders')}
            className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left active:bg-accent"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground">
              <Eye className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">View orders</span>
              <span className="block text-xs text-muted-foreground">See your existing orders</span>
            </span>
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MobileBottomNav({ items }: { items: MobileBottomNavItem[] }) {
  const location = useLocation();
  const [ordersSheetOpen, setOrdersSheetOpen] = useState(false);
  const ordersActive = location.pathname === '/my-orders';

  return (
    <>
      <nav
        aria-label="Primary"
        className="shrink-0 border-t bg-background md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
        >
          {items.map((item) => (
            <li key={item.ariaLabel}>
              {item.primary ? (
                <button
                  type="button"
                  aria-label={item.ariaLabel}
                  aria-haspopup="dialog"
                  aria-expanded={ordersSheetOpen}
                  onClick={() => setOrdersSheetOpen(true)}
                  className={cn(
                    'flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium leading-tight',
                    ordersActive || ordersSheetOpen ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm',
                      (ordersActive || ordersSheetOpen) &&
                        'ring-2 ring-primary/30 ring-offset-2 ring-offset-background'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                  </span>
                  <span>{item.label}</span>
                </button>
              ) : (
                <NavLink
                  to={item.to}
                  end={item.end}
                  aria-label={item.ariaLabel}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium leading-tight',
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </NavLink>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <OrdersActionSheet open={ordersSheetOpen} onOpenChange={setOrdersSheetOpen} />
    </>
  );
}
