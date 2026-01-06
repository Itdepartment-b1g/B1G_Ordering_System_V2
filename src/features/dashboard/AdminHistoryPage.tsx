import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/features/auth';
import { History, ShoppingCart, Users, Boxes, ClipboardCheck, Wallet, UserCog, Filter, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

type EventRow = {
  id: string;
  occurred_at: string;
  actor_id: string;
  actor_role: 'admin' | 'leader' | 'sales_agent' | 'system';
  performed_by: string;
  action: string;
  target_type: string;
  target_id: string;
  details: any;
  target_label?: string | null;
  actor_label?: string | null;
};

type Priority = 'all' | 'critical' | 'high' | 'medium' | 'low';

const TAB_FILTERS: Record<string, (e: EventRow) => boolean> = {
  all: () => true,
  orders: (e) => (e.target_type === 'client_order' || e.target_type === 'client_order_item') && e.action !== 'approve' && e.action !== 'reject',
  purchase_orders: (e) => e.target_type === 'purchase_order' || e.target_type === 'purchase_order_item',
  clients: (e) => e.target_type === 'client',
  allocations: (e) => e.action === 'allocate_stock' || e.action === 'remit_inventory' || e.target_type === 'stock_allocation' || e.target_type === 'agent_inventory' || e.target_type === 'leader_inventory',
  tasks: (e) => e.target_type === 'task',
  financial: (e) =>
    e.target_type === 'financial_transaction' ||
    (e.target_type === 'client_order' && (e.action === 'approve' || e.action === 'reject')) ||
    (e.target_type === 'purchase_order' && (e.action === 'approve' || e.action === 'reject')),
  teams: (e) => e.target_type === 'leader_team',
  inventory: (e) => e.target_type === 'main_inventory' || e.target_type === 'leader_inventory' || e.target_type === 'agent_inventory',
  users: (e) => e.target_type === 'user' || e.target_type === 'profile' || e.target_type === 'company',
  products: (e) => e.target_type === 'brand' || e.target_type === 'variant' || e.target_type === 'supplier' || e.target_type === 'product',
  system: (e) => e.actor_role === 'system' || e.target_type === 'system' || e.target_type === 'config',
  calendar: (e) => e.target_type === 'calendar' || e.target_type === 'event' || e.target_type === 'daily_task',
};

const getPriority = (event: EventRow): Exclude<Priority, 'all'> => {
  const action = event.action || '';
  const type = event.target_type || '';
  if (['approve', 'reject', 'allocate_stock', 'remit_inventory'].includes(action)) return 'critical';
  if (['insert', 'delete', 'company_created', 'company_deleted'].includes(action) || type === 'purchase_order') return 'high';
  if (['update', 'order_created', 'client_created', 'inventory_request_created'].includes(action)) return 'medium';
  return 'low';
};

export default function AdminHistoryPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'orders' | 'purchase_orders' | 'clients' | 'allocations' | 'tasks' | 'financial' | 'teams' | 'inventory' | 'users' | 'products' | 'system' | 'calendar'>('all');
  const [actorPositions, setActorPositions] = useState<Record<string, string | null>>({});
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<Priority>('all');

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        // RLS policy for admin allows viewing all events
        const { data, error } = await supabase
          .from('events')
          .select('id, occurred_at, actor_id, actor_role, performed_by, action, target_type, target_id, details, target_label, actor_label')
          .order('occurred_at', { ascending: false })
          .limit(500);
        if (error) throw error;

        // Fetch positions for all unique actor_ids BEFORE setting events
        const uniqueActorIds = [...new Set((data as any[]).map(e => e.actor_id).filter(Boolean))];
        let positionsMap: Record<string, string | null> = {};

        if (uniqueActorIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, position, role')
            .in('id', uniqueActorIds);

          if (profilesError) {
            console.error('Error fetching actor positions:', profilesError);
          } else {
            profilesData?.forEach(profile => {
              positionsMap[profile.id] = profile.position || null;
            });
          }
        }

        // Set both events and positions together to avoid flickering
        // Batch all state updates together
        setActorPositions(positionsMap);
        setEvents((data as any[]) as EventRow[]);
        setLoading(false);
      } catch (e) {
        console.error('Load history error:', e);
        setEvents([]);
        setActorPositions({});
        setLoading(false);
      }
    };
    load();

    // Realtime: subscribe to new events
    const channel = supabase
      .channel('events_admin_history')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events' },
        async (payload: any) => {
          const newEvent = payload.new as EventRow;
          setEvents((prev) => {
            const next = [newEvent, ...prev];
            return next.slice(0, 500);
          });

          // ensure we have position info for the new actor if missing
          const actorId = (newEvent as any)?.actor_id;
          if (actorId && !actorPositions[actorId]) {
            try {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('id, position, role')
                .eq('id', actorId)
                .single();
              if (profileData) {
                setActorPositions((prev) => ({ ...prev, [actorId]: profileData.position || null }));
              }
            } catch { }
          }
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch { }
    };
  }, [user?.id]);

  const availableActions = useMemo(() => {
    const set = new Set<string>();
    const inTab = events.filter(TAB_FILTERS[tab]);
    inTab.forEach((e) => { if (e.action) set.add(e.action); });
    return Array.from(set).sort();
  }, [events, tab]);

  const tabCounts = useMemo(() => {
    const removeUndisplayable = (rows: EventRow[]) => rows.filter((e) => {
      if (e.details?.message) return true;
      if (e.details?.before && e.details?.after) return true;
      if (e.details?.actor && e.details?.action_performed) return true;
      return false;
    });
    const base: Record<string, number> = {};
    (['all', 'orders', 'purchase_orders', 'clients', 'allocations', 'tasks', 'financial', 'teams', 'inventory', 'users', 'products', 'system', 'calendar'] as const).forEach((k) => {
      base[k] = removeUndisplayable(events.filter(TAB_FILTERS[k])).length;
    });
    return base;
  }, [events]);

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    leader: 'bg-green-100 text-green-700',
    'sales agent': 'bg-blue-100 text-blue-700',
    sales_agent: 'bg-blue-100 text-blue-700',
    system: 'bg-gray-100 text-gray-700',
  };

  const actionColors: Record<string, string> = {
    insert: 'bg-green-100 text-green-700',
    update: 'bg-yellow-100 text-yellow-700',
    delete: 'bg-red-100 text-red-700',
    approve: 'bg-blue-100 text-blue-700',
    reject: 'bg-orange-100 text-orange-700',
    allocate_stock: 'bg-teal-100 text-teal-700',
    remit_inventory: 'bg-purple-100 text-purple-700',
    complete: 'bg-emerald-100 text-emerald-700',
  };

  const priorityColors: Record<Exclude<Priority, 'all'>, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-gray-100 text-gray-700',
  };

  const priorityCounts = useMemo(() => {
    const base = { critical: 0, high: 0, medium: 0, low: 0 };
    events.forEach((e) => {
      const p = getPriority(e);
      base[p] += 1;
    });
    return base;
  }, [events]);

  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => {
      if (e.actor_role) set.add(e.actor_role);
    });
    return Array.from(set);
  }, [events]);

  const [selectedRole, setSelectedRole] = useState<string>('all');

  const filtered = useMemo(() => {
    const f = TAB_FILTERS[tab];
    let rows = events.filter(f);

    // Filter out rows that only have JSON details without a proper message
    rows = rows.filter((e) => {
      if (e.details?.message) return true;
      if (e.details?.before && e.details?.after) return true;
      if (e.details?.actor && e.details?.action_performed) return true;
      return false;
    });

    if (selectedActions.length > 0) {
      rows = rows.filter((e) => selectedActions.includes(e.action));
    }

    if (priorityFilter !== 'all') {
      rows = rows.filter((e) => getPriority(e) === priorityFilter);
    }

    if (selectedRole !== 'all') {
      rows = rows.filter((e) => (e.actor_role || '').toLowerCase() === selectedRole.toLowerCase());
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((e) =>
        (e.target_label || '').toLowerCase().includes(q) ||
        (e.actor_label || '').toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.target_type.toLowerCase().includes(q) ||
        (e.actor_role || '').toLowerCase().includes(q)
      );
    }
    return rows;
  }, [events, tab, search, selectedActions, priorityFilter, selectedRole]);

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System History</h1>
          <p className="text-muted-foreground">Full audit trail across users, roles, and priorities</p>
        </div>
        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
          Based on notification priority rules
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
          <Card key={p} className={`border-border/50 shadow-sm ${priorityFilter === p ? 'ring-1 ring-primary/30' : ''}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-muted-foreground">{p} priority</p>
                <p className="text-2xl font-semibold">{priorityCounts[p]}</p>
              </div>
              <Badge className={`text-xs ${priorityColors[p]}`}>{p}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Search by action, label, type, or actor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Actions
                      {selectedActions.length > 0 && (
                        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">{selectedActions.length}</span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Filter by actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={selectedActions.length === 0}
                      onCheckedChange={() => setSelectedActions([])}
                    >
                      All actions
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    {availableActions.map((a) => (
                      <DropdownMenuCheckboxItem
                        key={a}
                        checked={selectedActions.length === 1 && selectedActions[0] === a}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedActions([a]);
                          } else {
                            setSelectedActions([]);
                          }
                        }}
                      >
                        {a.replace(/_/g, ' ')}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      Priority
                      {priorityFilter !== 'all' && (
                        <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${priorityColors[priorityFilter as Exclude<Priority, 'all'>]}`}>
                          {priorityFilter}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Filter by priority</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {(['all', 'critical', 'high', 'medium', 'low'] as Priority[]).map((p) => (
                      <DropdownMenuCheckboxItem
                        key={p}
                        checked={priorityFilter === p}
                        onCheckedChange={() => setPriorityFilter(p)}
                      >
                        {p === 'all' ? 'All priorities' : p.charAt(0).toUpperCase() + p.slice(1)}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      Roles
                      {selectedRole !== 'all' && (
                        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs">{selectedRole}</span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Filter by role</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={selectedRole === 'all'}
                      onCheckedChange={() => setSelectedRole('all')}
                    >
                      All roles
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    {availableRoles.map((r) => (
                      <DropdownMenuCheckboxItem
                        key={r}
                        checked={selectedRole === r}
                        onCheckedChange={() => setSelectedRole(r)}
                      >
                        {r.replace(/_/g, ' ')}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <div className="w-full">
              <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1 rounded-md bg-muted p-1 overflow-x-auto">
                <TabsTrigger value="all" className="data-[state=active]:bg-background">
                  <History className="mr-2 h-4 w-4" />
                  All
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.all}</span>
                </TabsTrigger>
                <TabsTrigger value="orders" className="data-[state=active]:bg-background">
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Orders
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.orders}</span>
                </TabsTrigger>
                <TabsTrigger value="purchase_orders" className="data-[state=active]:bg-background">
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Purchase Orders
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.purchase_orders}</span>
                </TabsTrigger>
                <TabsTrigger value="clients" className="data-[state=active]:bg-background">
                  <UserCog className="mr-2 h-4 w-4" />
                  Clients
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.clients}</span>
                </TabsTrigger>
                <TabsTrigger value="allocations" className="data-[state=active]:bg-background">
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Allocations
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.allocations}</span>
                </TabsTrigger>
                <TabsTrigger value="tasks" className="data-[state=active]:bg-background">
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Tasks
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.tasks}</span>
                </TabsTrigger>
                <TabsTrigger value="financial" className="data-[state=active]:bg-background">
                  <Wallet className="mr-2 h-4 w-4" />
                  Financial
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.financial}</span>
                </TabsTrigger>
                <TabsTrigger value="teams" className="data-[state=active]:bg-background">
                  <Users className="mr-2 h-4 w-4" />
                  Teams
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.teams}</span>
                </TabsTrigger>
                <TabsTrigger value="inventory" className="data-[state=active]:bg-background">
                  <Boxes className="mr-2 h-4 w-4" />
                  Inventory
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.inventory}</span>
                </TabsTrigger>
                <TabsTrigger value="users" className="data-[state=active]:bg-background">
                  <UserCog className="mr-2 h-4 w-4" />
                  Users
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.users}</span>
                </TabsTrigger>
                <TabsTrigger value="products" className="data-[state=active]:bg-background">
                  <Boxes className="mr-2 h-4 w-4" />
                  Products
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.products}</span>
                </TabsTrigger>
                <TabsTrigger value="system" className="data-[state=active]:bg-background">
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  System
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.system}</span>
                </TabsTrigger>
                <TabsTrigger value="calendar" className="data-[state=active]:bg-background">
                  <History className="mr-2 h-4 w-4" />
                  Calendar
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.calendar}</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all" className="mt-4">
              <HistoryTable rows={filtered} loading={loading} roleColors={roleColors} actionColors={actionColors} actorPositions={actorPositions} />
            </TabsContent>
            <TabsContent value="orders" className="mt-4">
              <HistoryTable rows={filtered} loading={loading} roleColors={roleColors} actionColors={actionColors} actorPositions={actorPositions} />
            </TabsContent>
            <TabsContent value="clients" className="mt-4">
              <HistoryTable rows={filtered} loading={loading} roleColors={roleColors} actionColors={actionColors} actorPositions={actorPositions} />
            </TabsContent>
            <TabsContent value="allocations" className="mt-4">
              <HistoryTable rows={filtered} loading={loading} roleColors={roleColors} actionColors={actionColors} actorPositions={actorPositions} />
            </TabsContent>
            <TabsContent value="tasks" className="mt-4">
              <HistoryTable rows={filtered} loading={loading} roleColors={roleColors} actionColors={actionColors} actorPositions={actorPositions} />
            </TabsContent>
            <TabsContent value="financial" className="mt-4">
              <HistoryTable rows={filtered} loading={loading} roleColors={roleColors} actionColors={actionColors} actorPositions={actorPositions} />
            </TabsContent>
            <TabsContent value="teams" className="mt-4">
              <HistoryTable rows={filtered} loading={loading} roleColors={roleColors} actionColors={actionColors} actorPositions={actorPositions} />
            </TabsContent>
            <TabsContent value="inventory" className="mt-4">
              <HistoryTable rows={filtered} loading={loading} roleColors={roleColors} actionColors={actionColors} actorPositions={actorPositions} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryTable({
  rows,
  loading,
  roleColors,
  actionColors,
  actorPositions
}: {
  rows: EventRow[];
  loading: boolean;
  roleColors: Record<string, string>;
  actionColors: Record<string, string>;
  actorPositions: Record<string, string | null>;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  // Reset to first page when the dataset changes (e.g., switching tabs or searching)
  useEffect(() => {
    setPage(1);
  }, [rows]);

  // Helper function to get display role based on role and position
  const getDisplayRole = (event: EventRow): string => {
    if (event.actor_role === 'admin') {
      return 'admin';
    }
    if (event.actor_role === 'sales_agent') {
      const position = actorPositions[event.actor_id];
      // Check if position is "Leader" or "sales agent/leader"
      if (position && (position.toLowerCase() === 'leader' || position.toLowerCase() === 'sales agent/leader')) {
        return 'leader';
      }
      return 'sales agent';
    }
    if (event.actor_role === 'leader') {
      return 'leader';
    }
    return event.actor_role || 'system';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        No history yet
      </div>
    );
  }

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentRows = rows.slice(startIndex, endIndex);

  return (
    <div className="border rounded-lg overflow-hidden shadow-sm bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="text-sm text-muted-foreground">
          Showing <span className="font-medium">{startIndex + 1}</span>–
          <span className="font-medium">{Math.min(endIndex, rows.length)}</span> of
          <span className="font-medium"> {rows.length}</span>
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        {/* Scroll hint for mobile */}
        <div className="md:hidden px-4 py-2 bg-muted/50 text-xs text-muted-foreground text-center border-b">
          ← Swipe to see more columns →
        </div>
        <div className="relative min-w-full">
          <Table>
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 z-10">
              <TableRow>
                <TableHead className="sticky left-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 min-w-[140px] md:min-w-[180px] text-xs md:text-sm border-r border-muted">
                  When
                </TableHead>
                <TableHead className="min-w-[120px] md:min-w-[140px] text-xs md:text-sm">Action</TableHead>
                <TableHead className="min-w-[100px] md:min-w-[120px] text-xs md:text-sm">Type</TableHead>
                <TableHead className="min-w-[120px] md:min-w-[150px] text-xs md:text-sm">Performed By</TableHead>
                <TableHead className="min-w-[100px] md:min-w-[120px] text-xs md:text-sm">Role</TableHead>
                <TableHead className="min-w-[200px] md:min-w-[300px] text-xs md:text-sm">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRows.map((e) => {
                const displayRole = getDisplayRole(e);
                return (
                  <TableRow key={e.id} className="hover:bg-muted/30">
                    <TableCell className="sticky left-0 z-10 bg-background border-r border-muted whitespace-nowrap text-xs md:text-sm font-medium min-w-[140px] md:min-w-[180px]">
                      {new Date(e.occurred_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </TableCell>
                    <TableCell className="text-xs md:text-sm py-2">
                      <Badge className={`text-xs ${actionColors[e.action] || 'bg-gray-100 text-gray-700'}`}>
                        {e.action === 'remit_inventory' ? 'Remit Inventory' : e.action.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="capitalize text-xs md:text-sm py-2">{(e.target_type || '').replace(/_/g, ' ') || '—'}</TableCell>
                    <TableCell className="text-xs md:text-sm py-2 whitespace-nowrap">{e.performed_by || 'System'}</TableCell>
                    <TableCell className="text-xs md:text-sm py-2">
                      <Badge className={`text-xs ${roleColors[displayRole] || roleColors[displayRole.toLowerCase()] || 'bg-gray-100 text-gray-700'}`}>
                        {displayRole}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] md:max-w-md text-xs md:text-sm py-2">
                      {e.details?.message ? (
                        <div className="text-xs md:text-sm line-clamp-2">{e.details.message}</div>
                      ) : e.details?.before && e.details?.after ? (
                        <div className="space-y-1">
                          <div className="font-semibold text-xs">Before → After</div>
                          {Object.keys(e.details.before).map(key => {
                            const beforeVal = e.details.before[key];
                            const afterVal = e.details.after[key];
                            if (beforeVal !== afterVal) {
                              return (
                                <div key={key} className="text-xs">
                                  <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
                                  <span className="text-red-600">{String(beforeVal)}</span>{' '}
                                  →{' '}
                                  <span className="text-green-600">{String(afterVal)}</span>
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      ) : e.details?.actor && e.details?.action_performed ? (
                        <div className="text-xs md:text-sm line-clamp-2">
                          {e.details.actor} {e.details.action_performed} {e.details.target_name || 'this record'}
                        </div>
                      ) : e.details ? (
                        <div className="text-xs text-muted-foreground truncate">
                          {JSON.stringify(e.details).substring(0, 80) + '...'}
                        </div>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="px-4 py-3 border-t">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage((p) => Math.max(1, p - 1));
                }}
                aria-disabled={page === 1}
                className={page === 1 ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>

            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNumber = idx + 1;
              // Show first, last, current, and neighbors; collapse others
              const isEdge = pageNumber === 1 || pageNumber === totalPages;
              const isNear = Math.abs(pageNumber - page) <= 1;
              if (isEdge || isNear) {
                return (
                  <PaginationItem key={pageNumber}>
                    <PaginationLink
                      href="#"
                      isActive={pageNumber === page}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage(pageNumber);
                      }}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                );
              }
              if (pageNumber === 2 && page > 3) {
                return (
                  <PaginationItem key="ellipsis-left">
                    <PaginationEllipsis />
                  </PaginationItem>
                );
              }
              if (pageNumber === totalPages - 1 && page < totalPages - 2) {
                return (
                  <PaginationItem key="ellipsis-right">
                    <PaginationEllipsis />
                  </PaginationItem>
                );
              }
              return null;
            })}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage((p) => Math.min(totalPages, p + 1));
                }}
                aria-disabled={page === totalPages}
                className={page === totalPages ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

