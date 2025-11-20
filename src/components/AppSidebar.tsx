import {
  LayoutDashboard,
  Building2,
  ShoppingCart,
  Package,
  Users,
  BarChart3,
  FileText,
  UsersRound,
  Shield,
  ChevronDown,
  Boxes,
  ClipboardList,
  DollarSign,
  History,
  LogOut,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';

export const AppSidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const menuItems = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, roles: ['system_admin', 'super_admin', 'admin', 'manager', 'team_leader', 'mobile_sales'] },
    { title: 'Companies', url: '/companies', icon: Building2, roles: ['system_admin'] },
    {
      title: 'Member Management',
      icon: UsersRound,
      roles: ['super_admin', 'admin'],
      submenu: [
        { title: 'Users', url: '/users', icon: Users },
        { title: 'Team Management', url: '/team-management', icon: UsersRound },
      ]
    },
    {
      title: 'Inventory Management',
      icon: Package,
      roles: ['super_admin', 'admin', 'manager', 'team_leader'],
      submenu: [
        { title: 'Main Inventory', url: '/inventory', icon: Boxes },
        { title: 'Stock Allocations', url: '/stock-allocations', icon: Package },
        { title: 'Inventory Requests', url: '/inventory-requests', icon: ClipboardList },
        { title: 'Remitted Stocks', url: '/remitted-stocks', icon: Package },
      ]
    },
    {
      title: 'Clients Management',
      icon: Users,
      roles: ['super_admin', 'admin', 'manager', 'team_leader', 'mobile_sales'],
      submenu: [
        { title: 'Clients Database', url: '/clients', icon: Users },
        { title: 'Pending Clients', url: '/pending-clients', icon: Users },
        { title: 'Voided Clients', url: '/voided-clients', icon: Users },
      ]
    },
    { title: 'Orders', url: '/orders', icon: ShoppingCart, roles: ['super_admin', 'admin', 'manager', 'team_leader', 'mobile_sales'] },
    { title: 'Purchase Orders', url: '/purchase-orders', icon: ClipboardList, roles: ['super_admin', 'admin'] },
    { title: 'Finance', url: '/finance', icon: DollarSign, roles: ['super_admin', 'admin'] },
    { title: 'Analytics', url: '/analytics', icon: BarChart3, roles: ['super_admin', 'admin', 'manager'] },
    { title: 'Reports', url: '/reports', icon: FileText, roles: ['super_admin', 'admin', 'manager'] },
    { title: 'History', url: '/history', icon: History, roles: ['super_admin', 'admin'] },
    { title: 'Permissions', url: '/permissions', icon: Shield, roles: ['super_admin'] },
  ];

  const filteredItems = menuItems.filter((item) => item.roles.includes(user?.role || ''));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">B2B System</h2>
            <p className="text-xs text-muted-foreground">{user.companyName || 'Admin'}</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredItems.map((item) => (
                item.submenu ? (
                  <Collapsible key={item.title} defaultOpen>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                          <ChevronDown className="ml-auto h-4 w-4" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.submenu.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild>
                                <NavLink to={subItem.url} activeClassName="bg-primary text-primary-foreground">
                                  <subItem.icon className="h-4 w-4" />
                                  <span>{subItem.title}</span>
                                </NavLink>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                ) : (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink to={item.url} activeClassName="bg-primary text-primary-foreground">
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4">
        <Button variant="ghost" className="w-full justify-start" onClick={() => { logout(); navigate('/login'); }}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};
