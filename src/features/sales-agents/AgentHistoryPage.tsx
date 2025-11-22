import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth';
import { History, ShoppingCart, UserCog, ClipboardCheck, Boxes, Filter, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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

type GroupedAction = {
  groupId: string;
  occurred_at: string;
  performed_by: string;
  actor_role: string;
  actor_id: string;
  primary_action: string;
  primary_target_type: string;
  event_count: number;
  events: EventRow[];
  summary: string;
};

const TAB_FILTERS: Record<string, (e: EventRow) => boolean> = {
  all: () => true,
  orders: (e) => e.target_type === 'client_order' || e.target_type === 'client_order_item',
  clients: (e) => e.target_type === 'client',
  allocations: (e) => e.action === 'allocate_stock' || e.target_type === 'stock_allocation' || e.target_type === 'agent_inventory',
  tasks: (e) => e.target_type === 'task',
};

// Generate a readable summary for a group of events
function generateSummary(events: EventRow[]): string {
  if (events.length === 1) {
    const e = events[0];
    if (e.details?.message) {
      return e.details.message;
    }
    return `${e.action.replace(/_/g, ' ')} on ${e.target_type.replace(/_/g, ' ')}`;
  }

  // Group by action type
  const actionCounts = events.reduce((acc, e) => {
    acc[e.action] = (acc[e.action] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const actionSummaries = Object.entries(actionCounts).map(([action, count]) => {
    return `${count} ${action.replace(/_/g, ' ')}${count > 1 ? 's' : ''}`;
  });

  return actionSummaries.join(', ');
}

export default function AgentHistoryPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'all' | 'orders' | 'clients' | 'allocations' | 'tasks'>('all');
  const [actorPositions, setActorPositions] = useState<Record<string, string | null>>({});
  const [teamAgentIds, setTeamAgentIds] = useState<string[]>([]);
  const teamAgentIdsRef = useRef<string[]>([]);
  const [selectedActions, setSelectedActions] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupedAction | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  // Prevent realtime events from updating UI before initial load completes (avoids flicker)
  const initializedRef = useRef(false);
  // Only show the loading state when we truly have no data yet
  const isInitialLoading = loading && events.length === 0;

  // Check if user is a leader
  const isLeader = user?.role === 'sales_agent' && user?.position === 'Leader';

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        // For leaders: fetch their team agent IDs
        if (isLeader) {
          const { data: teamData, error: teamError } = await supabase
            .from('leader_teams')
            .select('agent_id')
            .eq('leader_id', user.id);

          if (teamError) {
            console.error('Error fetching team members:', teamError);
            setTeamAgentIds([]);
            setEvents([]);
            setActorPositions({});
            setLoading(false);
          } else {
            const agentIds = (teamData || []).map(t => t.agent_id);

            // Build filter: leader's own actions OR actions by team agents
            const allowedActorIds = [user.id, ...agentIds];
            let eventsQuery = supabase
              .from('events')
              .select('*');

            const orFilters: string[] = [];
            if (allowedActorIds.length > 0) {
              orFilters.push(`actor_id.in.(${allowedActorIds.join(',')})`);
            }
            orFilters.push(`details->>leader_id.eq.${user.id}`);
            if (agentIds.length > 0) {
              orFilters.push(`details->>agent_id.in.(${agentIds.join(',')})`);
            }

            if (orFilters.length > 0) {
              eventsQuery = eventsQuery.or(orFilters.join(','));
            }

            const { data, error } = await eventsQuery
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

            // Batch ALL state updates together to avoid flickering
            // This includes teamAgentIds, actorPositions, events, and loading
            setTeamAgentIds(agentIds);
            teamAgentIdsRef.current = agentIds;
            setActorPositions(positionsMap);
            const uniqueLeaderEvents = Array.from(
              new Map(((data || []) as any[]).map((event) => [event.id, event])).values()
            ) as EventRow[];

            setEvents(uniqueLeaderEvents);
            initializedRef.current = true;
            setLoading(false);
          }
        } else {
          // For sales agents: only show their own history (where they are the actor)
          const { data, error } = await supabase
            .from('events')
            .select('*')
            .or(`actor_id.eq.${user.id},details->>agent_id.eq.${user.id}`)
            .order('occurred_at', { ascending: false })
            .limit(200);

          if (error) throw error;

          // Fetch position for the user BEFORE setting events
          let positionsMap: Record<string, string | null> = {};
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('id, position, role')
            .eq('id', user.id)
            .single();

          if (!profileError && profileData) {
            positionsMap[user.id] = profileData.position || null;
          }

          // Set both events and positions together to avoid flickering
          // Batch all state updates together
          teamAgentIdsRef.current = [];
          setActorPositions(positionsMap);
          const uniqueAgentEvents = Array.from(
            new Map(((data || []) as any[]).map((event) => [event.id, event])).values()
          ) as EventRow[];
          setEvents(uniqueAgentEvents);
          initializedRef.current = true;
          setLoading(false);
        }
      } catch (e) {
        console.error('Load history error:', e);
        setEvents([]);
        setActorPositions({});
        setLoading(false);
      }
    };
    load();

    // Realtime: subscribe to new events; filter client-side for scope
    const channel = supabase
      .channel('events_agent_history')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events' },
        async (payload: any) => {
          // Ignore realtime events until initial load is complete to avoid UI flicker
          if (!initializedRef.current) return;
          const newEvent = payload.new as EventRow;
          const actorId = (newEvent as any)?.actor_id as string | null;
          const details = (newEvent as any)?.details || {};
          const targetLeaderId = details?.leader_id as string | undefined;
          const targetAgentId = details?.agent_id as string | undefined;

          const actorAllowed = isLeader
            ? (actorId === user?.id || teamAgentIdsRef.current.includes(actorId || ''))
            : actorId === user?.id;

          const recipientAllowed = isLeader
            ? (targetLeaderId === user?.id || (targetAgentId ? teamAgentIdsRef.current.includes(targetAgentId) : false))
            : targetAgentId === user?.id;

          if (!actorAllowed && !recipientAllowed) return;

          setEvents((prev) => {
            const limit = isLeader ? 500 : 200;
            const map = new Map<string, EventRow>();
            map.set((newEvent as any).id, newEvent as EventRow);
            for (const evt of prev) {
              if (!map.has(evt.id)) {
                map.set(evt.id, evt);
              }
            }
            return Array.from(map.values()).slice(0, limit);
          });

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
  }, [user?.id, isLeader]);

  const filtered = useMemo(() => {
    const f = TAB_FILTERS[tab];
    let rows = events.filter(f);

    // Filter out rows that only have JSON details without a proper message
    rows = rows.filter((e) => {
      // If there's a message, keep it
      if (e.details?.message) return true;
      // If there's before/after data, keep it (structured change display)
      if (e.details?.before && e.details?.after) return true;
      // If there's actor and action_performed, keep it (formatted message)
      if (e.details?.actor && e.details?.action_performed) return true;
      // Otherwise, it's likely just raw JSON - hide it
      return false;
    });

    if (selectedActions.length > 0) {
      rows = rows.filter((e) => selectedActions.includes(e.action));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((e) =>
        (e.target_label || '').toLowerCase().includes(q) ||
        (e.actor_label || '').toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.target_type.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [events, tab, search, selectedActions]);

  // Group events by time window and actor
  const groupedActions = useMemo((): GroupedAction[] => {
    if (filtered.length === 0) return [];

    const groups: GroupedAction[] = [];
    const TIME_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

    // Sort by time descending
    const sortedEvents = [...filtered].sort((a, b) =>
      new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    );

    for (const event of sortedEvents) {
      const eventTime = new Date(event.occurred_at).getTime();

      // Try to find an existing group within the time window and same actor
      const existingGroup = groups.find(g => {
        const groupTime = new Date(g.occurred_at).getTime();
        const timeDiff = Math.abs(groupTime - eventTime);
        return timeDiff <= TIME_WINDOW_MS && g.actor_id === event.actor_id;
      });

      if (existingGroup) {
        existingGroup.events.push(event);
        existingGroup.event_count++;
      } else {
        // Create a new group
        const summary = generateSummary([event]);
        groups.push({
          groupId: event.id,
          occurred_at: event.occurred_at,
          performed_by: event.performed_by,
          actor_role: event.actor_role,
          actor_id: event.actor_id,
          primary_action: event.action,
          primary_target_type: event.target_type,
          event_count: 1,
          events: [event],
          summary
        });
      }
    }

    // Update summaries for groups with multiple events
    groups.forEach(group => {
      if (group.events.length > 1) {
        group.summary = generateSummary(group.events);
      }
    });

    return groups;
  }, [filtered]);

  const availableActions = useMemo(() => {
    const set = new Set<string>();
    const inTab = events.filter(TAB_FILTERS[tab]);
    inTab.forEach((e) => { if (e.action) set.add(e.action); });
    return Array.from(set).sort();
  }, [events, tab]);

  const tabCounts = useMemo(() => {
    const base: Record<string, number> = {};
    (['all', 'orders', 'clients', 'allocations', 'tasks'] as const).forEach((k) => {
      const f = TAB_FILTERS[k];
      let rows = events.filter(f);

      // Filter out rows that only have JSON details without a proper message
      rows = rows.filter((e) => {
        if (e.details?.message) return true;
        if (e.details?.before && e.details?.after) return true;
        if (e.details?.actor && e.details?.action_performed) return true;
        return false;
      });

      base[k] = rows.length;
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

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">{isLeader ? 'Team History' : 'My History'}</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          {isLeader
            ? 'Activity across your team members and yourself'
            : 'Your recent activity across orders, clients, allocations, and tasks'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by action, label, or type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
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
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <div className="w-full">
              <TabsList className="w-full flex gap-1 rounded-md bg-muted p-1 overflow-x-auto">
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
                <TabsTrigger value="clients" className="data-[state=active]:bg-background">
                  <UserCog className="mr-2 h-4 w-4" />
                  Clients
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.clients}</span>
                </TabsTrigger>
                <TabsTrigger value="allocations" className="data-[state=active]:bg-background">
                  <Boxes className="mr-2 h-4 w-4" />
                  Allocations
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.allocations}</span>
                </TabsTrigger>
                <TabsTrigger value="tasks" className="data-[state=active]:bg-background">
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Tasks
                  <span className="ml-2 rounded-full bg-muted-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">{tabCounts.tasks}</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="all" className="mt-4">
              <HistoryTable
                groups={groupedActions}
                loading={isInitialLoading}
                roleColors={roleColors}
                actionColors={actionColors}
                actorPositions={actorPositions}
                onViewDetails={(group) => {
                  setSelectedGroup(group);
                  setShowDetailsModal(true);
                }}
              />
            </TabsContent>
            <TabsContent value="orders" className="mt-4">
              <HistoryTable
                groups={groupedActions}
                loading={isInitialLoading}
                roleColors={roleColors}
                actionColors={actionColors}
                actorPositions={actorPositions}
                onViewDetails={(group) => {
                  setSelectedGroup(group);
                  setShowDetailsModal(true);
                }}
              />
            </TabsContent>
            <TabsContent value="clients" className="mt-4">
              <HistoryTable
                groups={groupedActions}
                loading={isInitialLoading}
                roleColors={roleColors}
                actionColors={actionColors}
                actorPositions={actorPositions}
                onViewDetails={(group) => {
                  setSelectedGroup(group);
                  setShowDetailsModal(true);
                }}
              />
            </TabsContent>
            <TabsContent value="allocations" className="mt-4">
              <HistoryTable
                groups={groupedActions}
                loading={isInitialLoading}
                roleColors={roleColors}
                actionColors={actionColors}
                actorPositions={actorPositions}
                onViewDetails={(group) => {
                  setSelectedGroup(group);
                  setShowDetailsModal(true);
                }}
              />
            </TabsContent>
            <TabsContent value="tasks" className="mt-4">
              <HistoryTable
                groups={groupedActions}
                loading={isInitialLoading}
                roleColors={roleColors}
                actionColors={actionColors}
                actorPositions={actorPositions}
                onViewDetails={(group) => {
                  setSelectedGroup(group);
                  setShowDetailsModal(true);
                }}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Details Modal */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="w-[95vw] max-w-4xl h-[90vh] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-4 pt-6 pb-4 md:px-6 border-b">
            <DialogTitle className="text-lg md:text-xl">Action Details</DialogTitle>
            <DialogDescription className="text-sm">
              Complete breakdown of all actions in this session
            </DialogDescription>
          </DialogHeader>

          {selectedGroup && (
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-4">
              {/* Summary Card */}
              <Card className="bg-muted/30">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Performed By</p>
                      <p className="font-semibold">{selectedGroup.performed_by}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date & Time</p>
                      <p className="font-semibold">
                        {new Date(selectedGroup.occurred_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Actions</p>
                      <p className="font-semibold">{selectedGroup.event_count}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Summary</p>
                      <p className="font-semibold capitalize">{selectedGroup.summary}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detailed Events */}
              <div className="space-y-3">
                <h3 className="font-semibold text-base md:text-lg">Detailed Actions</h3>

                {/* Mobile View */}
                <div className="block md:hidden space-y-3">
                  {selectedGroup.events.map((event, idx) => {
                    const displayRole = getDisplayRole(event, actorPositions);
                    return (
                      <Card key={event.id}>
                        <CardContent className="pt-4 pb-4 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <Badge className={`text-xs ${actionColors[event.action] || 'bg-gray-100 text-gray-700'}`}>
                              {event.action.replace(/_/g, ' ')}
                            </Badge>
                            <span className="text-xs font-semibold text-muted-foreground">#{idx + 1}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Type</p>
                              <p className="capitalize text-sm font-medium">{event.target_type.replace(/_/g, ' ')}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">Role</p>
                              <Badge className={`text-xs ${roleColors[displayRole] || 'bg-gray-100 text-gray-700'}`}>
                                {displayRole}
                              </Badge>
                            </div>
                          </div>
                          <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground mb-2">Details</p>
                            <div className="text-sm">
                              {event.details?.message ? (
                                <p className="leading-relaxed">{event.details.message}</p>
                              ) : event.details?.before && event.details?.after ? (
                                <div className="space-y-1.5">
                                  {Object.keys(event.details.before).map(key => {
                                    const beforeVal = event.details.before[key];
                                    const afterVal = event.details.after[key];
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
                              ) : event.details?.actor && event.details?.action_performed ? (
                                <p className="text-sm leading-relaxed">
                                  {event.details.actor} {event.details.action_performed} {event.details.target_name || 'this record'}
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground">No additional details</p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Desktop View */}
                <div className="hidden md:block border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14 text-center">#</TableHead>
                        <TableHead className="w-[140px]">Action</TableHead>
                        <TableHead className="w-[140px]">Type</TableHead>
                        <TableHead className="w-[100px]">Role</TableHead>
                        <TableHead className="min-w-[250px]">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedGroup.events.map((event, idx) => {
                        const displayRole = getDisplayRole(event, actorPositions);
                        return (
                          <TableRow key={event.id}>
                            <TableCell className="font-medium text-center align-middle">{idx + 1}</TableCell>
                            <TableCell className="align-middle">
                              <Badge className={`text-xs ${actionColors[event.action] || 'bg-gray-100 text-gray-700'}`}>
                                {event.action.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell className="capitalize align-middle text-sm">{event.target_type.replace(/_/g, ' ')}</TableCell>
                            <TableCell className="align-middle">
                              <Badge className={`text-xs ${roleColors[displayRole] || 'bg-gray-100 text-gray-700'}`}>
                                {displayRole}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top py-3">
                              {event.details?.message ? (
                                <p className="text-sm leading-relaxed">{event.details.message}</p>
                              ) : event.details?.before && event.details?.after ? (
                                <div className="space-y-1">
                                  {Object.keys(event.details.before).map(key => {
                                    const beforeVal = event.details.before[key];
                                    const afterVal = event.details.after[key];
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
                              ) : event.details?.actor && event.details?.action_performed ? (
                                <p className="text-sm leading-relaxed">
                                  {event.details.actor} {event.details.action_performed} {event.details.target_name || 'this record'}
                                </p>
                              ) : (
                                <p className="text-xs text-muted-foreground">No additional details</p>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          <div className="px-4 py-3 md:px-6 md:py-4 border-t">
            <Button variant="outline" onClick={() => setShowDetailsModal(false)} className="w-full sm:w-auto">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper function to get display role based on role and position
function getDisplayRole(event: EventRow, actorPositions: Record<string, string | null>): string {
  if (event.actor_role === 'admin') {
    return 'admin';
  }
  if (event.actor_role === 'sales_agent') {
    const position = actorPositions[event.actor_id];
    if (position && (position.toLowerCase() === 'leader' || position.toLowerCase() === 'sales agent/leader')) {
      return 'leader';
    }
    return 'sales agent';
  }
  if (event.actor_role === 'leader') {
    return 'leader';
  }
  return event.actor_role || 'system';
}

function HistoryTable({
  groups,
  loading,
  roleColors,
  actionColors,
  actorPositions,
  onViewDetails
}: {
  groups: GroupedAction[];
  loading: boolean;
  roleColors: Record<string, string>;
  actionColors: Record<string, string>;
  actorPositions: Record<string, string | null>;
  onViewDetails: (group: GroupedAction) => void;
}) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [groups]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (groups.length === 0) {
    return (
      <div className="border rounded-lg p-10 text-center bg-card">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <History className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">No activity yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Activities you perform will appear here. Try switching tabs or adjusting your search.
        </p>
      </div>
    );
  }

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentGroups = groups.slice(startIndex, endIndex);

  return (
    <div className="border rounded-lg overflow-hidden shadow-sm bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="text-sm text-muted-foreground">
          Showing <span className="font-medium">{startIndex + 1}</span>–
          <span className="font-medium">{Math.min(endIndex, groups.length)}</span> of
          <span className="font-medium"> {groups.length}</span> action sessions
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="block md:hidden divide-y">
        {currentGroups.map((group) => {
          const displayRole = getDisplayRole(group.events[0], actorPositions);
          return (
            <Card key={group.groupId} className="rounded-none border-0 shadow-none">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{group.performed_by}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(group.occurred_at).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </p>
                  </div>
                  <Badge className={`text-xs shrink-0 ${roleColors[displayRole] || 'bg-gray-100 text-gray-700'}`}>
                    {displayRole}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-xs ${actionColors[group.primary_action] || 'bg-gray-100 text-gray-700'}`}>
                      {group.primary_action.replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {group.event_count} {group.event_count === 1 ? 'action' : 'actions'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground capitalize leading-relaxed">
                    {group.summary}
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onViewDetails(group)}
                  className="w-full mt-3"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Date & Time</TableHead>
              <TableHead className="w-[160px]">Performed By</TableHead>
              <TableHead className="w-[100px]">Role</TableHead>
              <TableHead className="w-[140px]">Primary Action</TableHead>
              <TableHead className="w-[80px] text-center">Count</TableHead>
              <TableHead className="min-w-[200px]">Summary</TableHead>
              <TableHead className="w-[120px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentGroups.map((group) => {
              const displayRole = getDisplayRole(group.events[0], actorPositions);
              return (
                <TableRow key={group.groupId} className="hover:bg-muted/30">
                  <TableCell className="font-medium whitespace-nowrap text-sm align-middle">
                    {new Date(group.occurred_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </TableCell>
                  <TableCell className="text-sm align-middle">{group.performed_by}</TableCell>
                  <TableCell className="align-middle">
                    <Badge className={`text-xs ${roleColors[displayRole] || 'bg-gray-100 text-gray-700'}`}>
                      {displayRole}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-middle">
                    <Badge className={`text-xs ${actionColors[group.primary_action] || 'bg-gray-100 text-gray-700'}`}>
                      {group.primary_action.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center align-middle">
                    <Badge variant="secondary" className="text-xs">
                      {group.event_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm align-middle">
                    <span className="line-clamp-2 capitalize">{group.summary}</span>
                  </TableCell>
                  <TableCell className="text-right align-middle">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewDetails(group)}
                      className="whitespace-nowrap"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
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


