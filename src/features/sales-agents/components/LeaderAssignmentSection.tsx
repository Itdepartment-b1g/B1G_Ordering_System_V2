import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Crown, UserPlus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Database interface
interface MobileSalesAgent {
  id: string;
  name: string;
  region: string;
  sales: number;
}

export function LeaderAssignmentSection() {
  const [mobileSalesAgents, setMobileSalesAgents] = useState<MobileSalesAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [promoting, setPromoting] = useState(false);
  const { toast } = useToast();

  // Fetch mobile sales agents from database
  const fetchMobileSalesAgents = async () => {
    try {
      setLoading(true);
      
      // Fetch mobile sales agents
      const { data: agentsData, error: agentsError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'sales_agent')
        .eq('position', 'Mobile Sales')
        .order('created_at', { ascending: false });

      if (agentsError) throw agentsError;

      // Fetch sales data
      const { data: ordersData, error: ordersError } = await supabase
        .from('client_orders')
        .select('agent_id, total_amount, status')
        .eq('status', 'approved');

      if (ordersError) {
        console.error('Error fetching orders:', ordersError);
      }

      // Process agents with sales data
      const processedAgents: MobileSalesAgent[] = (agentsData || []).map((agent: any) => {
        const agentOrders = (ordersData || []).filter(
          (order: any) => order.agent_id === agent.id && order.status === 'approved'
        );
        
        const totalSales = agentOrders.reduce((sum: number, order: any) => sum + (Number(order.total_amount) || 0), 0);
        
        return {
          id: agent.id,
          name: agent.full_name || '',
          region: agent.region || '',
          sales: totalSales
        };
      });

      setMobileSalesAgents(processedAgents);
      
    } catch (error) {
      console.error('Error fetching mobile sales agents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load mobile sales agents',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMobileSalesAgents();
  }, []);

  const handlePromoteToLeader = async () => {
    if (!selectedAgent) {
      toast({
        title: 'Error',
        description: 'Please select an agent to promote',
        variant: 'destructive'
      });
      return;
    }

    setPromoting(true);
    
    try {
      // Update agent position to Leader in database
      const { error } = await supabase
        .from('profiles')
        .update({ position: 'Leader' })
        .eq('id', selectedAgent);

      if (error) throw error;

      const agent = mobileSalesAgents.find(a => a.id === selectedAgent);
      
      toast({
        title: 'Success',
        description: `${agent?.name} has been promoted to Leader position`
      });
      
      // Refresh data
      await fetchMobileSalesAgents();
      
      setPromoteDialogOpen(false);
      setConfirmDialogOpen(false);
      setSelectedAgent('');
      
    } catch (error) {
      console.error('Error promoting agent:', error);
      toast({
        title: 'Error',
        description: 'Failed to promote agent to leader',
        variant: 'destructive'
      });
    } finally {
      setPromoting(false);
    }
  };

  const handlePromoteClick = () => {
    if (!selectedAgent) {
      toast({
        title: 'Error',
        description: 'Please select an agent to promote',
        variant: 'destructive'
      });
      return;
    }
    setConfirmDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-blue-600" />
              Promote to Leader
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Promote mobile sales agents to team leader positions
            </p>
          </div>
          <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Promote Agent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Promote Agent to Leader</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Select Agent to Promote</Label>
                  <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an agent" />
                    </SelectTrigger>
                    <SelectContent>
                      {mobileSalesAgents.map(agent => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.name} ({agent.region}) - ₱{agent.sales.toLocaleString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <Button 
                  className="w-full" 
                  onClick={handlePromoteClick}
                  disabled={!selectedAgent || promoting}
                >
                  {promoting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Promoting...
                    </>
                  ) : (
                    <>
                      <Crown className="h-4 w-4 mr-2" />
                      Promote to Leader
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Select a mobile sales agent to promote to team leader position. Leaders can manage teams and approve stock requests.
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {mobileSalesAgents.map(agent => (
              <div key={agent.id} className="border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-sm">{agent.name}</h4>
                  <Badge variant="outline" className="text-green-600 text-xs">
                    Mobile Sales
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{agent.region}</p>
                <p className="text-xs text-muted-foreground">Sales: ₱{agent.sales.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
      
      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Promotion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to promote{' '}
              <strong>{mobileSalesAgents.find(a => a.id === selectedAgent)?.name}</strong>{' '}
              to Leader position?
              <br /><br />
              This will give them the ability to:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Manage a team of mobile sales agents</li>
                <li>Approve stock requests from their team</li>
                <li>View team performance analytics</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={promoting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handlePromoteToLeader}
              disabled={promoting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {promoting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Promoting...
                </>
              ) : (
                <>
                  <Crown className="h-4 w-4 mr-2" />
                  Promote to Leader
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}