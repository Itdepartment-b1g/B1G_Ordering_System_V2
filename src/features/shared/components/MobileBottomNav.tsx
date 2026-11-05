import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Package, Plus, Send, ShoppingBag, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  { label: 'Create', ariaLabel: 'Create Order', to: '/my-orders?create=1', icon: Plus, end: true, primary: true },
  { label: 'Clients', ariaLabel: 'Clients', to: '/my-clients', icon: ShoppingBag, end: true },
  { label: 'Request', ariaLabel: 'Request Inventory', to: '/inventory/mobile-request', icon: Send },
];

export function MobileBottomNav({ items }: { items: MobileBottomNavItem[] }) {
  return (
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
              {({ isActive }) =>
                item.primary ? (
                  <>
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm',
                        isActive && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background'
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                    </span>
                    <span>{item.label}</span>
                  </>
                ) : (
                  <>
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </>
                )
              }
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
