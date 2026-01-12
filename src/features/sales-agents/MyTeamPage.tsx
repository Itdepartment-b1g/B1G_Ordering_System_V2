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
  const [loadingTeam, setLoadingTeam] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showMemberDetails, setShowMemberDetails] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [sortBy, setSortBy] = useState<'name' | 'sales' | 'orders'>('name');

  const { toast } = useToast();

  // Check if user is a leader
  useEffect(() => {
    if (user && user.role !== 'team_leader') {
      toast({
        title: 'Access Denied',
        description: 'Only leaders can access this page',
        variant: 'destructive'
      });
    }
  }, [user, toast]);

  // Fetch team members - OPTIMIZED: Single query with joins (no N+1)
  const fetchTeamMembers = async () => {
    if (!user) return;

    try {
      setLoadingTeam(true);

      // ✅ OPTIMIZED: Single query with nested client_orders join via profiles
      // This replaces the N+1 pattern (1 query + N queries per member)
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
            created_at,
            agent_orders:client_orders!client_orders_agent_id_fkey(
              total_amount,
              status,
              created_at
            )
          )
        `)
        .eq('leader_id', user.id);

      if (teamError) throw teamError;

      if (!teamData || teamData.length === 0) {
        setTeamMembers([]);
        setLoadingTeam(false);
        return;
      }

      // Process aggregations in-memory (FAST - no additional queries)
      const teamMembersWithSales = teamData
        .map((member: any) => {
          if (!member.profiles) {
            console.warn('No profile data for member:', member.agent_id);
            return null;
          }

          // Order data is now nested inside profiles
          const salesData = member.profiles.agent_orders || [];

          const totalSales = salesData.reduce((sum: number, order: any) => sum + (order.total_amount || 0), 0);
          const ordersCount = salesData.length;
          const approvedOrders = salesData.filter((order: any) => order.status === 'approved').length;
          const pendingOrders = salesData.filter((order: any) => order.status === 'pending').length;
          const rejectedOrders = salesData.filter((order: any) => order.status === 'rejected').length;

          // Get the most recent order date
          const lastOrderDate = salesData.length > 0
            ? salesData
              .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
              ?.created_at
            : null;

          return {
            id: member.profiles.id,
            name: member.profiles.full_name,
            email: member.profiles.email,
            phone: member.profiles.phone || '',
            region: member.profiles.region || '',
            cities: member.profiles.city
              ? (Array.isArray(member.profiles.city)
                ? member.profiles.city
                : member.profiles.city.split(',').map((c: string) => c.trim()).filter((c: string) => c))
              : [],
            status: member.profiles.status || 'active',
            totalSales,
            ordersCount,
            approvedOrders,
            pendingOrders,
            rejectedOrders,
            lastOrderDate,
            joinedDate: member.profiles.created_at
          };
        })
        .filter((member): member is NonNullable<typeof member> => member !== null);

      setTeamMembers(teamMembersWithSales);

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
    if (user && user.role === 'team_leader') {
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

  if (!user || user.role !== 'team_leader') {
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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">My Team</h1>
        <p className="text-muted-foreground">
          Manage and view your team members' performance and details
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Members</p>
                <p className="text-3xl font-bold">{totalTeamMembers}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Sales</p>
                <p className="text-3xl font-bold">₱{totalTeamSales.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Total Orders</p>
                <p className="text-3xl font-bold">{totalTeamOrders}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Active Members</p>
                <p className="text-3xl font-bold">{activeMembers}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                <Crown className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls and Team Members */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Team Members</CardTitle>
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search team members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Sort and View Toggle */}
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'name' | 'sales' | 'orders')}
                  className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="name">Sort: Name</option>
                  <option value="sales">Sort: Sales</option>
                  <option value="orders">Sort: Orders</option>
                </select>
                <div className="flex border rounded-md">
                  <Button
                    variant={viewMode === 'table' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('table')}
                    className="rounded-r-none border-r"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'cards' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('cards')}
                    className="rounded-l-none"
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Team Members Display */}
          {loadingTeam ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-muted-foreground">Loading team members...</span>
              </div>
            </div>
          ) : sortedTeamMembers.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No team members found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'Try adjusting your search criteria' : 'No team members have been assigned to you yet'}
              </p>
            </div>
          ) : viewMode === 'table' ? (
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
        </CardContent>
      </Card>

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
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 border rounded-lg bg-green-50">
                    <div className="text-2xl font-bold text-green-600">₱{selectedMember.totalSales.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Total Sales</div>
                  </div>
                  <div className="p-4 border rounded-lg bg-blue-50">
                    <div className="text-2xl font-bold text-blue-600">{selectedMember.ordersCount}</div>
                    <div className="text-sm text-muted-foreground">Total Orders</div>
                  </div>
                  <div className="p-4 border rounded-lg bg-purple-50">
                    <div className="text-2xl font-bold text-purple-600">{selectedMember.approvedOrders}</div>
                    <div className="text-sm text-muted-foreground">Approved Orders</div>
                  </div>
                </div>
                {(selectedMember.pendingOrders > 0 || selectedMember.rejectedOrders > 0) && (
                  <div className="grid grid-cols-2 gap-4">
                    {selectedMember.pendingOrders > 0 && (
                      <div className="p-4 border rounded-lg bg-orange-50">
                        <div className="text-2xl font-bold text-orange-600">{selectedMember.pendingOrders}</div>
                        <div className="text-sm text-muted-foreground">Pending Orders</div>
                      </div>
                    )}
                    {selectedMember.rejectedOrders > 0 && (
                      <div className="p-4 border rounded-lg bg-red-50">
                        <div className="text-2xl font-bold text-red-600">{selectedMember.rejectedOrders}</div>
                        <div className="text-sm text-muted-foreground">Rejected Orders</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
