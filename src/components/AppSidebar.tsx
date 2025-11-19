import { useLocation, useNavigate } from 'react-router-dom';
import {
  Building2,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  FileText,
  BarChart3,
  Settings,
  Shield,
  LogOut,
  Menu,
  Bell,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
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
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const getMenuItems = (role: string) => {
  const systemAdminItems = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
    { title: 'Companies', url: '/companies', icon: Building2 },
  ];

  const superAdminItems = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
    { title: 'Orders', url: '/orders', icon: ShoppingCart },
    { title: 'Inventory', url: '/inventory', icon: Package },
    { title: 'Clients', url: '/clients', icon: Users },
    { title: 'Analytics', url: '/analytics', icon: BarChart3 },
    { title: 'Users', url: '/users', icon: Users },
    { title: 'Roles & Permissions', url: '/permissions', icon: Shield },
    { title: 'Reports', url: '/reports', icon: FileText },
  ];

  const adminItems = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
    { title: 'Orders', url: '/orders', icon: ShoppingCart },
    { title: 'Inventory', url: '/inventory', icon: Package },
    { title: 'Clients', url: '/clients', icon: Users },
    { title: 'Analytics', url: '/analytics', icon: BarChart3 },
    { title: 'Users', url: '/users', icon: Users },
    { title: 'Reports', url: '/reports', icon: FileText },
  ];

  const managerItems = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
    { title: 'Orders', url: '/orders', icon: ShoppingCart },
    { title: 'Inventory', url: '/inventory', icon: Package },
    { title: 'Team', url: '/team', icon: Users },
    { title: 'Analytics', url: '/analytics', icon: BarChart3 },
  ];

  const teamLeaderItems = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
    { title: 'Orders', url: '/orders', icon: ShoppingCart },
    { title: 'Inventory', url: '/inventory', icon: Package },
    { title: 'Team', url: '/team', icon: Users },
  ];

  const mobileSalesItems = [
    { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
    { title: 'Orders', url: '/orders', icon: ShoppingCart },
    { title: 'Clients', url: '/clients', icon: Users },
    { title: 'Inventory', url: '/inventory', icon: Package },
  ];

  switch (role) {
    case 'system_admin':
      return systemAdminItems;
    case 'super_admin':
      return superAdminItems;
    case 'admin':
      return adminItems;
    case 'manager':
      return managerItems;
    case 'team_leader':
      return teamLeaderItems;
    case 'mobile_sales':
      return mobileSalesItems;
    default:
      return [];
  }
};

export const AppSidebar = () => {
  const { user, logout } = useAuth();
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const isCollapsed = state === 'collapsed';

  if (!user) return null;

  const menuItems = getMenuItems(user.role);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary">
            <Building2 className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-sidebar-foreground">
                {user.companyName || 'B2B System'}
              </h2>
              <p className="text-xs text-sidebar-foreground/60">{user.name}</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/60">
            {!isCollapsed && 'Main Menu'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location.pathname === item.url}>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3 text-sidebar-foreground hover:text-sidebar-primary-foreground hover:bg-sidebar-accent"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    >
                      <item.icon className="h-5 w-5" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          size={isCollapsed ? 'icon' : 'default'}
          onClick={handleLogout}
          className="w-full justify-start text-sidebar-foreground hover:text-sidebar-primary-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="h-5 w-5" />
          {!isCollapsed && <span className="ml-3">Logout</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};
