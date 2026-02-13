import { useAuth } from '@/features/auth';
import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useMemo } from 'react';
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  DollarSign,
  UserCircle,
  BanknoteIcon,
  ShoppingBag,
  LogOut,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  Archive,
  Calendar,
  Crown,
  History,
  ArrowLeft,
  Clock,
  Send,
  Brain,
  Building2,
  Tag,
  Map,
  LayoutGrid,
  Activity,
  Settings,
  ShieldCheck,
  CreditCard
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { usePermissions } from '@/hooks/usePermissions';

interface MenuItem {
  title: string;
  url: string;
  icon: React.ElementType;
  hasSubmenu?: boolean;
  submenu?: MenuItem[];
}

const adminMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  {
    title: 'Member Management',
    url: '/member-management',
    icon: Users,
    hasSubmenu: true,
    submenu: [
      { title: 'User Management', url: '/sales-agents', icon: Users },
      { title: 'Team Management', url: '/team-management', icon: Crown },
    ]
  },
  {
    title: 'Inventory',
    url: '/inventory',
    icon: Package,
    hasSubmenu: true,
    submenu: [
      { title: 'Main Inventory', url: '/inventory/main', icon: Package },
      { title: 'Stock Allocations', url: '/inventory/allocations', icon: Users },
      { title: 'Inventory Requests', url: '/inventory/admin-requests', icon: Send },
      { title: 'TL Stock Requests', url: '/inventory/admin-tl-requests', icon: Users },
      { title: 'Team Remittances', url: '/inventory/admin-team-remittances', icon: Users },
    ]
  },
  {
    title: 'Clients',
    url: '/clients',
    icon: ShoppingBag,
    hasSubmenu: true,
    submenu: [
      { title: 'Clients Database', url: '/clients', icon: ShoppingBag },
      { title: 'Pending Clients', url: '/clients/pending', icon: Clock },
      { title: 'Voided Clients', url: '/voided-clients', icon: Archive },
    ]
  },
  {
    title: 'Finance',
    url: '/finance-section',
    icon: DollarSign,
    hasSubmenu: true,
    submenu: [
      { title: 'Finance Page', url: '/finance', icon: DollarSign },
      { title: 'Order List', url: '/orders', icon: ShoppingCart },
      { title: 'Cash Deposits', url: '/inventory/cash-deposits', icon: BanknoteIcon },
      { title: 'Payment Settings', url: '/finance/payment-settings', icon: CreditCard },
    ]
  },
  {
    title: 'Procurement',
    url: '/purchase-order-management',
    icon: ClipboardList,
    hasSubmenu: true,
    submenu: [
      { title: 'Purchase Orders', url: '/purchase-orders', icon: ClipboardList },
      { title: 'Brands & Variants', url: '/brands', icon: Tag },
      { title: 'Variant Types', url: '/variant-types', icon: Tag },
      { title: 'Suppliers', url: '/suppliers', icon: Building2 },
    ]
  },

  { title: 'AI Analytics', url: '/analytics', icon: Brain },
  { title: 'War Room', url: '/war-room', icon: Map },
  { title: 'System History', url: '/system-history', icon: History },
  { title: 'Profile', url: '/profile', icon: UserCircle },
];

const agentMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'My Inventory', url: '/my-inventory', icon: Package },
  { title: 'Request Inventory', url: '/inventory/mobile-request', icon: Send },
  { title: 'My Clients', url: '/my-clients', icon: ShoppingBag },
  { title: 'My Orders', url: '/my-orders', icon: ShoppingCart },
  { title: 'My Activity', url: '/system-history', icon: History },
  { title: 'Calendar', url: '/calendar', icon: Calendar },
  { title: 'Profile', url: '/profile', icon: UserCircle },
];

const hermanosMenuItems: MenuItem[] = [
  { title: 'My Clients', url: '/my-clients', icon: ShoppingBag },
];

const leaderMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'My Team', url: '/my-team', icon: Users },
  { title: 'Analytics', url: '/analytics', icon: Brain },
  {
    title: 'Inventory',
    url: '/inventory',
    icon: Package,
    hasSubmenu: true,
    submenu: [
      { title: 'My Inventory', url: '/my-inventory', icon: Package },
      { title: 'Request Stock', url: '/leader-inventory/request', icon: Send },
      { title: 'Teams Inventory', url: '/leader-inventory', icon: Crown },
      { title: 'Pending Requests', url: '/inventory/pending-requests', icon: Send },
      { title: 'Team Remittances', url: '/inventory/team-remittances', icon: ArrowLeft },
      { title: 'Cash Deposits', url: '/inventory/cash-deposits', icon: DollarSign },
    ]
  },
  {
    title: 'Tasks',
    url: '/tasks',
    icon: ClipboardList,
    hasSubmenu: true,
    submenu: [
      { title: "Today's Tasks", url: '/tasks', icon: ClipboardList },
      { title: 'Archive Tasks', url: '/tasks/archive', icon: Archive },
    ]
  },
  { title: 'My Clients', url: '/my-clients', icon: ShoppingBag },
  { title: "My Team's Clients", url: '/my-teams', icon: Users },
  { title: 'My Orders', url: '/my-orders', icon: ShoppingCart },
  { title: 'Team Activity', url: '/system-history', icon: History },
  { title: 'Calendar', url: '/calendar', icon: Calendar },
  { title: 'Profile', url: '/profile', icon: UserCircle },
];

const systemAdminMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/sys-admin-dashboard', icon: LayoutDashboard },
  { title: 'Executive Account', url: '/system-admin', icon: ShieldCheck },
  { title: 'Management Portal', url: '/system-management', icon: LayoutGrid },
  { title: 'System History', url: '/system-history', icon: History },
  { title: 'Profile', url: '/profile', icon: UserCircle },
];

const executiveMenuItems: MenuItem[] = [
  { title: 'Executive Dashboard', url: '/executive-dashboard', icon: LayoutDashboard },
  { title: 'Profile', url: '/profile', icon: UserCircle },
];

const managerMenuItems: MenuItem[] = [
  { title: 'Manager Dashboard', url: '/manager-dashboard', icon: LayoutDashboard },
  { title: 'My Team', url: '/manager-teams', icon: Users },
  { title: 'Analytics', url: '/analytics', icon: Brain },
  {
    title: 'Inventory',
    url: '/inventory',
    icon: Package,
    hasSubmenu: true,
    submenu: [
      { title: 'Team Inventory', url: '/manager-inventory', icon: Crown },
      { title: 'Team Requests', url: '/manager-requests', icon: Send },
      { title: 'Team Remittances', url: '/manager-remittances', icon: ArrowLeft },
      { title: 'Cash Deposits', url: '/inventory/cash-deposits', icon: DollarSign },
    ]
  },
  { title: 'Team Clients', url: '/manager-clients', icon: ShoppingBag },
  { title: 'Team Activity', url: '/system-history', icon: History },
  { title: 'Calendar', url: '/calendar', icon: Calendar },
  { title: 'Profile', url: '/profile', icon: UserCircle },
];

const financeMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  {
    title: 'Finance',
    url: '/finance-section',
    icon: DollarSign,
    hasSubmenu: true,
    submenu: [
      { title: 'Finance Page', url: '/finance', icon: DollarSign },
      { title: 'Order List', url: '/orders', icon: ShoppingCart },
      { title: 'Cash Deposits', url: '/inventory/cash-deposits', icon: BanknoteIcon },
      { title: 'Payment Settings', url: '/finance/payment-settings', icon: CreditCard },
    ]
  },
  { title: 'System History', url: '/system-history', icon: History },
  { title: 'Profile', url: '/profile', icon: UserCircle },
];

