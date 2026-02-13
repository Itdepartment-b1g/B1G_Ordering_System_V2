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
  DialogTrigger,
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  User,
  Filter,
  Search,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Upload,
  Eye,
  ClipboardList,
  Check,
  MapPin,
  Camera,
  X
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet marker icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Function to update map center when position changes
function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  map.setView(center, map.getZoom());
  return null;
}

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
  client_id?: string;
  client_name?: string;
  client_company?: string;
  client_latitude?: number;
  client_longitude?: number;
}

interface AgentWithTasks {
  agent_id: string;
  agent_name: string;
  agent_email: string;
  tasks: Task[];
}

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function TasksPage() {
  const { user } = useAuth();

  const isMobileSales = user?.role === 'mobile_sales';
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  
  // Client selection states
  const [agentClients, setAgentClients] = useState<{id: string, name: string}[]>([]);
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [fetchingClients, setFetchingClients] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  // Record Visit states
  const [showRecordVisitDialog, setShowRecordVisitDialog] = useState(false);
  const [visitPhoto, setVisitPhoto] = useState<string | null>(null);
  const [visitForm, setVisitForm] = useState({
    notes: ''
  });
  const [visitLocation, setVisitLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    address: string;
    city?: string;
  } | null>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [visitedTask, setVisitedTask] = useState<Task | null>(null);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  /** When false: task is due today only (current behavior). When true: leader can pick any date. */
  const [plotForSpecificDate, setPlotForSpecificDate] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    agent_id: '',
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    due_date: (() => {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    })(),
    due_time: '09:00',
    notes: '',
    attachment: null as File | null
  });

  // Get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Check if user is a leader or mobile sales
  const isLeader = user?.role === 'team_leader' || user?.role === 'admin' || user?.role === 'manager';

  const canAccess = isLeader || isMobileSales;

  const toggleAgentExpansion = (agentId: string) => {
    setExpandedAgents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(agentId)) {
        newSet.delete(agentId);
      } else {
        newSet.add(agentId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    if (canAccess) {
      fetchTasks();
      if (isLeader) {
        fetchTeamMembers();
      }
    }
  }, [canAccess, isLeader]);

  const fetchTasks = async () => {
    try {
      setLoading(true);

      // Get today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // First try to fetch from task_details view
      let { data, error } = await supabase
        .from('task_details')
        .select('id, leader_id, leader_name, leader_email, agent_id, agent_name, agent_email, title, description, status, priority, created_at, given_at, completed_at, due_date, time, notes, attachment_url, urgency_status')
        .eq('leader_id', user?.id)
        .gte('due_date', today.toISOString())
        .lt('due_date', tomorrow.toISOString())
        .order('created_at', { ascending: false });

      // If task_details view doesn't exist, try fetching from tasks table directly
      if (error && error.code === '42P01') { // relation does not exist
        console.log('task_details view not found, trying tasks table...');
        let tasksQuery = supabase
          .from('tasks')
          .select(`
            id, leader_id, agent_id, client_id, title, description, status, priority, created_at, given_at, completed_at, due_date, time, notes, attachment_url,
            leader:profiles!tasks_leader_id_fkey(full_name, email),
            agent:profiles!tasks_agent_id_fkey(full_name, email),
            leader:profiles!tasks_leader_id_fkey(full_name, email),
            agent:profiles!tasks_agent_id_fkey(full_name, email),
            client:clients!tasks_client_id_fkey(name, company, location_latitude, location_longitude)
          `);

        if (isMobileSales) {
          tasksQuery = tasksQuery.eq('agent_id', user?.id || '');
        } else {
          tasksQuery = tasksQuery.eq('leader_id', user?.id || '');
        }

        const { data: tasksData, error: tasksError } = await tasksQuery
          .gte('due_date', today.toISOString())
          .lt('due_date', tomorrow.toISOString())
          .order('created_at', { ascending: false });
        
        if (tasksError) throw tasksError;

        // Transform the data to match the expected format
        data = tasksData?.map((task: any) => ({


          ...task,
          leader_name: (task.leader as any)?.full_name || 'Unknown Leader',
          leader_email: (task.leader as any)?.email || '',
          agent_name: (task.agent as any)?.full_name || 'Unknown Agent',
          agent_email: (task.agent as any)?.email || '',
          client_name: (task.client as any)?.name || '',
          client_company: (task.client as any)?.company || '',
          client_latitude: (task.client as any)?.location_latitude,
          client_longitude: (task.client as any)?.location_longitude,
          urgency_status: task.due_date && task.due_date < new Date().toISOString() && task.status !== 'completed'
            ? 'overdue'
            : task.due_date && new Date(task.due_date) <= new Date(Date.now() + 24 * 60 * 60 * 1000) && task.status !== 'completed'
              ? 'due_soon'
              : 'on_time'
        })) || [];
      } else if (error) {
        throw error;
      }

      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to load tasks. Please make sure the tasks table is created.',
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
            role
          )
        `)
        .eq('leader_id', user?.id);

      if (error) throw error;

      const members = data?.map(item => ({
        id: (item.profiles as any).id,
        full_name: (item.profiles as any).full_name,
        email: (item.profiles as any).email,
        role: (item.profiles as any).role
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

  const fetchAgentClients = async (agentId: string) => {
    if (!agentId) {
      setAgentClients([]);
      return;
    }
    
    setFetchingClients(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, company')
        .eq('agent_id', agentId)
        .order('company');
        
      if (error) throw error;
      
      setAgentClients(data?.map((c: any) => ({
        id: c.id,
        name: c.company || c.name || 'Unnamed Client'
      })) || []);
    } catch (error) {
      console.error('Error fetching agent clients:', error);
      toast({
        title: 'Error',
        description: 'Failed to load agent clients',
        variant: 'destructive'
      });
    } finally {
      setFetchingClients(false);
    }
  };

  const handleCreateTask = async () => {
    try {
      if (!user?.company_id) {
        toast({
          title: 'Error',
          description: 'User company information is missing',
          variant: 'destructive'
        });
        return;
      }

      if (selectedClientIds.length > 0) {
        // Create multiple tasks for selected clients
        const createPromises = selectedClientIds.map(clientId => {
          const client = agentClients.find(c => c.id === clientId);
          const clientName = client?.name || 'Unknown Client';
          
          return supabase
            .from('tasks')
            .insert({
              company_id: user.company_id,
              leader_id: user.id,
              agent_id: formData.agent_id,
              client_id: clientId,
              title: `${formData.title} - ${clientName}`,
              description: formData.description,
              priority: formData.priority,
              due_date: formData.due_date || null,
              time: '23:59', // Auto set to midnight as requested
              notes: formData.notes || null,
              status: 'pending' // Explicitly set status
            });
        });
        
        const results = await Promise.all(createPromises);
        const errors = results.filter(r => r.error);
        
        if (errors.length > 0) {
          console.error('Errors creating tasks:', errors);
          throw new Error(`Failed to create ${errors.length} tasks`);
        }
        
        toast({
          title: 'Success',
          description: `${selectedClientIds.length} tasks created successfully`
        });
      } else {
        // Single task without client selection
        const { error } = await supabase
          .from('tasks')
          .insert({
            company_id: user.company_id,
            leader_id: user.id,
            agent_id: formData.agent_id,
            title: formData.title,
            description: formData.description,
            priority: formData.priority,
            due_date: formData.due_date || null,
            time: formData.due_time || null,
            notes: formData.notes || null,
            status: 'pending'
          });

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Task created successfully'
        });
      }

      setCreateDialogOpen(false);
      resetForm();
      fetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      toast({
        title: 'Error',
        description: 'Failed to create task',
        variant: 'destructive'
      });
    }
  };


  const handleUpdateTask = async () => {
    if (!selectedTask) return;

    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          due_date: formData.due_date || null,
          time: formData.due_time || null,
          notes: formData.notes || null
        })
        .eq('id', selectedTask.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Task updated successfully'
      });

      setEditDialogOpen(false);
      setSelectedTask(null);
      resetForm();
      fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: 'Error',
        description: 'Failed to update task',
        variant: 'destructive'
      });
    }
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    const dueDate = task.due_date ? task.due_date.split('T')[0] : '';
    const dueTime = task.time || '09:00';

    setFormData({
      agent_id: task.agent_id,
      title: task.title,
      description: task.description,
      priority: task.priority,
      due_date: dueDate,
      due_time: dueTime,
      notes: task.notes || '',
      attachment: null
    });
    setEditDialogOpen(true);
  };

  const handleDeleteTask = (task: Task) => {
    setSelectedTask(task);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteTask = async () => {
    if (!selectedTask) return;

    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', selectedTask.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Task deleted successfully'
      });

      setDeleteConfirmOpen(false);
      setSelectedTask(null);
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete task',
        variant: 'destructive'
      });
    }
  };

  const resetForm = () => {
    setPlotForSpecificDate(false);
    setFormData({
      agent_id: '',
      title: '',
      description: '',
      priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
      due_date: getTodayDate(),
      due_time: '09:00',
      notes: '',
      attachment: null
    });
    setAgentClients([]);
    setSelectedClientIds([]);
  };

  // Helper functions for Record Visit
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const startCamera = async () => {
    setShowCamera(true);
    try {
      // Get Location first
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setVisitLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              address: 'Fetching address...'
            });
          },
          (error) => {
            console.error("Error getting location", error);
            toast({ title: 'Error', description: 'Could not get location.', variant: 'destructive' });
          },
          { enableHighAccuracy: true }
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera", err);
      toast({ title: 'Error', description: 'Could not access camera', variant: 'destructive' });
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const captureVisitPhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setVisitPhoto(dataUrl);
        stopCamera();
      }
    }
  };

  const removeVisitPhoto = () => {
    setVisitPhoto(null);
  };

  const handleRecordVisit = async () => {
    if (!visitPhoto || !visitLocation || !visitedTask || !visitedTask.client_id) {
      toast({ title: 'Error', description: 'Missing photo, location or client info', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      const base64Data = visitPhoto.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      const timestamp = Date.now();
      const fileName = `${user?.id}/visit_${visitedTask.client_id}_${timestamp}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('daily-attachments')
        .upload(fileName, blob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('daily-attachments')
        .getPublicUrl(fileName);

      // Insert Visit Log
      const distance = (visitedTask.client_latitude && visitedTask.client_longitude)
        ? calculateDistance(visitLocation.latitude, visitLocation.longitude, visitedTask.client_latitude, visitedTask.client_longitude)
        : 0;

      const { error: dbError } = await supabase
        .from('visit_logs')
        .insert({
          agent_id: user?.id,
          client_id: visitedTask.client_id,
          task_id: visitedTask.id, // Linked task
          visited_at: new Date().toISOString(),
          notes: visitForm.notes,
          photo_url: urlData.publicUrl,
          latitude: visitLocation.latitude,
          longitude: visitLocation.longitude,
          address: visitLocation.address,
          is_within_radius: distance <= 100,
          distance_meters: distance,
          radius_limit_meters: 100
        });

      if (dbError) throw dbError;

      // Auto-complete the task and save photo
      if (visitedTask) {
        const { error: taskError } = await supabase
          .from('tasks')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            attachment_url: urlData.publicUrl
          })
          .eq('id', visitedTask.id);

        if (taskError) {
          console.error("Error auto-completing task:", taskError);
          toast({ title: 'Warning', description: 'Visit recorded but failed to update task status.', variant: 'destructive' });
        } else {
          // Optimistic update or refetch
          setTasks(prev => prev.map(t => 
            t.id === visitedTask.id 
              ? { ...t, status: 'completed', completed_at: new Date().toISOString(), attachment_url: urlData.publicUrl }
              : t
          ));
        }
      }

      toast({ title: 'Success', description: 'Visit recorded and task completed successfully' });
      setShowRecordVisitDialog(false);
      setVisitPhoto(null);
      setVisitForm({ notes: '' });
      setVisitLocation(null);
      setVisitedTask(null);
      
      // Refresh tasks to ensure consistency
      fetchTasks();

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to record visit', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const openRecordVisitDialog = (task: Task) => {
    setVisitedTask(task);
    setShowRecordVisitDialog(true);
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setViewDialogOpen(true);
  };

  const groupTasksByAgent = (tasks: Task[]): AgentWithTasks[] => {
    const grouped = new Map<string, AgentWithTasks>();

    tasks.forEach(task => {
      if (!grouped.has(task.agent_id)) {
        grouped.set(task.agent_id, {
          agent_id: task.agent_id,
          agent_name: task.agent_name,
          agent_email: task.agent_email,
          tasks: []
        });
      }
      grouped.get(task.agent_id)!.tasks.push(task);
    });

    return Array.from(grouped.values());
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
      cancelled: Trash2
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
      task.agent_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  const agentsWithTasks = groupTasksByAgent(filteredTasks);



  if (!canAccess) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-600">Access Denied</h2>
            <p className="text-gray-500 mt-2">You do not have permission to view this page.</p>
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
          <h1 className="text-3xl font-bold">Task Management</h1>
          <p className="text-gray-600">
            {isMobileSales ? 'View your assigned tasks' : 'Manage tasks for your team members'}
          </p>
        </div>

        {isLeader && (
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Task
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
              <DialogDescription>
                Assign a new task to one of your team members
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-1">
              <div>
                <Label htmlFor="agent">Team Member</Label>
                <Select value={formData.agent_id} onValueChange={(value) => {
                  setFormData({ ...formData, agent_id: value });
                  setSelectedClientIds([]); // Reset selected clients
                  fetchAgentClients(value);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name} ({member.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Client Selection (Optional) */}
              {agentClients.length > 0 && (
                <div className="border rounded-md p-3 bg-slate-50">
                  <Label className="mb-2 block font-medium">Select Clients (Optional)</Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Selecting multiple clients will create separate tasks for each client.
                  </p>
                  
                  {/* Search Bar */}
                  <div className="relative mb-3">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search clients..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto space-y-2 p-1">
                    {agentClients
                      .filter(client => 
                        client.name.toLowerCase().includes(clientSearchQuery.toLowerCase())
                      )
                      .map(client => (
                      <div key={client.id} className="flex items-center space-x-2 bg-white p-2 rounded border border-gray-100 shadow-sm">
                        <Checkbox 
                          id={`client-${client.id}`} 
                          checked={selectedClientIds.includes(client.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedClientIds([...selectedClientIds, client.id]);
                            } else {
                              setSelectedClientIds(selectedClientIds.filter(id => id !== client.id));
                            }
                          }}
                        />
                        <Label 
                          htmlFor={`client-${client.id}`} 
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {client.name}
                        </Label>
                      </div>
                    ))}
                    {agentClients.filter(client => 
                      client.name.toLowerCase().includes(clientSearchQuery.toLowerCase())
                    ).length === 0 && (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        No clients found
                      </div>
                    )}
                  </div>
                  {selectedClientIds.length > 0 && (
                    <div className="mt-2 text-xs text-blue-600 font-medium flex items-center">
                      <Check className="h-3 w-3 mr-1" />
                      {selectedClientIds.length} tasks will be created due by midnight
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="title">Task Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter task title"
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter task description"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={formData.priority} onValueChange={(value: any) => setFormData({ ...formData, priority: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="mb-2 block">When should this task be due?</Label>
                  <Select
                    value={plotForSpecificDate ? 'specific' : 'today'}
                    onValueChange={(value) => {
                      const useSpecific = value === 'specific';
                      setPlotForSpecificDate(useSpecific);
                      if (!useSpecific) setFormData((prev) => ({ ...prev, due_date: getTodayDate() }));
                    }}
                  >
                    <SelectTrigger className="w-full sm:max-w-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="specific">Pick a date (plot for another day)</SelectItem>
                    </SelectContent>
                  </Select>
                  {plotForSpecificDate && (
                    <div className="mt-2">
                      <Label htmlFor="due_date">Due Date</Label>
                      <Input
                        id="due_date"
                        type="date"
                        min={getTodayDate()}
                        value={formData.due_date}
                        onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  )}
                  {!plotForSpecificDate && (
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Due: {formData.due_date} (today)
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor="due_time">Due Time</Label>
                  <Input
                    id="due_time"
                    type="time"
                    value={formData.due_time}
                    onChange={(e) => setFormData({ ...formData, due_time: e.target.value })}
                    className="max-w-full sm:max-w-xs"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes (optional)"
                  rows={2}
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:space-x-2 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setCreateDialogOpen(false);
                    setClientSearchQuery(''); // Reset search on close
                  }}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateTask} 
                  disabled={!formData.agent_id || !formData.title}
                  className="w-full sm:w-auto"
                >
                  Create Task
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex space-x-4">
            <div className="flex-1">
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

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
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

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tasks by Agent */}
      <Card>
        <CardHeader>
          <CardTitle>Today's Tasks ({filteredTasks.length})</CardTitle>
          <CardDescription>
            Tasks due today for your team members
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-4 text-sm text-gray-500">Loading tasks...</p>
            </div>
          ) : agentsWithTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-blue-100 rounded-full opacity-20 blur-xl"></div>
                <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-2xl border border-blue-100">
                  <ClipboardList className="h-16 w-16 text-blue-600" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                No tasks due today
              </h3>
              <p className="text-gray-500 mb-6 text-center max-w-md">
                {filteredTasks.length === 0 && tasks.length > 0
                  ? "No tasks match your current search or filters. Try adjusting your filters or search query."
                  : filteredTasks.length === 0
                    ? "You don't have any tasks scheduled for today. Create a task to get started!"
                    : "Great job! Your team has no tasks due today."}
              </p>
              {filteredTasks.length === 0 && (
                <Button
                  onClick={() => setCreateDialogOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-sm hover:shadow-md transition-all"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Create Your First Task
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {agentsWithTasks.map((agent) => (
                <div key={agent.agent_id} className="border rounded-lg overflow-hidden">
                  {/* Agent Header */}
                  <div
                    className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                    onClick={() => toggleAgentExpansion(agent.agent_id)}
                  >
                    <div className="flex items-center space-x-3">
                      {expandedAgents.has(agent.agent_id) ? (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-500" />
                      )}
                      <User className="h-6 w-6 text-gray-600" />
                      <div>
                        <div className="font-semibold text-lg">{agent.agent_name}</div>
                        <div className="text-sm text-gray-500">{agent.agent_email}</div>
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-4">
                      {agent.tasks.length} {agent.tasks.length === 1 ? 'task' : 'tasks'}
                    </Badge>
                  </div>

                  {/* Agent Tasks Subtable */}
                  {expandedAgents.has(agent.agent_id) && (
                    <div className="border-t bg-white">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-40">Task / Client</TableHead>
                            <TableHead className="w-28">Priority</TableHead>
                            <TableHead className="w-32">Status</TableHead>
                            <TableHead className="w-36">Due Time</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-32">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {agent.tasks.map((task) => (
                            <TableRow key={task.id} className="hover:bg-gray-50">
                              <TableCell className="font-medium">
                                <div>
                                  <div>{task.title}</div>
                                  {task.client_company && (
                                    <div className="text-xs text-muted-foreground">{task.client_company}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{getPriorityBadge(task.priority)}</TableCell>
                              <TableCell>{getStatusBadge(task.status)}</TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-1">
                                  <span className="text-sm">{task.time ? task.time.substring(0, 5) : '-'}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="max-w-xs truncate text-sm text-gray-600">
                                  {task.description || 'No description'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex space-x-1">
                                  {isMobileSales && task.client_id && (
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="bg-green-600 hover:bg-green-700 text-white"
                                      onClick={() => openRecordVisitDialog(task)}
                                      title="Record Visit"
                                    >
                                      <MapPin className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {task.attachment_url && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        window.open(task.attachment_url!, '_blank');
                                      }}
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
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEditTask(task)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeleteTask(task)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
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

              {/* Client Information */}
              {(selectedTask.client_name || selectedTask.client_company) && (
                <div className="border-t pt-4">
                  <Label className="text-sm font-semibold mb-3 block">Client Information</Label>
                  <div className="flex items-center space-x-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                    <User className="h-8 w-8 text-blue-600" />
                    <div>
                      <div className="font-medium">{selectedTask.client_name}</div>
                      {selectedTask.client_company && (
                        <div className="text-sm text-gray-500">{selectedTask.client_company}</div>
                      )}
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

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>
              Update task details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Task Title</Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter task title"
              />
            </div>

            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter task description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-priority">Priority</Label>
                <Select value={formData.priority} onValueChange={(value: any) => setFormData({ ...formData, priority: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="edit-due_date">Due Date</Label>
                <Input
                  id="edit-due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="edit-due_time">Due Time</Label>
                <Input
                  id="edit-due_time"
                  type="time"
                  value={formData.due_time}
                  onChange={(e) => setFormData({ ...formData, due_time: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes (optional)"
                rows={2}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateTask}>
                Update Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Record Visit Dialog */}
      <Dialog open={showRecordVisitDialog} onOpenChange={(open) => {
        setShowRecordVisitDialog(open);
        if (!open) {
          setVisitPhoto(null);
          setVisitLocation(null);
          setVisitForm({ notes: '' });
          stopCamera();
        }
      }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Client Visit</DialogTitle>
            <DialogDescription>
              Verify your visit for task: {visitedTask?.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 1. Client Info (Read only) */}
             <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
               <div className="font-medium text-blue-900">{visitedTask?.client_name || 'Client'}</div>
               {visitedTask?.client_company && (
                 <div className="text-sm text-blue-700">{visitedTask?.client_company}</div>
               )}
            </div>

            {/* 2. Camera & Location Section */}
            <div className="space-y-2">
              <Label>Verification Photo *</Label>

              {/* Camera Logic Reuse */}
              {!visitPhoto && !showCamera && (
                <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer" onClick={startCamera}>
                  <Camera className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="font-medium text-sm">Tap to Take Photo</p>
                  <p className="text-xs text-muted-foreground">Camera & Location required</p>
                </div>
              )}

              {/* Camera View */}
              {showCamera && (
                <div className="relative rounded-lg overflow-hidden bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-64 object-cover"
                  />
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 z-20">
                    <Button
                      variant="destructive"
                      onClick={stopCamera}
                      className="rounded-full w-12 h-12 p-0 flex items-center justify-center"
                    >
                      <X className="h-6 w-6" />
                    </Button>
                    <Button
                      onClick={() => captureVisitPhoto()}
                      className="rounded-full w-16 h-16 p-0 flex items-center justify-center bg-white hover:bg-gray-200 border-4 border-gray-300"
                    >
                      <div className="w-12 h-12 rounded-full bg-red-500"></div>
                    </Button>
                  </div>
                </div>
              )}

              {/* Photo Preview & Map */}
              {visitPhoto && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Map */}
                  <div className="h-64 rounded-lg overflow-hidden border relative z-0 shadow-sm">
                    {visitLocation && visitedTask?.client_latitude && visitedTask?.client_longitude ? (
                      <MapContainer
                        center={[visitLocation.latitude, visitLocation.longitude]}
                        zoom={18}
                        style={{ height: '100%', width: '100%' }}
                        dragging={true}
                      >
                        <ChangeView center={[visitLocation.latitude, visitLocation.longitude]} />
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Circle
                          center={[visitedTask.client_latitude, visitedTask.client_longitude]}
                          pathOptions={{ fillColor: '#22c55e', color: '#16a34a', weight: 1, opacity: 0.8, fillOpacity: 0.2 }}
                          radius={100}
                        />
                        <Marker position={[visitedTask.client_latitude, visitedTask.client_longitude]} />
                        <Marker position={[visitLocation.latitude, visitLocation.longitude]}>
                          <Popup>You are here</Popup>
                        </Marker>
                      </MapContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full bg-muted text-muted-foreground p-4 text-center">
                        <p>Map unavailable (missing locations)</p>
                      </div>
                    )}
                  </div>

                  {/* Photo */}
                  <div className="relative h-64 rounded-lg overflow-hidden border bg-black">
                    <img src={visitPhoto} className="w-full h-full object-contain" />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={removeVisitPhoto}
                    >
                      <X className="h-4 w-4" />
                    </Button>

                    {/* Distance Status */}
                    {visitLocation && visitedTask?.client_latitude && visitedTask?.client_longitude && (
                      <div className={`absolute bottom-0 left-0 right-0 p-2 text-center text-xs font-bold text-white 
                                  ${calculateDistance(visitLocation.latitude, visitLocation.longitude, visitedTask.client_latitude, visitedTask.client_longitude) <= 100 ? 'bg-green-600/90' : 'bg-red-600/90'}
                               `}>
                        Distance: {Math.round(calculateDistance(visitLocation.latitude, visitLocation.longitude, visitedTask.client_latitude, visitedTask.client_longitude))}m
                        {calculateDistance(visitLocation.latitude, visitLocation.longitude, visitedTask.client_latitude, visitedTask.client_longitude) > 100 ? ' (Too Far)' : ' (Verified)'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Visit Notes</Label>
              <Textarea
                placeholder="Details about the visit..."
                value={visitForm.notes}
                onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleRecordVisit}
              disabled={
                isUploading ||
                !visitPhoto ||
                !visitLocation ||
                (!!visitLocation &&
                  visitedTask?.client_latitude != null &&
                  visitedTask?.client_longitude != null &&
                  calculateDistance(
                    visitLocation.latitude,
                    visitLocation.longitude,
                    visitedTask.client_latitude,
                    visitedTask.client_longitude
                  ) > 100)
              }
            >
              {isUploading ? 'Recording...' : 'Submit Visit Log'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Delete Task
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-muted-foreground">
              Are you sure you want to delete this task? This action cannot be undone.
            </p>

            {selectedTask && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="font-medium text-sm text-gray-700 mb-1">Task Details:</h4>
                <p className="text-sm font-medium">{selectedTask.title}</p>
                <p className="text-xs text-gray-600 mt-1">Assigned to: {selectedTask.agent_name}</p>
                {selectedTask.description && (
                  <p className="text-xs text-gray-600 mt-1">{selectedTask.description}</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeleteTask}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Yes, Delete Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
