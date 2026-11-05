import { Link } from 'react-router-dom';
import {
  Calendar,
  CheckCircle2,
  History,
  LayoutDashboard,
  Package,
  Package2,
  RotateCcw,
  Send,
  ShoppingBag,
  ShoppingCart,
  UserCircle,
  type LucideIcon,
} from 'lucide-react';

type Shortcut = {
  title: string;
  description: string;
  url: string;
  icon: LucideIcon;
};

const SHORTCUTS: Shortcut[] = [
  { title: 'Dashboard', description: 'Your sales totals and what still needs action.', url: '/dashboard', icon: LayoutDashboard },
  { title: 'My Inventory', description: 'Stock you currently hold.', url: '/my-inventory', icon: Package },
  { title: 'Return History', description: 'Stock you sent back to your team leader.', url: '/inventory/my-returns', icon: RotateCcw },
  { title: 'Allocation History', description: 'Stock your team leader gave you.', url: '/my-allocation-history', icon: Package2 },
  { title: 'Request Inventory', description: 'Ask your team leader for more stock.', url: '/inventory/mobile-request', icon: Send },
  { title: 'Price Agreements', description: 'Prices you and your team leader agreed on.', url: '/inventory/price-agreements', icon: CheckCircle2 },
  { title: 'Price History', description: 'Past changes to your selling prices.', url: '/inventory/price-history', icon: History },
  { title: 'My Clients', description: 'Clients you sell to.', url: '/my-clients', icon: ShoppingBag },
  { title: 'My Orders', description: 'Orders you created and their status.', url: '/my-orders', icon: ShoppingCart },
  { title: 'Client Order Returns', description: 'Stock your clients sent back.', url: '/client-order-returns', icon: RotateCcw },
  { title: 'My Activity', description: 'What you did in the system.', url: '/system-history', icon: History },
  { title: 'Calendar', description: 'Your schedule and upcoming dates.', url: '/calendar', icon: Calendar },
  { title: 'Profile', description: 'Your account details.', url: '/profile', icon: UserCircle },
  { title: 'Attendance', description: 'Clock in and review your attendance.', url: '/attendance', icon: Calendar },
];

export function MobileSalesNavWidgets() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {SHORTCUTS.map((item) => (
        <Link
          key={item.url}
          to={item.url}
          className="flex min-h-[92px] flex-col gap-1.5 rounded-xl border bg-card px-3 py-3 text-left shadow-sm active:bg-accent"
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold leading-tight">{item.title}</span>
            <item.icon className="h-4 w-4 shrink-0 text-primary" />
          </span>
          <span className="text-xs leading-snug text-muted-foreground">{item.description}</span>
        </Link>
      ))}
    </div>
  );
}
