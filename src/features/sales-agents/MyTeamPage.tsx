import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Search,
  Users,
  TrendingUp,
  Eye,
  RefreshCw,
  BarChart3,
  Loader2,
  Crown,
  Mail,
  Phone,
  MapPin
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';

export default function MyTeamPage() {
  const { user } = useAuth();
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showMemberDetails, setShowMemberDetails] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [sortBy, setSortBy] = useState<'name' | 'sales' | 'orders'>('name');

  const { toast } = useToast();

  // Check if user is a leader
  useEffect(() => {
    if (user && user.position !== 'Leader') {
      toast({
        title: 'Access Denied',
        description: 'Only leaders can access this page',
        variant: 'destructive'
      });
    }
  }, [user, toast]);

  // Fetch team members with fallback approach
  const fetchTeamMembers = async () => {
    if (!user) return;

    try {
      setLoadingTeam(true);

      // Try database function first, fallback to manual approach
      try {
        const { data: teamStats, error: statsError } = await supabase
          .rpc('get_team_member_stats', { p_leader_id: user.id });

        if (statsError) {
          console.log('Database function not available, using fallback:', statsError);
          throw new Error('Function not available');
        }

        console.log('Team stats received:', teamStats);

        // Get detailed profile information for team members
        const agentIds = teamStats?.map(stat => stat.agent_id) || [];

        if (agentIds.length === 0) {
          setTeamMembers([]);
          return;
        }

        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, region, city, status, position, created_at')
          .in('id', agentIds);

        if (profilesError) throw profilesError;

        // Combine stats with profile data
        const teamMembersWithStats = teamStats.map(stat => {
          const profile = profiles.find(p => p.id === stat.agent_id);
          if (!profile) return null;

          return {
            id: profile.id,
            name: profile.full_name,
            email: profile.email,
            phone: profile.phone || '',
            region: profile.region || '',
            cities: profile.city ? (Array.isArray(profile.city) ? profile.city : profile.city.split(',').map(c => c.trim()).filter(c => c)) : [],
            status: profile.status || 'active',
            position: profile.position || undefined,
            totalSales: Number(stat.total_sales) || 0,
            ordersCount: Number(stat.total_orders) || 0,
            approvedOrders: Number(stat.approved_orders) || 0,
            pendingOrders: Number(stat.pending_orders) || 0,
            rejectedOrders: Number(stat.rejected_orders) || 0,
            lastOrderDate: stat.last_order_date,
            joinedDate: profile.created_at
          };
        }).filter(member => member !== null);

        setTeamMembers(teamMembersWithStats);
        return;

      } catch (functionError) {
        console.log('Using fallback approach for team member data');

        // Fallback: Get team members manually
        const { data: teamData, error: teamError } = await supabase
          .from('leader_teams')
          .select(`
            agent_id,
            profiles!leader_teams_agent_id_fkey(
              id,
              full_name,
              email,
              phone,
              region,
              city,
              status,
              position,
              created_at
            )
          `)
          .eq('leader_id', user.id);

        if (teamError) throw teamError;

        console.log('Team data received (fallback):', teamData);

        // Get sales data for each team member manually
        const teamMembersWithSales = await Promise.all(
          teamData.map(async (member: any) => {
            if (!member.profiles) {
              console.warn('No profile data for member:', member.agent_id);
              return null;
            }

            // Get sales data for this agent
            const { data: salesData, error: salesError } = await supabase
              .from('client_orders')
              .select('total_amount, status, created_at')
              .eq('agent_id', member.agent_id);

            console.log(`Agent ID for ${member.profiles.full_name}:`, member.agent_id);
            console.log(`Sales data for ${member.profiles.full_name}:`, salesData);
            console.log(`Sales error for ${member.profiles.full_name}:`, salesError);

            const totalSales = salesData?.reduce((sum: number, order: any) => sum + (order.total_amount || 0), 0) || 0;
            const ordersCount = salesData?.length || 0;
            const approvedOrders = salesData?.filter(order => order.status === 'approved').length || 0;
            const pendingOrders = salesData?.filter(order => order.status === 'pending').length || 0;
            const rejectedOrders = salesData?.filter(order => order.status === 'rejected').length || 0;

            return {
              id: member.profiles.id,
              name: member.profiles.full_name,
              email: member.profiles.email,
              phone: member.profiles.phone || '',
              region: member.profiles.region || '',
              cities: member.profiles.city ? (Array.isArray(member.profiles.city) ? member.profiles.city : member.profiles.city.split(',').map(c => c.trim()).filter(c => c)) : [],
              status: member.profiles.status || 'active',
              position: member.profiles.position || undefined,
              totalSales,
              ordersCount,
              approvedOrders,
              pendingOrders,
              rejectedOrders,
              lastOrderDate: salesData?.[0]?.created_at,
              joinedDate: member.profiles.created_at
            };
          })
        );

        const validTeamMembers = teamMembersWithSales.filter(member => member !== null);
        setTeamMembers(validTeamMembers);
      }

    } catch (error) {
      console.error('Error fetching team members:', error);
      toast({
        title: 'Error',
        description: 'Failed to load team members',
        variant: 'destructive'
      });
    } finally {
      setLoadingTeam(false);
    }
  };

  useEffect(() => {
    if (user && user.position === 'Leader') {
      fetchTeamMembers();
    }
  }, [user]);

  const filteredTeamMembers = teamMembers.filter(member =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.cities.some(city => city.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const sortedTeamMembers = [...filteredTeamMembers].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'sales':
        return b.totalSales - a.totalSales;
      case 'orders':
        return b.ordersCount - a.ordersCount;
      default:
        return 0;
    }
  });

  // Calculate stats (now using data from database functions)
  const totalTeamMembers = teamMembers.length;
  const totalTeamSales = teamMembers.reduce((sum, member) => sum + member.totalSales, 0);
  const totalTeamOrders = teamMembers.reduce((sum, member) => sum + member.ordersCount, 0);
  const activeMembers = teamMembers.filter(member => member.status === 'active').length;

  if (!user || user.position !== 'Leader') {
    return (
      <div className="p-8 space-y-6">
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <Crown className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
              <p className="text-muted-foreground">
                Only leaders can access this page. Please contact your administrator if you believe this is an error.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Team</h1>
          <p className="text-muted-foreground">
            Manage and view your team members
          </p>
        </div>
        <Button onClick={fetchTeamMembers} disabled={loadingTeam}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loadingTeam ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <div>
                <div className="text-2xl font-bold">{totalTeamMembers}</div>
                <div className="text-xs text-muted-foreground">Total Members</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <div>
                <div className="text-2xl font-bold">₱{totalTeamSales.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">Total Sales</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-600" />
              <div>
                <div className="text-2xl font-bold">{totalTeamOrders}</div>
                <div className="text-xs text-muted-foreground">Total Orders</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-orange-600" />
              <div>
                <div className="text-2xl font-bold">{activeMembers}</div>
                <div className="text-xs text-muted-foreground">Active Members</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search team members by name, email, region, or city..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="flex gap-2">
              <Label className="text-sm font-medium text-muted-foreground self-center">Sort by:</Label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'sales' | 'orders')}
                className="flex h-11 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="name">Name</option>
                <option value="sales">Sales</option>
                <option value="orders">Orders</option>
              </select>
            </div>

            {/* View Toggle */}
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Table
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('cards')}
                className="gap-2"
              >
                <Users className="h-4 w-4" />
                Cards
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Members Display */}
      {loadingTeam ? (
        <Card>
          <CardContent className="p-12">
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading team members...</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : sortedTeamMembers.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No team members found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'Try adjusting your search criteria' : 'No team members have been assigned to you yet'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                    <TableHead className="text-right">Total Sales</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTeamMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            {member.email}
                          </div>
                          {member.phone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {member.phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="h-3 w-3" />
                            {member.region}
                          </div>
                          {member.cities.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {member.cities.slice(0, 2).map((city, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {city}
                                </Badge>
                              ))}
                              {member.cities.length > 2 && (
                                <Badge variant="outline" className="text-xs">
                                  +{member.cities.length - 2}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={member.status === 'active' ? 'default' : 'secondary'}
                          className={member.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}
                        >
                          {member.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ₱{member.totalSales.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="space-y-1">
                          <div className="font-semibold">{member.ordersCount}</div>
                          <div className="text-xs text-muted-foreground">
                            {member.approvedOrders} approved
                            {member.pendingOrders > 0 && `, ${member.pendingOrders} pending`}
                            {member.rejectedOrders > 0 && `, ${member.rejectedOrders} rejected`}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedMember(member);
                            setShowMemberDetails(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedTeamMembers.map((member) => (
            <Card key={member.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{member.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                  <Badge
                    variant={member.status === 'active' ? 'default' : 'secondary'}
                    className={member.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}
                  >
                    {member.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{member.region}</span>
                  </div>
                  {member.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{member.phone}</span>
                    </div>
                  )}
                  {member.cities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {member.cities.map((city, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {city}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      ₱{member.totalSales.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Sales</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {member.ordersCount}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Orders
                      {member.approvedOrders > 0 && (
                        <div className="text-green-600">{member.approvedOrders} approved</div>
                      )}
                      {member.pendingOrders > 0 && (
                        <div className="text-orange-600">{member.pendingOrders} pending</div>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setSelectedMember(member);
                    setShowMemberDetails(true);
                  }}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Team Member Details Dialog */}
      <Dialog open={showMemberDetails} onOpenChange={setShowMemberDetails}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedMember?.name}'s Details
            </DialogTitle>
          </DialogHeader>
          {selectedMember && (
            <div className="space-y-6">
              {/* Member Summary */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold">₱{selectedMember.totalSales.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Total Sales</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{selectedMember.ordersCount}</div>
                  <div className="text-sm text-muted-foreground">Total Orders</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{selectedMember.approvedOrders}</div>
                  <div className="text-sm text-muted-foreground">Approved Orders</div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Email</Label>
                    <p className="text-sm">{selectedMember.email}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Phone</Label>
                    <p className="text-sm">{selectedMember.phone || 'Not provided'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Region</Label>
                    <p className="text-sm">{selectedMember.region || 'Not provided'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <Badge
                      variant={selectedMember.status === 'active' ? 'default' : 'secondary'}
                      className={selectedMember.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}
                    >
                      {selectedMember.status}
                    </Badge>
                  </div>
                </div>

                {selectedMember.cities.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">Cities</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedMember.cities.map((city, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {city}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Performance Summary */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Performance Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-green-600">₱{selectedMember.totalSales.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Total Sales</div>
                  </div>
                  <div className="p-4 border rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{selectedMember.ordersCount}</div>
                    <div className="text-sm text-muted-foreground">Total Orders</div>
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{selectedMember.approvedOrders}</div>
                  <div className="text-sm text-muted-foreground">Approved Orders</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
