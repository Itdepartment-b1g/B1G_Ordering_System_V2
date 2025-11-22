import React, { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Clock,
  AlertCircle,
  Calendar,
  User,
  CheckCircle,
  Image as ImageIcon,
  Eye,
  Search,
  Filter
} from 'lucide-react';

interface Task {
  id: string;
  leader_id: string;
  leader_name: string;
  leader_email: string;
  agent_id: string;
  agent_name: string;
  agent_email: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  created_at: string;
  given_at: string;
  completed_at: string | null;
  due_date: string | null;
  time: string | null;
  notes: string | null;
  attachment_url?: string | null;
  urgency_status: 'overdue' | 'due_soon' | 'on_time';
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
}

export default function ArchiveTasksPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  
  // Dialog states
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Check if user is a leader
  const isLeader = user?.position === 'Leader';

  useEffect(() => {
    if (isLeader) {
      fetchTasks();
      fetchTeamMembers();
    }
  }, [isLeader]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('task_details')
        .select('*')
        .eq('leader_id', user?.id)
        .order('created_at', { ascending: false });

      // If task_details view doesn't exist, try fetching from tasks table directly
      const { data, error } = await query;

      if (error && error.code === '42P01') {
        console.log('task_details view not found, trying tasks table...');
        const tasksQuery = await supabase
          .from('tasks')
          .select(`
            *,
            leader:profiles!tasks_leader_id_fkey(full_name, email),
            agent:profiles!tasks_agent_id_fkey(full_name, email)
          `)
          .eq('leader_id', user?.id)
          .order('created_at', { ascending: false });

        if (tasksQuery.error) throw tasksQuery.error;
        
        const transformedData = tasksQuery.data?.map(task => ({
          ...task,
          leader_name: task.leader?.full_name || 'Unknown Leader',
          leader_email: task.leader?.email || '',
          agent_name: task.agent?.full_name || 'Unknown Agent',
          agent_email: task.agent?.email || '',
          urgency_status: task.due_date && task.due_date < new Date().toISOString() && task.status !== 'completed' 
            ? 'overdue' 
            : task.due_date && new Date(task.due_date) <= new Date(Date.now() + 24 * 60 * 60 * 1000) && task.status !== 'completed'
            ? 'due_soon'
            : 'on_time'
        })) || [];

        setTasks(transformedData);
      } else if (error) {
        throw error;
      } else {
        setTasks(data || []);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to load tasks',
        variant: 'destructive'
      });
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('leader_teams')
        .select(`
          agent_id,
          profiles!leader_teams_agent_id_fkey (
            id,
            full_name,
            email,
            position
          )
        `)
        .eq('leader_id', user?.id);

      if (error) throw error;

      const members = data?.map(item => ({
        id: (item.profiles as any).id,
        full_name: (item.profiles as any).full_name,
        email: (item.profiles as any).email,
        position: (item.profiles as any).position
      })) || [];

      setTeamMembers(members);
    } catch (error) {
      console.error('Error fetching team members:', error);
      toast({
        title: 'Error',
        description: 'Failed to load team members',
        variant: 'destructive'
      });
    }
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setViewDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      pending: 'secondary',
      in_progress: 'default',
      completed: 'default',
      cancelled: 'destructive'
    } as const;

    const icons = {
      pending: Clock,
      in_progress: AlertCircle,
      completed: CheckCircle,
      cancelled: AlertCircle
    };

    const Icon = icons[status as keyof typeof icons];

    return (
      <Badge variant={variants[status as keyof typeof variants]}>
        <Icon className="h-3 w-3 mr-1" />
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const variants = {
      low: 'secondary',
      medium: 'default',
      high: 'destructive',
      urgent: 'destructive'
    } as const;

    return (
      <Badge variant={variants[priority as keyof typeof variants]}>
        {priority}
      </Badge>
    );
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.agent_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         task.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    const matchesAgent = agentFilter === 'all' || task.agent_id === agentFilter;
    const matchesDate = !dateFilter || (task.due_date && task.due_date.startsWith(dateFilter));
    
    return matchesSearch && matchesStatus && matchesPriority && matchesAgent && matchesDate;
  });

  if (!isLeader) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-600">Access Denied</h2>
            <p className="text-gray-500 mt-2">Only leaders can access the archive tasks page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Task Archive</h1>
          <p className="text-gray-600">View all tasks assigned to your team</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {teamMembers.map(member => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              placeholder="Filter by date"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Tasks ({filteredTasks.length})</CardTitle>
          <CardDescription>
            Complete task history for your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Loading tasks...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 mb-4">
                <AlertCircle className="h-12 w-12 mx-auto mb-2" />
                <h3 className="text-lg font-medium">No tasks found</h3>
                <p className="text-sm">No tasks match your current filters.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTasks.map((task) => (
                  <TableRow key={task.id} className="hover:bg-gray-50">
                    <TableCell>
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {task.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <div>
                          <div className="font-medium text-sm">{task.agent_name}</div>
                          <div className="text-xs text-gray-500">{task.agent_email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getPriorityBadge(task.priority)}</TableCell>
                    <TableCell>{getStatusBadge(task.status)}</TableCell>
                    <TableCell>
                      {task.due_date ? (
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">
                            {new Date(task.due_date).toLocaleDateString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">No due date</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {new Date(task.created_at).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(task.created_at).toLocaleTimeString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-1">
                        {task.attachment_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(task.attachment_url!, '_blank')}
                          >
                            <ImageIcon className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewTask(task)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View Task Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Task Details</DialogTitle>
            <DialogDescription>
              View complete task information
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-6 py-4">
              {/* Task Title & Status */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold">{selectedTask.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">Assigned to: {selectedTask.agent_name}</p>
                </div>
                <div className="flex gap-2">
                  {getStatusBadge(selectedTask.status)}
                  {getPriorityBadge(selectedTask.priority)}
                </div>
              </div>

              {/* Description */}
              <div>
                <Label className="text-sm font-semibold">Description</Label>
                <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700">{selectedTask.description || 'No description provided'}</p>
                </div>
              </div>

              {/* Task Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-semibold">Due Date</Label>
                  <div className="mt-2 flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-sm">
                      {selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : 'Not set'}
                    </span>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold">Due Time</Label>
                  <div className="mt-2">
                    <span className="text-sm">{selectedTask.time || 'Not set'}</span>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold">Created</Label>
                  <div className="mt-2 text-sm text-gray-600">
                    {new Date(selectedTask.created_at).toLocaleString()}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold">Completed</Label>
                  <div className="mt-2 text-sm text-gray-600">
                    {selectedTask.completed_at 
                      ? new Date(selectedTask.completed_at).toLocaleString() 
                      : 'Not completed'}
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedTask.notes && (
                <div>
                  <Label className="text-sm font-semibold">Notes</Label>
                  <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-700">{selectedTask.notes}</p>
                  </div>
                </div>
              )}

              {/* Attachment */}
              {selectedTask.attachment_url && (
                <div>
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Attachment
                  </Label>
                  <div className="mt-2">
                    <div className="relative group">
                      <img
                        src={selectedTask.attachment_url}
                        alt="Task attachment"
                        className="w-full h-auto max-h-96 object-contain rounded-lg border border-gray-200 cursor-pointer hover:border-gray-400 transition-colors"
                        onClick={() => window.open(selectedTask.attachment_url!, '_blank')}
                      />
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => window.open(selectedTask.attachment_url!, '_blank')}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Full Size
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Agent Information */}
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold mb-3 block">Agent Information</Label>
                <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <User className="h-8 w-8 text-gray-600" />
                  <div>
                    <div className="font-medium">{selectedTask.agent_name}</div>
                    <div className="text-sm text-gray-500">{selectedTask.agent_email}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