// Super Admin menu - has access to ALL pages
const superAdminMenuItems: MenuItem[] = [
  { title: 'Dashboard', url: '/super-admin-dashboard', icon: LayoutDashboard },
  {
    title: 'Member Management',
    url: '/member-management',
    icon: Users,
    hasSubmenu: true,
    submenu: [
      { title: 'User Management', url: '/sales-agents', icon: Users },
      { title: 'Team Management', url: '/team-management', icon: Crown },
    ]
  },
  {
    title: 'Inventory',
    url: '/inventory',
    icon: Package,
    hasSubmenu: true,
    submenu: [
      { title: 'Main Inventory', url: '/inventory/main', icon: Package },
      { title: 'Stock Allocations', url: '/inventory/allocations', icon: Users },
      { title: 'Inventory Requests', url: '/inventory/admin-requests', icon: Send },
      { title: 'Team Remittances', url: '/inventory/admin-team-remittances', icon: Users },
    ]
  },
  {
    title: 'Clients',
    url: '/clients',
    icon: ShoppingBag,
    hasSubmenu: true,
    submenu: [
      { title: 'Clients Database', url: '/clients', icon: ShoppingBag },
      { title: 'Pending Clients', url: '/clients/pending', icon: Clock },
      { title: 'Voided Clients', url: '/voided-clients', icon: Archive },
    ]
  },
  {
    title: 'Finance',
    url: '/finance-section',
    icon: DollarSign,
    hasSubmenu: true,
    submenu: [
      { title: 'Finance Page', url: '/finance', icon: DollarSign },
      { title: 'Order List', url: '/orders', icon: ShoppingCart },
      { title: 'Cash Deposits', url: '/inventory/cash-deposits', icon: BanknoteIcon },
      { title: 'Payment Settings', url: '/finance/payment-settings', icon: CreditCard },
    ]
  },
  {
    title: 'Procurement',
    url: '/purchase-order-management',
    icon: ClipboardList,
    hasSubmenu: true,
    submenu: [
      { title: 'Purchase Orders', url: '/purchase-orders', icon: ClipboardList },
      { title: 'Brands & Variants', url: '/brands', icon: Tag },
      { title: 'Variant Types', url: '/variant-types', icon: Tag },
      { title: 'Suppliers', url: '/suppliers', icon: Building2 },
    ]
  },
  { title: 'AI Analytics', url: '/analytics', icon: Brain },
  { title: 'War Room', url: '/war-room', icon: Map },
  { title: 'System History', url: '/system-history', icon: History },
  {
    title: 'Settings',
    url: '/settings',
    icon: Settings,
    hasSubmenu: true,
    submenu: [
      { title: 'Profile', url: '/profile', icon: UserCircle },
      { title: 'System Settings', url: '/system-settings', icon: Settings },
    ]
  },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const { user, logout, impersonatedCompany, stopImpersonation } = useAuth();
  const { state, setOpenMobile } = useSidebar();
  const { checkPermission } = usePermissions();
  const isCollapsed = state === 'collapsed';
  const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Get menu items based on role, then filter by permissions
  const menuItems = useMemo(() => {
    // Filter menu items based on permissions
    const filterMenuItems = (items: MenuItem[]): MenuItem[] => {
      return items
        .filter(item => {
          // Check if user has permission for this route
          if (!checkPermission(item.url)) {
            return false;
          }
          // If item has submenu, filter submenu items too
          if (item.hasSubmenu && item.submenu) {
            const filteredSubmenu = item.submenu.filter(subItem =>
              checkPermission(subItem.url)
            );
            // Only show parent if it has at least one accessible submenu item
            return filteredSubmenu.length > 0;
          }
          return true;
        })
        .map(item => {
          // Filter submenu items
          if (item.hasSubmenu && item.submenu) {
            return {
              ...item,
              submenu: item.submenu.filter(subItem => checkPermission(subItem.url))
            };
          }
          return item;
        });
    };

    // If impersonating, show the Super Admin workspace for the tenant
    let baseMenuItems: MenuItem[] = [];
    if (impersonatedCompany) {
      baseMenuItems = superAdminMenuItems;
    } else if (user?.role === 'system_administrator') {
      baseMenuItems = systemAdminMenuItems;
    } else if (user?.role === 'executive') {
      baseMenuItems = executiveMenuItems;
    } else if (user?.role === 'super_admin') {
      baseMenuItems = superAdminMenuItems;
    } else if (user?.role === 'admin') {
      baseMenuItems = adminMenuItems;
    } else if (user?.role === 'manager') {
      baseMenuItems = managerMenuItems;
    } else if (user?.role === 'team_leader') {
      baseMenuItems = leaderMenuItems;
    } else if (user?.role === 'finance') {
      baseMenuItems = financeMenuItems;
    } else if (user?.role === 'mobile_sales') {
      baseMenuItems = agentMenuItems;
    } else {
      // Default to agent menu for other roles
      baseMenuItems = agentMenuItems;
    }

    // Filter menu items based on permissions
    return filterMenuItems(baseMenuItems);
  }, [user?.role, checkPermission, impersonatedCompany]);

  const toggleSubmenu = (menuTitle: string) => {
    setExpandedMenus(prev =>
      prev.includes(menuTitle)
        ? prev.filter(item => item !== menuTitle)
        : [...prev, menuTitle]
    );
  };

  const handleLogoutClick = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <ShoppingCart className="h-5 w-5 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sm truncate max-w-[150px]" title={impersonatedCompany ? impersonatedCompany.company_name : "B2B System"}>
                {impersonatedCompany ? impersonatedCompany.company_name : "B2B System"}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${impersonatedCompany ? 'text-primary' : 'text-muted-foreground'}`}>
                {impersonatedCompany ? 'Live View Active' : (user?.role?.replace('_', ' ') || 'User')}
              </span>
            </div>
          )}
        </div>

        {impersonatedCompany && !isCollapsed && (
          <div className="mt-4 p-3 rounded-xl bg-primary/10 border border-primary/20 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-primary tracking-widest">
              <Activity className="h-3 w-3 animate-pulse" />
              Tenant Mode
            </div>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Viewing as <span className="text-foreground font-bold">{impersonatedCompany.company_name}</span>
            </p>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.hasSubmenu ? (
                    <>
                      <SidebarMenuButton
                        onClick={() => toggleSubmenu(item.title)}
                        className="cursor-pointer nav-allow"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        {expandedMenus.includes(item.title) ? (
                          <ChevronDown className="ml-auto h-4 w-4" />
                        ) : (
                          <ChevronRight className="ml-auto h-4 w-4" />
                        )}
                      </SidebarMenuButton>
                      {expandedMenus.includes(item.title) && !isCollapsed && (
                        <div className="ml-4 space-y-1">
                          {item.submenu?.map((subItem) => (
                            <SidebarMenuButton key={subItem.title} asChild className="nav-allow">
                              <NavLink
                                to={subItem.url}
                                className={({ isActive }) =>
                                  `nav-allow ${isActive ? 'bg-sidebar-accent font-medium' : ''}`
                                }
                                onClick={() => setOpenMobile(false)}
                              >
                                <subItem.icon className="h-4 w-4" />
                                <span>{subItem.title}</span>
                              </NavLink>
                            </SidebarMenuButton>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <SidebarMenuButton asChild className="nav-allow">
                      <NavLink
                        to={item.url}
                        className={({ isActive }) =>
                          `nav-allow ${isActive ? 'bg-sidebar-accent font-medium' : ''}`
                        }
                        onClick={() => setOpenMobile(false)}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                        <ChevronRight className="ml-auto h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </NavLink>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        {!isCollapsed && (
          <div className="mb-2 px-2">
            <p className="text-sm font-medium">{user?.full_name || user?.email}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
        )}
        {impersonatedCompany && (
          <Button
            variant="default"
            className="w-full justify-start bg-primary hover:bg-primary/90 text-primary-foreground mb-2 shadow-lg shadow-primary/20 nav-allow"
            onClick={() => {
              stopImpersonation();
              navigate('/sys-admin-dashboard');
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2 nav-allow" />
            {!isCollapsed && <span className="nav-allow">Exit Live View</span>}
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full justify-start hover:bg-destructive/10 hover:text-destructive text-foreground"
          onClick={handleLogoutClick}
        >
          <LogOut className="h-4 w-4 mr-2" />
          {!isCollapsed && <span>Logout</span>}
        </Button>

        {/* Logout Confirmation Dialog */}
        <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Logout Confirmation</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to logout? You will need to sign in again to access your account.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmLogout} className="bg-destructive hover:bg-destructive/90">
                Yes, Logout
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarFooter>
    </Sidebar>
  );
}

