import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Users,
  Filter,
  Grid3X3,
  List,
  CalendarDays,
  Play,
  CheckCircle,
  AlertCircle,
  User,
  Search,
  BarChart3,
  Camera,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
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

import { VisitLog } from '@/types/database.types';

// Types
type VisitLogWithClient = VisitLog & {
  client: {
    name: string;
    location_latitude?: number;
    location_longitude?: number;
  } | null;
};

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
  urgency_status: 'overdue' | 'due_soon' | 'on_time';
  attachment_url?: string | null;
  client_id?: string; // Added for visit logs
  location_latitude?: number; // Added for visit logs
  location_longitude?: number; // Added for visit logs
  location_address?: string; // Added for visit logs
}

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  date: string;
  type: 'meeting' | 'appointment' | 'task' | 'reminder';
  priority: 'low' | 'medium' | 'high';
  location?: string;
  attendees?: string[];
  status: 'scheduled' | 'completed' | 'cancelled' | 'verified' | 'unverified';
  taskData?: Task; // For tasks from database
  visitData?: VisitLogWithClient; // For visit logs
  attachment_url?: string | null; // For task attachments
}

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
}



export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day' | 'board' | 'mobile'>('month');
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [clickedDay, setClickedDay] = useState<Date | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [showCompletionConfirm, setShowCompletionConfirm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [mobileTab, setMobileTab] = useState<'today' | 'all'>('today');
  const [currentTime, setCurrentTime] = useState(new Date());

  const [isMobile, setIsMobile] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [visits, setVisits] = useState<VisitLogWithClient[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);

  // Daily task creation states
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [dailyTaskForm, setDailyTaskForm] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    time: '',
    notes: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent'
  });

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
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [capturingPhoto, setCapturingPhoto] = useState(false);

  // Client selection states
  const [clients, setClients] = useState<Array<{
    id: string;
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    city?: string;
    address?: string;
    location_latitude?: number;
    location_longitude?: number;
  }>>([]);
  const [selectedClient, setSelectedClient] = useState<{
    id: string;
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    city?: string;
    address?: string;
    location_latitude?: number;
    location_longitude?: number;
  } | null>(null);
  const [clientPopoverOpen, setClientPopoverOpen] = useState(false);





  const { toast } = useToast();
  const { user } = useAuth();

  // Convert tasks from database to calendar events
  const allEvents = useMemo(() => {
    const taskEvents: CalendarEvent[] = tasks.map(task => {
      // Use the separate time field if available, otherwise default to 09:00
      let startTime = '09:00';
      let endTime = '10:00';

      if (task.time) {
        // Extract hours and minutes from time field (format: HH:MM:SS)
        const timeParts = task.time.split(':');
        const hours = timeParts[0].padStart(2, '0');
        const minutes = timeParts[1].padStart(2, '0');
        startTime = `${hours}:${minutes}`;

        // Set end time to 1 hour after start time
        const startHour = parseInt(hours);
        const startMinute = parseInt(minutes);
        const endHour = (startHour + 1) % 24;
        const endHourStr = endHour.toString().padStart(2, '0');
        endTime = `${endHourStr}:${minutes}`;
      }

      return {
        id: `task-${task.id}`,
        title: task.title,
        description: task.description,
        startTime,
        endTime,
        date: task.due_date ? task.due_date.split('T')[0] : task.given_at.split('T')[0],
        type: 'task' as const,
        priority: task.priority === 'urgent' ? 'high' : task.priority === 'high' ? 'high' : task.priority === 'medium' ? 'medium' : 'low',
        status: task.status === 'completed' ? 'completed' : task.status === 'cancelled' ? 'cancelled' : 'scheduled',
        taskData: task,
        attachment_url: task.attachment_url || null
      };
    });

    const visitEvents: CalendarEvent[] = visits.map(visit => {
      const visitDate = new Date(visit.visited_at);
      const hours = visitDate.getHours().toString().padStart(2, '0');
      const minutes = visitDate.getMinutes().toString().padStart(2, '0');
      const startTime = `${hours}:${minutes}`;

      const endDate = new Date(visitDate.getTime() + 30 * 60000); // +30 mins
      const endHours = endDate.getHours().toString().padStart(2, '0');
      const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
      const endTime = `${endHours}:${endMinutes}`;

      return {
        id: `visit-${visit.id}`,
        title: `Visited ${visit.client?.name || 'Client'}`,
        description: visit.notes || 'No notes',
        startTime,
        endTime,
        date: visit.visited_at.split('T')[0],
        type: 'meeting' as const,
        priority: 'medium',
        status: visit.is_within_radius ? 'verified' : 'unverified',
        visitData: visit,
        location: visit.address,
        attachment_url: visit.photo_url
      };
    });

    return [...taskEvents, ...visitEvents];
  }, [tasks, visits]);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Detect mobile viewport and default to week view on mobile
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 640px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const mobile = 'matches' in e ? e.matches : (e as MediaQueryList).matches;
      setIsMobile(mobile);
      if (mobile) setViewMode('week');
    };

    // Initialize
    handleChange(mediaQuery);
    // Listen to changes
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange as (e: MediaQueryListEvent) => void);
      return () => mediaQuery.removeEventListener('change', handleChange as (e: MediaQueryListEvent) => void);
    } else {
      // Safari fallback
      mediaQuery.addListener(handleChange as unknown as (this: MediaQueryList, ev: MediaQueryListEvent) => void);
      return () => mediaQuery.removeListener(handleChange as unknown as (this: MediaQueryList, ev: MediaQueryListEvent) => void);
    }
  }, []);

  // Fetch tasks for the current user
  useEffect(() => {
    if (user?.id) {
      fetchTasks();
      fetchVisits();
    }

    // Cleanup subscriptions on unmount
    return () => {
      if (realtimeEnabled) {
        supabase.removeAllChannels();
      }
    };
  }, [user?.id]);

  // Setup real-time subscriptions for tasks
  const setupRealtimeSubscriptions = () => {
    if (!user?.id) return;

    // Subscribe to task changes
    const tasksSubscription = supabase
      .channel('tasks_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `agent_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Real-time task update:', payload);

          // Handle different event types
          switch (payload.eventType) {
            case 'INSERT':
              // New task added
              toast({
                title: 'New Task',
                description: 'You have a new task assigned',
                duration: 3000
              });
              fetchTasks(); // Refresh tasks
              break;

            case 'UPDATE': {
              // Task updated
              const updatedTask = payload.new as Task;
              if (updatedTask.status === 'completed') {
                toast({
                  title: 'Task Completed',
                  description: 'Great job! Task marked as completed',
                  duration: 2000
                });
              } else if (updatedTask.status === 'in_progress') {
                toast({
                  title: 'Task Started',
                  description: 'Task is now in progress',
                  duration: 2000
                });
              }
              fetchTasks(); // Refresh tasks
              break;
            }

            case 'DELETE':
              // Task deleted
              toast({
                title: 'Task Removed',
                description: 'A task has been removed',
                duration: 2000
              });
              fetchTasks(); // Refresh tasks
              break;
          }
        }
      )
      .subscribe();

    // Subscribe to task_details view changes (if it exists)
    const taskDetailsSubscription = supabase
      .channel('task_details_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_details',
          filter: `agent_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Real-time task_details update:', payload);
          fetchTasks(); // Refresh tasks
        }
      )
      .subscribe();

    // Return cleanup function
    return () => {
      tasksSubscription.unsubscribe();
      taskDetailsSubscription.unsubscribe();
    };
  };
  const fetchTasks = async () => {
    try {
      // Only show loading on initial load, not on real-time updates
      if (!realtimeEnabled) {
        setLoadingTasks(true);
      }

      const { data, error } = await supabase
        .from('task_details')
        .select('id, leader_id, leader_name, leader_email, agent_id, agent_name, agent_email, title, description, status, priority, created_at, given_at, completed_at, due_date, time, notes, urgency_status, attachment_url')
        .eq('agent_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data || []);

      // Enable real-time subscriptions after initial load
      if (!realtimeEnabled) {
        setupRealtimeSubscriptions();
        setRealtimeEnabled(true);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to load tasks',
        variant: 'destructive'
      });
    } finally {
      setLoadingTasks(false);
    }
  };

  const fetchVisits = async () => {
    try {
      const { data, error } = await supabase
        .from('visit_logs')
        .select(`
          *,
          client:clients (
            name,
            location_latitude,
            location_longitude
          )
        `)
        .eq('agent_id', user?.id)
        .order('visited_at', { ascending: false });

      if (error) throw error;
      setVisits(data || []);
    } catch (error) {
      console.error('Error fetching visits:', error);
    }
  };

  const handleStartTask = async (taskId: string) => {
    try {
      // Optimistic update - update UI immediately
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId
            ? { ...task, status: 'in_progress', updated_at: new Date().toISOString() }
            : task
        )
      );

      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', taskId);

      if (error) {
        // Revert optimistic update on error
        setTasks(prevTasks =>
          prevTasks.map(task =>
            task.id === taskId
              ? { ...task, status: 'pending' }
              : task
          )
        );
        throw error;
      }

      toast({
        title: 'Success',
        description: 'Task started successfully'
      });
    } catch (error) {
      console.error('Error starting task:', error);
      toast({
        title: 'Error',
        description: 'Failed to start task',
        variant: 'destructive'
      });
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    try {
      const completionTime = new Date().toISOString();

      // Optimistic update - update UI immediately
      setTasks(prevTasks =>
        prevTasks.map(task =>
          task.id === taskId
            ? {
              ...task,
              status: 'completed',
              completed_at: completionTime,
              updated_at: completionTime
            }
            : task
        )
      );

      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: completionTime,
          updated_at: completionTime
        })
        .eq('id', taskId);

      if (error) {
        // Revert optimistic update on error
        setTasks(prevTasks =>
          prevTasks.map(task =>
            task.id === taskId
              ? { ...task, status: 'in_progress', completed_at: null }
              : task
          )
        );
        throw error;
      }

      toast({
        title: 'Success',
        description: 'Task completed successfully'
      });

      setShowCompletionConfirm(false);
      setShowEventDetails(false);
    } catch (error) {
      console.error('Error completing task:', error);
      toast({
        title: 'Error',
        description: 'Failed to complete task',
        variant: 'destructive'
      });
    }
  };

  const handleCompleteTaskWithConfirmation = () => {
    setShowCompletionConfirm(true);
  };

  // Handle daily task creation (Simply create a task)
  const handleCreateDailyTask = async () => {
    if (!dailyTaskForm.title.trim()) {
      toast({ title: 'Error', description: 'Task title is required', variant: 'destructive' });
      return;
    }

    if (!user?.id) {
      toast({ title: 'Error', description: 'User not authenticated', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      // Create task in database
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          agent_id: user.id,
          leader_id: null, // NULL for agent-created tasks
          client_id: selectedClient?.id || null, // Optional client link
          title: dailyTaskForm.title,
          description: dailyTaskForm.description || null,
          due_date: dailyTaskForm.date || null,
          time: dailyTaskForm.time || null,
          notes: dailyTaskForm.notes || null,
          priority: dailyTaskForm.priority,
          status: 'pending'
        })
        .select()
        .single();

      if (taskError) throw taskError;

      toast({
        title: 'Success',
        description: 'Task created successfully'
      });

      // Reset form and close dialog
      setDailyTaskForm({
        title: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        time: '',
        notes: '',
        priority: 'medium'
      });
      setSelectedClient(null);
      setClientPopoverOpen(false);
      setShowAddTaskDialog(false);

      // Refresh tasks (real-time will also handle this)
      await fetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
      toast({
        title: 'Error',
        description: 'Failed to create task. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Record Visit
  const handleRecordVisit = async () => {
    if (!visitPhoto) {
      toast({ title: 'Error', description: 'Photo is required for visit verification.', variant: 'destructive' });
      return;
    }

    if (!selectedClient) {
      toast({ title: 'Error', description: 'Client user is required.', variant: 'destructive' });
      return;
    }

    if (!visitLocation) {
      toast({ title: 'Error', description: 'Location is required for visit verification.', variant: 'destructive' });
      return;
    }

    if (!user?.id) {
      toast({ title: 'Error', description: 'User not authenticated', variant: 'destructive' });
      return;
    }

    // Radius Check
    if (selectedClient.location_latitude && selectedClient.location_longitude) {
      const distance = calculateDistance(
        visitLocation.latitude,
        visitLocation.longitude,
        selectedClient.location_latitude,
        selectedClient.location_longitude
      );

      if (distance > 100) {
        toast({
          title: 'Outside Perimeter',
          description: `You are ${Math.round(distance)}m away from the client. Must be within 100m.`,
          variant: 'destructive'
        });
        return;
      }
    } else {
      toast({ title: 'Warning', description: 'Client has no location set. Visit recorded but unverified.', variant: 'default' });
    }

    setIsUploading(true);
    try {
      let photoUrl = null;

      // Upload Photo
      if (visitPhoto) {
        const base64Data = visitPhoto.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        const sanitizeName = selectedClient.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const timestamp = Date.now();
        const fileName = `${user.id}/visit_${sanitizeName}_${timestamp}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('daily-attachments') // Reuse bucket or create new 'visit-photos'
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
            upsert: false
          });

        if (uploadError) throw new Error(`Failed to upload photo: ${uploadError.message}`);

        const { data: urlData } = supabase.storage
          .from('daily-attachments')
          .getPublicUrl(fileName);

        photoUrl = urlData.publicUrl;
      }

      // Calculate distance for log
      let distance = 0;
      let isWithin = false;
      if (selectedClient.location_latitude && selectedClient.location_longitude) {
        distance = calculateDistance(
          visitLocation.latitude,
          visitLocation.longitude,
          selectedClient.location_latitude,
          selectedClient.location_longitude
        );
        isWithin = distance <= 100;
      }

      // Create Visit Log
      const { error: visitError } = await supabase
        .from('visit_logs')
        .insert({
          company_id: user.company_id || '', // Ensure company_id is available
          agent_id: user.id,
          client_id: selectedClient.id,
          task_id: null, // Standalone visit
          latitude: visitLocation.latitude,
          longitude: visitLocation.longitude,
          address: visitLocation.address,
          is_within_radius: isWithin,
          distance_meters: distance,
          radius_limit_meters: 100,
          photo_url: photoUrl,
          notes: visitForm.notes
        });

      if (visitError) throw visitError;

      toast({
        title: 'Visit Recorded',
        description: 'Visit logged successfully.'
      });

      // Reset
      setVisitPhoto(null);
      setVisitLocation(null);
      setVisitForm({ notes: '' });
      setSelectedClient(null);
      setShowRecordVisitDialog(false);

    } catch (error) {
      console.error('Error recording visit:', error);
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to record visit.',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const removeVisitPhoto = () => {
    setVisitPhoto(null);
    setVisitLocation(null);
  };

  // Start camera
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode },
        audio: false
      });
      setStream(mediaStream);
      setShowCamera(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: 'Error',
        description: 'Failed to access camera. Please check permissions.',
        variant: 'destructive'
      });
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  // Fetch clients for the current agent
  const fetchClients = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, company, email, phone, city, address, location_latitude, location_longitude')
        .eq('agent_id', user.id)
        .eq('status', 'active')
        .eq('approval_status', 'approved')
        .order('name', { ascending: true });

      if (error) throw error;

      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      // Don't show error toast as this is not critical for initial load
    }
  };

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  };





  // Switch camera (front/back)
  const switchCamera = async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);

    // Stop current stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    // Start new stream
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: false
      });
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error switching camera:', error);
      toast({
        title: 'Error',
        description: 'Failed to switch camera.',
        variant: 'destructive'
      });
    }
  };



  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Handle day click
  const handleDayClick = (day: Date) => {
    setClickedDay(day);
    setSelectedDate(day);
    if (!isMobile) {
      // On larger screens, open quick add dialog
      setShowAddEvent(true);
    }
  };

  // Handle event click
  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowEventDetails(true);
  };

  // Calendar navigation
  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    const days = direction === 'prev' ? -7 : 7;
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  const navigateDay = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    const days = direction === 'prev' ? -1 : 1;
    newDate.setDate(newDate.getDate() + days);
    setCurrentDate(newDate);
  };

  // Enhanced filtering logic
  const getFilteredEvents = (events: CalendarEvent[]) => {
    return events.filter(event => {
      // Status filter
      const statusMatch = filterType === 'all' ||
        (event.taskData && event.taskData.status === filterType);

      // Search filter
      const searchMatch = !searchQuery ||
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (event.taskData && (
          event.taskData.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          event.taskData.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          event.taskData.agent_name?.toLowerCase().includes(searchQuery.toLowerCase())
        ));

      // Priority filter
      const priorityMatch = priorityFilter === 'all' ||
        (event.taskData && event.taskData.priority === priorityFilter);

      // Mobile tab filter
      let mobileMatch = true;
      if (isMobile && mobileTab !== 'all') {
        const eventDate = new Date(event.date);
        const today = new Date();
        switch (mobileTab) {
          case 'today':
            mobileMatch = eventDate.toDateString() === today.toDateString();
            break;
        }
      }

      return statusMatch && searchMatch && priorityMatch && mobileMatch;
    });
  };

  // Generate calendar days
  const generateCalendarDays = (): CalendarDay[] => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days: CalendarDay[] = [];
    const today = new Date();

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);

      const dayEvents = getFilteredEvents(allEvents).filter(event => {
        const eventDate = new Date(event.date);
        return eventDate.toDateString() === date.toDateString();
      });

      days.push({
        date,
        isCurrentMonth: date.getMonth() === month,
        isToday: date.toDateString() === today.toDateString(),
        events: dayEvents
      });
    }

    return days;
  };

  // Get week days for week view
  const getWeekDays = (): CalendarDay[] => {
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day;
    startOfWeek.setDate(diff);

    const weekDays: CalendarDay[] = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);

      const dayEvents = getFilteredEvents(allEvents).filter(event => {
        const eventDate = new Date(event.date);
        return eventDate.toDateString() === date.toDateString();
      });

      weekDays.push({
        date,
        isCurrentMonth: true,
        isToday: date.toDateString() === today.toDateString(),
        events: dayEvents
      });
    }

    return weekDays;
  };

  // Get day events
  const getDayEvents = (): CalendarEvent[] => {
    const targetDate = (isMobile && selectedDate) ? selectedDate : currentDate;
    return getFilteredEvents(allEvents).filter(event => {
      const eventDate = new Date(event.date);
      return eventDate.toDateString() === targetDate.toDateString();
    }).sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  // Event type colors
  const getEventTypeColor = (type: CalendarEvent['type']) => {
    const colors = {
      meeting: 'bg-blue-100 text-blue-800 border-blue-200',
      appointment: 'bg-green-100 text-green-800 border-green-200',
      task: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      reminder: 'bg-purple-100 text-purple-800 border-purple-200'
    };
    return colors[type];
  };

  // Priority colors
  const getPriorityColor = (priority: CalendarEvent['priority']) => {
    const colors = {
      low: 'bg-gray-100 text-gray-600',
      medium: 'bg-yellow-100 text-yellow-600',
      high: 'bg-red-100 text-red-600'
    };
    return colors[priority];
  };

  // Get current time position for day view
  const getCurrentTimePosition = () => {
    const now = currentTime;
    const hours = now.getHours();
    const minutes = now.getMinutes();
    return hours + (minutes / 60);
  };

  // Check if current time is on the selected day
  const isCurrentDay = () => {
    if (!currentDate) return false;
    const today = new Date();
    return currentDate.toDateString() === today.toDateString();
  };

  const calendarDays = generateCalendarDays();
  const weekDays = getWeekDays();
  const dayEvents = getDayEvents();

  const captureVisitPhoto = async () => {
    if (!videoRef.current) return;

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setVisitPhoto(dataUrl);
        stopCamera();

        // Start location capture
        toast({
          title: 'Acquiring Location...',
          description: 'Please wait, getting high-accuracy GPS...',
          duration: 3000
        });

        // 1. Define getPos helper
        const getPos = (opts: PositionOptions): Promise<GeolocationPosition> => {
          return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, opts);
          });
        };

        // 2. Try High Accuracy
        let position: GeolocationPosition | null = null;
        try {
          position = await getPos({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        } catch (e) {
          console.warn('High accuracy failed, trying low accuracy...');
          try {
            position = await getPos({ enableHighAccuracy: false, timeout: 15000, maximumAge: 20000 });
          } catch (e2) {
            console.error('All location attempts failed');
            throw new Error('Could not acquire location. Please check your GPS settings.');
          }
        }

        if (!position) throw new Error('Location capture failed.');

        // 3. Process Location
        const { latitude, longitude, accuracy } = position.coords;

        // Reverse Geocode
        let address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await r.json();
          if (data && data.display_name) address = data.display_name;
        } catch (e) { console.error('Reverse geocode failed', e); }

        setVisitLocation({
          latitude, longitude, accuracy, address
        });

        toast({
          title: 'Location Captured',
          description: `Accuracy: ±${Math.round(accuracy)}m`,
          className: "bg-green-50 border-green-200 text-green-800"
        });
      }
    } catch (error) {
      console.error('Capture error:', error);
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to capture photo/location.',
        variant: 'destructive'
      });
      setVisitPhoto(null);
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-3 sm:space-y-4 md:space-y-6 overflow-x-hidden max-w-full">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4">

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Calendar & Visits</h1>
            <p className="text-muted-foreground">Manage your schedule and record client visits.</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {/* Record Visit Button */}
            <Dialog open={showRecordVisitDialog} onOpenChange={(open) => {
              setShowRecordVisitDialog(open);
              if (open) {
                // startLocationPrewarm(); // Optional: prewarm on open
              } else {
                setVisitPhoto(null);
                setVisitLocation(null);
                setVisitForm({ notes: '' });
                setSelectedClient(null);
              }
            }}>
              <DialogTrigger asChild>
                <Button className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white">
                  <MapPin className="mr-2 h-4 w-4" />
                  Record Visit
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Record Client Visit</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  {/* 1. Client Selection (Mandatory) */}
                  <div className="space-y-2">
                    <Label>Select Client *</Label>
                    <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={clientPopoverOpen}
                          className="w-full justify-between"
                          onClick={() => fetchClients()}
                        >
                          {selectedClient ? selectedClient.name : "Select a client..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput placeholder="Search clients..." />
                          <CommandList>
                            <CommandEmpty>No client found.</CommandEmpty>
                            <CommandGroup>
                              {clients.map((client) => (
                                <CommandItem
                                  key={client.id}
                                  value={client.name}
                                  onSelect={() => {
                                    setSelectedClient(client);
                                    setClientPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${selectedClient?.id === client.id ? "opacity-100" : "opacity-0"
                                      }`}
                                  />
                                  <div className="flex flex-col">
                                    <span>{client.name}</span>
                                    {client.company && <span className="text-xs text-muted-foreground">{client.company}</span>}
                                    {client.city && <span className="text-xs text-muted-foreground">{client.city}</span>}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
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
                          {visitLocation && selectedClient?.location_latitude && selectedClient?.location_longitude ? (
                            <MapContainer
                              center={[visitLocation.latitude, visitLocation.longitude]}
                              zoom={18}
                              style={{ height: '100%', width: '100%' }}
                              dragging={!isMobile}
                            >
                              <ChangeView center={[visitLocation.latitude, visitLocation.longitude]} />
                              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                              <Circle
                                center={[selectedClient.location_latitude, selectedClient.location_longitude]}
                                pathOptions={{ fillColor: '#22c55e', color: '#16a34a', weight: 1, opacity: 0.8, fillOpacity: 0.2 }}
                                radius={100}
                              />
                              <Marker position={[selectedClient.location_latitude, selectedClient.location_longitude]} />
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
                          {visitLocation && selectedClient?.location_latitude && (
                            <div className={`absolute bottom-0 left-0 right-0 p-2 text-center text-xs font-bold text-white 
                                        ${calculateDistance(visitLocation.latitude, visitLocation.longitude, selectedClient.location_latitude, selectedClient.location_longitude) <= 100 ? 'bg-green-600/90' : 'bg-red-600/90'}
                                     `}>
                              Distance: {Math.round(calculateDistance(visitLocation.latitude, visitLocation.longitude, selectedClient.location_latitude, selectedClient.location_longitude))}m
                              {calculateDistance(visitLocation.latitude, visitLocation.longitude, selectedClient.location_latitude, selectedClient.location_longitude) > 100 ? ' (Too Far)' : ' (Verified)'}
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
                    disabled={isUploading || !visitPhoto || !visitLocation || !selectedClient}
                  >
                    {isUploading ? 'Recording...' : 'Submit Visit Log'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showAddTaskDialog} onOpenChange={(open) => {
              setShowAddTaskDialog(open);
              if (!open) {
                setDailyTaskForm({
                  title: '',
                  description: '',
                  date: new Date().toISOString().split('T')[0],
                  time: '',
                  notes: '',
                  priority: 'medium'
                });
                setSelectedClient(null);
                setClientPopoverOpen(false);
              }
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Task
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New Task</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  {/* Task Title */}
                  <div className="space-y-2">
                    <Label>Task Title *</Label>
                    <Input
                      placeholder="Enter task title"
                      value={dailyTaskForm.title}
                      onChange={(e) => setDailyTaskForm({ ...dailyTaskForm, title: e.target.value })}
                    />
                  </div>

                  {/* Optional Client Link */}
                  <div className="space-y-2">
                    <Label>Link Client (Optional)</Label>
                    <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={clientPopoverOpen}
                          className="w-full justify-between"
                          onClick={() => fetchClients()}
                        >
                          {selectedClient ? selectedClient.name : "Select a client..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput placeholder="Search clients..." />
                          <CommandList>
                            <CommandEmpty>No client found.</CommandEmpty>
                            <CommandGroup>
                              {clients.map((client) => (
                                <CommandItem
                                  key={client.id}
                                  value={client.name}
                                  onSelect={() => {
                                    setSelectedClient(client);
                                    setClientPopoverOpen(false);
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${selectedClient?.id === client.id ? "opacity-100" : "opacity-0"
                                      }`}
                                  />
                                  <div className="flex flex-col">
                                    <span>{client.name}</span>
                                    {client.company && <span className="text-xs text-muted-foreground">{client.company}</span>}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      placeholder="Task description (optional)"
                      value={dailyTaskForm.description}
                      onChange={(e) => setDailyTaskForm({ ...dailyTaskForm, description: e.target.value })}
                    />
                  </div>

                  {/* Date and Time */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={dailyTaskForm.date}
                        onChange={(e) => setDailyTaskForm({ ...dailyTaskForm, date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Time</Label>
                      <Input
                        type="time"
                        value={dailyTaskForm.time}
                        onChange={(e) => setDailyTaskForm({ ...dailyTaskForm, time: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={dailyTaskForm.priority}
                      onValueChange={(val: string) => setDailyTaskForm({ ...dailyTaskForm, priority: val as 'low' | 'medium' | 'high' | 'urgent' })}
                    >
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

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label>Notes</Label>
                    <Textarea
                      placeholder="Additional notes (optional)"
                      value={dailyTaskForm.notes}
                      onChange={(e) => setDailyTaskForm({ ...dailyTaskForm, notes: e.target.value })}
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleCreateDailyTask}
                    disabled={isUploading || !dailyTaskForm.title.trim()}
                  >
                    {isUploading ? 'Creating...' : 'Create Task'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap mt-4">
          {/* Mobile Tab Navigation */}
          {isMobile ? (
            <div className="flex w-full">
              <Button
                variant={mobileTab === 'today' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMobileTab('today')}
                className="flex-1 text-xs sm:text-sm min-h-[44px]"
              >
                Today
              </Button>
              <Button
                variant={mobileTab === 'all' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMobileTab('all')}
                className="flex-1 text-xs sm:text-sm min-h-[44px]"
              >
                All
              </Button>
            </div>

          ) : (
            <>
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>

              {/* Priority Filter */}
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              {/* View Mode Toggle */}
              <div className="flex border rounded-lg">
                <Button
                  variant={viewMode === 'month' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('month')}
                  title="Month View"
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'week' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('week')}
                  title="Week View"
                >
                  <CalendarDays className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'day' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('day')}
                  title="Day View"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'board' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('board')}
                  title="Task Board"
                >
                  <BarChart3 className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {/* Filter */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

        </div>
      </div>

      {/* Calendar Navigation */}
      <Card className="overflow-x-hidden">
        <CardHeader className="p-3 sm:p-6">
          <div className="flex items-center justify-between gap-2 w-full overflow-x-hidden">
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0 overflow-x-hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (isMobile) navigateWeek('prev');
                  else if (viewMode === 'month') navigateMonth('prev');
                  else if (viewMode === 'week') navigateWeek('prev');
                  else navigateDay('prev');
                }}
                className="min-w-[44px] min-h-[44px] shrink-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <h2 className="text-base sm:text-lg md:text-xl font-semibold truncate text-center flex-1">
                {isMobile
                  ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : (
                    (viewMode === 'month' && currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })) ||
                    (viewMode === 'week' && `Week of ${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`) ||
                    (viewMode === 'day' && currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
                  )}
              </h2>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (isMobile) navigateWeek('next');
                  else if (viewMode === 'month') navigateMonth('next');
                  else if (viewMode === 'week') navigateWeek('next');
                  else navigateDay('next');
                }}
                className="min-w-[44px] min-h-[44px] shrink-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentDate(new Date())}
              className="min-h-[44px] px-3 sm:px-4 text-xs sm:text-sm shrink-0"
            >
              Today
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-3 sm:p-6 overflow-x-hidden w-full">
          {/* Mobile: fixed week strip with selected day's list below */}
          {isMobile && (
            <>
              {/* Week Table (Sun to Sat) - Responsive */}
              <div className="mb-3 sm:mb-4 rounded-lg border bg-background overflow-hidden w-full">
                {/* Header row */}
                <div className="grid grid-cols-7 text-center text-[10px] sm:text-xs md:text-sm font-medium text-muted-foreground border-b">
                  {weekDays.map((day, index) => (
                    <div key={index} className="py-1.5 sm:py-2 px-0.5 sm:px-1">
                      <span className="hidden xs:inline">{day.date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      <span className="xs:hidden">{day.date.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                    </div>
                  ))}
                </div>
                {/* Date row */}
                <div className="grid grid-cols-7 text-center">
                  {weekDays.map((day, index) => {
                    const isSelected = selectedDate && selectedDate.toDateString() === day.date.toDateString();
                    const isToday = day.isToday;
                    return (
                      <button
                        key={index}
                        className={`py-2.5 sm:py-3 text-sm sm:text-base border-r last:border-r-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-colors min-h-[44px] sm:min-h-[48px] active:scale-95 ${isSelected ? 'bg-primary text-primary-foreground font-semibold' : isToday ? 'bg-muted font-semibold' : 'hover:bg-muted/50'
                          }`}
                        onClick={() => handleDayClick(day.date)}
                        aria-label={`Select ${day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
                      >
                        {day.date.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected Day - Time-based List with current time line - Responsive */}
              <div className="relative border rounded-lg overflow-hidden bg-background w-full">
                {/* Scrollable container for better mobile UX */}
                <div id="time-grid-scroll" className="max-h-[60vh] sm:max-h-[70vh] overflow-y-auto overflow-x-hidden w-full relative">
                  <div className="divide-y">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const hourEvents = dayEvents.filter(event => parseInt(event.startTime.split(':')[0]) === hour);
                      // Skip early morning hours (0-5) if they have no events
                      if (hourEvents.length === 0 && hour < 6) return null;

                      // Check if current time is in this hour for sticky positioning
                      const currentHour = currentTime.getHours();
                      const currentMinute = currentTime.getMinutes();
                      const isCurrentHour = isCurrentDay() && hour === currentHour;
                      const minuteOffset = isCurrentHour ? (currentMinute / 60) : 0;

                      return (
                        <div
                          key={hour}
                          className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 min-h-[48px] sm:min-h-[56px] relative"
                          data-hour={hour}
                        >
                          {/* Hour label - Sticky style */}
                          <div className="w-11 sm:w-12 text-[11px] sm:text-xs md:text-sm text-muted-foreground font-medium shrink-0 pt-0.5 leading-tight">
                            {hour.toString().padStart(2, '0')}:00
                          </div>
                          {/* Events in this hour */}
                          <div className="flex-1 min-w-0">
                            {hourEvents.length === 0 ? (
                              <div className="h-4" />
                            ) : (
                              <div className="space-y-1.5 sm:space-y-2">
                                {hourEvents.map(event => (
                                  <div
                                    key={event.id}
                                    className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 p-2 sm:px-3 sm:py-2 rounded border ${getEventTypeColor(event.type)} cursor-pointer active:opacity-80 transition-opacity min-h-[44px]`}
                                    onClick={() => handleEventClick(event)}
                                  >
                                    <div className="font-semibold text-xs sm:text-sm truncate flex-1 min-w-0">{event.title}</div>
                                    <div className="flex items-center justify-between sm:justify-end gap-1 sm:gap-2 shrink-0 min-w-0">
                                      <div className="text-[10px] sm:text-xs opacity-75 truncate">{event.startTime} - {event.endTime}</div>
                                      {event.type === 'task' && event.taskData && (
                                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                          {event.taskData.status === 'pending' && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleStartTask(event.taskData!.id)}
                                              className="h-8 w-8 p-0 min-h-[44px] min-w-[44px]"
                                              aria-label="Start task"
                                            >
                                              <Play className="h-3.5 w-3.5" />
                                            </Button>
                                          )}
                                          {event.taskData.status === 'in_progress' && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleCompleteTask(event.taskData!.id)}
                                              className="h-8 w-8 p-0 min-h-[44px] min-w-[44px]"
                                              aria-label="Complete task"
                                            >
                                              <CheckCircle className="h-3.5 w-3.5" />
                                            </Button>
                                          )}
                                          {event.taskData.status === 'completed' && (
                                            <div className="flex items-center gap-1 text-green-600 text-[10px] sm:text-xs font-medium">
                                              <CheckCircle className="h-3.5 w-3.5" />
                                              <span className="hidden sm:inline">Completed</span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Current time indicator - Sticky within this hour row */}
                          {isCurrentHour && (
                            <div
                              className="absolute left-0 right-0 h-0.5 bg-red-500 z-20 pointer-events-none"
                              style={{
                                top: `${minuteOffset * 100}%`,
                                transform: 'translateY(-50%)'
                              }}
                            >
                              <div className="absolute left-2 sm:left-3 -top-1.5 w-3 h-3 sm:w-4 sm:h-4 bg-red-500 rounded-full border-2 border-white shadow-sm"></div>
                              <div className="absolute right-2 sm:right-3 -top-2.5 sm:-top-3 text-[10px] sm:text-xs md:text-sm text-red-600 font-medium bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                                {currentTime.toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Mobile Task List View */}
          {isMobile && (
            <div className="space-y-4">
              {/* Mobile Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold">
                    {mobileTab === 'today' ? 'Today\'s Tasks' : 'All Tasks'}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xs sm:text-sm text-gray-600">
                      {getFilteredEvents(allEvents).length} tasks
                    </p>
                    {realtimeEnabled && (
                      <div className="flex items-center gap-1 text-green-600">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-[10px] sm:text-xs font-medium">Live</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Mobile Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full"
                />
              </div>

              {/* Mobile Priority Filter */}
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Filter by priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>

              {/* Mobile Task List */}
              <div className="space-y-2">
                {getFilteredEvents(allEvents)
                  .sort((a, b) => {
                    // Sort by priority first, then by time
                    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
                    const aPriority = priorityOrder[a.taskData?.priority as keyof typeof priorityOrder] || 0;
                    const bPriority = priorityOrder[b.taskData?.priority as keyof typeof priorityOrder] || 0;

                    if (aPriority !== bPriority) {
                      return bPriority - aPriority;
                    }

                    return a.startTime.localeCompare(b.startTime);
                  })
                  .map(event => (
                    <Card
                      key={event.id}
                      className={`cursor-pointer transition-all hover:shadow-sm active:scale-[0.98] border-l-4 ${event.taskData?.priority === 'urgent' ? 'border-l-red-500 bg-red-50' :
                        event.taskData?.priority === 'high' ? 'border-l-orange-500 bg-orange-50' :
                          event.taskData?.priority === 'medium' ? 'border-l-yellow-500 bg-yellow-50' :
                            event.taskData?.priority === 'low' ? 'border-l-green-500 bg-green-50' :
                              'border-l-gray-500 bg-gray-50'
                        } ${event.taskData?.status === 'completed' ? 'opacity-75' : ''}`}
                      onClick={() => handleEventClick(event)}
                    >
                      <CardContent className="p-3">
                        <div className="space-y-2">
                          {/* Task Header - Compact */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className={`font-medium text-sm leading-tight truncate ${event.taskData?.status === 'completed' ? 'line-through text-muted-foreground' : ''
                                  }`}>
                                  {event.title}
                                </h4>
                                <Badge variant={
                                  event.taskData?.priority === 'urgent' ? 'destructive' :
                                    event.taskData?.priority === 'high' ? 'default' :
                                      event.taskData?.priority === 'medium' ? 'secondary' : 'outline'
                                } className="text-[10px] px-1.5 py-0 h-5 shrink-0">
                                  {event.taskData?.priority}
                                </Badge>
                                {event.taskData?.status === 'completed' && (
                                  <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                                )}
                                {event.taskData?.status === 'in_progress' && (
                                  <Play className="h-4 w-4 text-blue-600 shrink-0" />
                                )}
                                {event.taskData?.status === 'pending' && (
                                  <Clock className="h-4 w-4 text-gray-600 shrink-0" />
                                )}
                              </div>
                              {event.taskData?.description && (
                                <p className="text-xs text-gray-600 line-clamp-1">
                                  {event.taskData.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Inline Metadata - Compact */}
                          <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 shrink-0" />
                              <span className="truncate">{event.taskData?.agent_name}</span>
                            </div>
                            <span className="text-gray-400">•</span>
                            <div className="flex items-center gap-1 min-w-0">
                              <CalendarIcon className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {new Date(event.date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric'
                                })}
                                {event.taskData?.time && ` ${event.taskData.time.substring(0, 5)}`}
                              </span>
                            </div>
                            {/* Urgency Indicators - Inline */}
                            {event.taskData?.urgency_status === 'overdue' && (
                              <>
                                <span className="text-gray-400">•</span>
                                <div className="flex items-center gap-1 text-red-600">
                                  <AlertCircle className="h-3 w-3" />
                                  <span className="font-medium">Overdue</span>
                                </div>
                              </>
                            )}
                            {event.taskData?.urgency_status === 'due_soon' && (
                              <>
                                <span className="text-gray-400">•</span>
                                <div className="flex items-center gap-1 text-orange-600">
                                  <Clock className="h-3 w-3" />
                                  <span className="font-medium">Due Soon</span>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Action Buttons - Compact */}
                          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                            <div className="flex items-center gap-2">
                              {event.taskData?.status === 'pending' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartTask(event.taskData!.id);
                                  }}
                                >
                                  <Play className="h-3 w-3 mr-1" />
                                  Start
                                </Button>
                              )}
                              {event.taskData?.status === 'in_progress' && (
                                <Button
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCompleteTask(event.taskData!.id);
                                  }}
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Complete
                                </Button>
                              )}
                              {event.taskData?.status === 'completed' && (
                                <div className="flex items-center gap-1 text-green-600">
                                  <CheckCircle className="h-3 w-3" />
                                  <span className="text-xs font-medium">Completed</span>
                                </div>
                              )}
                            </div>

                            <span className="text-[10px] text-gray-500">
                              {new Date(event.taskData?.created_at || '').toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              })}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                {/* Empty State */}
                {getFilteredEvents(allEvents).length === 0 && (
                  <div className="text-center py-8 sm:py-12 text-gray-500">
                    <CalendarIcon className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                    <h3 className="text-base sm:text-lg font-medium mb-1 sm:mb-2">No tasks found</h3>
                    <p className="text-xs sm:text-sm">
                      {mobileTab === 'today' ? 'No tasks scheduled for today' : 'No tasks match your filters'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Month View */}
          {viewMode === 'month' && !isMobile && (
            <div className="grid grid-cols-7 gap-1">
              {/* Day Headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground">
                  {day}
                </div>
              ))}

              {/* Calendar Days */}
              {calendarDays.map((day, index) => {
                const isClicked = clickedDay && clickedDay.toDateString() === day.date.toDateString();
                return (
                  <div
                    key={index}
                    className={`min-h-[120px] p-2 border rounded-lg cursor-pointer transition-all duration-200 hover:bg-accent/50 ${day.isCurrentMonth ? 'bg-background' : 'bg-muted/50'
                      } ${day.isToday ? 'ring-2 ring-primary' : ''} ${isClicked ? 'bg-primary/10 border-primary ring-2 ring-primary/20' : ''
                      }`}
                    onClick={() => handleDayClick(day.date)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`text-sm font-medium ${day.isCurrentMonth ? 'text-foreground' : 'text-muted-foreground'
                        } ${day.isToday ? 'text-primary font-bold' : ''} ${isClicked ? 'text-primary font-bold' : ''
                        }`}>
                        {day.date.getDate()}
                      </div>
                      {day.events.length > 0 && (
                        <Badge variant="secondary" className="text-xs h-5">
                          {day.events.length}
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1">
                      {day.events.slice(0, 3).map(event => (
                        <div
                          key={event.id}
                          className={`text-xs p-1 rounded border ${getEventTypeColor(event.type)} cursor-pointer hover:opacity-80 transition-opacity`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEventClick(event);
                          }}
                        >
                          <div className="font-medium truncate">{event.title}</div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs opacity-75">{event.startTime}</div>
                            {event.type === 'task' && event.taskData && (
                              <div className="flex space-x-1" onClick={(e) => e.stopPropagation()}>
                                {event.taskData.status === 'pending' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleStartTask(event.taskData!.id)}
                                    className="h-4 px-1 text-xs"
                                  >
                                    <Play className="h-2 w-2" />
                                  </Button>
                                )}
                                {event.taskData.status === 'in_progress' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCompleteTask(event.taskData!.id)}
                                    className="h-4 px-1 text-xs"
                                  >
                                    <CheckCircle className="h-2 w-2" />
                                  </Button>
                                )}
                                {event.taskData.status === 'completed' && (
                                  <div className="text-xs text-green-600 font-medium">
                                    ✓ Done
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {day.events.length > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{day.events.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Week View */}
          {viewMode === 'week' && !isMobile && (
            <div className="grid grid-cols-7 gap-4">
              {weekDays.map((day, index) => {
                const isClicked = clickedDay && clickedDay.toDateString() === day.date.toDateString();
                return (
                  <div key={index} className="space-y-2">
                    <div
                      className={`text-center p-2 border rounded-lg cursor-pointer transition-all duration-200 hover:bg-accent/50 ${day.isToday ? 'bg-primary text-primary-foreground' : 'bg-muted'
                        } ${isClicked ? 'bg-primary/20 border-primary ring-2 ring-primary/20' : ''}`}
                      onClick={() => handleDayClick(day.date)}
                    >
                      <div className="text-sm font-medium">
                        {day.date.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className="text-lg font-bold">
                        {day.date.getDate()}
                      </div>
                      {/* plus indicator removed for mobile spec */}
                    </div>

                    <div className="space-y-1">
                      {day.events.map(event => (
                        <div
                          key={event.id}
                          className={`text-xs p-2 rounded border ${getEventTypeColor(event.type)} cursor-pointer hover:opacity-80 transition-opacity`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEventClick(event);
                          }}
                        >
                          <div className="font-medium">{event.title}</div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs opacity-75">{event.startTime}</div>
                            {event.type === 'task' && event.taskData && (
                              <div className="flex space-x-1" onClick={(e) => e.stopPropagation()}>
                                {event.taskData.status === 'pending' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleStartTask(event.taskData!.id)}
                                    className="h-4 px-1 text-xs"
                                  >
                                    <Play className="h-2 w-2" />
                                  </Button>
                                )}
                                {event.taskData.status === 'in_progress' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCompleteTask(event.taskData!.id)}
                                    className="h-4 px-1 text-xs"
                                  >
                                    <CheckCircle className="h-2 w-2" />
                                  </Button>
                                )}
                                {event.taskData.status === 'completed' && (
                                  <div className="text-xs text-green-600 font-medium">
                                    ✓ Done
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Day View */}
          {viewMode === 'day' && (
            <div className="space-y-3 md:space-y-4">
              {/* Time Grid with Events */}
              <div className="relative border rounded-lg overflow-hidden">
                {/* Mobile: Vertical Timeline, Desktop: Grid Layout */}
                {isMobile ? (
                  <div className="divide-y relative">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const hourEvents = dayEvents.filter(event => {
                        const eventHour = parseInt(event.startTime.split(':')[0]);
                        return eventHour === hour;
                      });

                      // Skip early morning hours (0-5) if they have no events
                      if (hourEvents.length === 0 && hour < 6) return null;

                      // Check if current time is in this hour
                      const currentHour = currentTime.getHours();
                      const currentMinute = currentTime.getMinutes();
                      const isCurrentHour = isCurrentDay() && hour === currentHour;
                      const minuteOffset = isCurrentHour ? (currentMinute / 60) : 0;

                      return (
                        <div key={hour} className="relative min-h-[44px] sm:min-h-[52px] border-b last:border-b-0">
                          <div className="flex gap-2 sm:gap-3 p-2 sm:p-3">
                            {/* Time label - Fixed width on left */}
                            <div className="w-12 sm:w-16 text-[10px] sm:text-xs text-muted-foreground font-medium shrink-0 pt-0.5">
                              {hour.toString().padStart(2, '0')}:00
                            </div>

                            {/* Events for this hour */}
                            <div className="flex-1 space-y-1.5 sm:space-y-2 min-w-0">
                              {hourEvents.length === 0 ? (
                                <div className="h-4" />
                              ) : (
                                hourEvents.map(event => (
                                  <div
                                    key={event.id}
                                    className={`text-[10px] sm:text-xs p-1.5 sm:p-2 rounded border cursor-pointer active:opacity-80 transition-opacity ${getEventTypeColor(event.type)}`}
                                    onClick={() => handleEventClick(event)}
                                  >
                                    <div className="font-medium truncate text-xs sm:text-sm">{event.title}</div>
                                    <div className="flex items-center justify-between gap-1 mt-0.5">
                                      <div className="text-[9px] sm:text-xs opacity-75 truncate">
                                        {event.startTime} - {event.endTime}
                                      </div>
                                      {event.type === 'task' && event.taskData && (
                                        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                                          {event.taskData.status === 'pending' && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleStartTask(event.taskData!.id)}
                                              className="h-5 w-5 p-0"
                                            >
                                              <Play className="h-2.5 w-2.5" />
                                            </Button>
                                          )}
                                          {event.taskData.status === 'in_progress' && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleCompleteTask(event.taskData!.id)}
                                              className="h-5 w-5 p-0"
                                            >
                                              <CheckCircle className="h-2.5 w-2.5" />
                                            </Button>
                                          )}
                                          {event.taskData.status === 'completed' && (
                                            <CheckCircle className="h-3 w-3 text-green-600" />
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Current time indicator - Sticky within this hour row */}
                          {isCurrentHour && (
                            <div
                              className="absolute left-0 right-0 h-0.5 bg-red-500 z-20 pointer-events-none"
                              style={{
                                top: `${minuteOffset * 100}%`,
                                transform: 'translateY(-50%)'
                              }}
                            >
                              <div className="absolute left-2 sm:left-3 -top-1.5 w-3 h-3 sm:w-4 sm:h-4 bg-red-500 rounded-full border-2 border-white shadow-sm"></div>
                              <div className="absolute right-2 sm:right-3 -top-2.5 sm:-top-3 text-[10px] sm:text-xs md:text-sm text-red-600 font-medium bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
                                {currentTime.toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-24 gap-0 relative">
                    {Array.from({ length: 24 }, (_, hour) => {
                      const hourEvents = dayEvents.filter(event => {
                        const eventHour = parseInt(event.startTime.split(':')[0]);
                        return eventHour === hour;
                      });

                      // Check if current time is in this hour
                      const currentHour = currentTime.getHours();
                      const currentMinute = currentTime.getMinutes();
                      const isCurrentHour = isCurrentDay() && hour === currentHour;
                      const minuteOffset = isCurrentHour ? (currentMinute / 60) : 0;

                      return (
                        <div key={hour} className="relative min-h-[60px] border-r border-gray-200 p-2">
                          {/* Time label */}
                          <div className="text-xs text-muted-foreground font-medium mb-2">
                            {hour.toString().padStart(2, '0')}:00
                          </div>

                          {/* Events for this hour */}
                          <div className="space-y-1">
                            {hourEvents.map(event => (
                              <div
                                key={event.id}
                                className={`text-xs p-2 rounded border cursor-pointer hover:opacity-80 transition-opacity ${getEventTypeColor(event.type)}`}
                                onClick={() => handleEventClick(event)}
                              >
                                <div className="font-medium truncate">{event.title}</div>
                                <div className="flex items-center justify-between">
                                  <div className="text-xs opacity-75">{event.startTime} - {event.endTime}</div>
                                  {event.type === 'task' && event.taskData && (
                                    <div className="flex space-x-1" onClick={(e) => e.stopPropagation()}>
                                      {event.taskData.status === 'pending' && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleStartTask(event.taskData!.id)}
                                          className="h-4 px-1 text-xs"
                                        >
                                          <Play className="h-2 w-2" />
                                        </Button>
                                      )}
                                      {event.taskData.status === 'in_progress' && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleCompleteTask(event.taskData!.id)}
                                          className="h-4 px-1 text-xs"
                                        >
                                          <CheckCircle className="h-2 w-2" />
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Current time indicator - Within this hour column */}
                          {isCurrentHour && (
                            <div
                              className="absolute left-0 right-0 h-0.5 bg-red-500 z-20 pointer-events-none"
                              style={{
                                top: `${minuteOffset * 100}%`,
                                transform: 'translateY(-50%)'
                              }}
                            >
                              <div className="absolute -left-2 -top-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-sm"></div>
                              <div className="absolute -right-16 -top-1 text-xs text-red-600 font-medium bg-white/90 backdrop-blur-sm px-1 rounded shadow-sm whitespace-nowrap">
                                {currentTime.toLocaleTimeString('en-US', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Empty state when no events */}
              {dayEvents.length === 0 && (
                <div className="text-center py-8 sm:py-12 text-muted-foreground border-2 border-dashed border-gray-200 rounded-lg">
                  <CalendarIcon className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-3 sm:mb-4 opacity-50" />
                  <p className="text-base sm:text-xl font-medium">No events scheduled for this day</p>
                  <p className="text-xs sm:text-sm mt-1 sm:mt-2">Click on a day to add an event</p>
                </div>
              )}
            </div>
          )}

          {/* Task Board View */}
          {viewMode === 'board' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Task Board</h2>
                  <div className="flex items-center gap-2">
                    <p className="text-gray-600">Manage your tasks efficiently</p>
                    {realtimeEnabled && (
                      <div className="flex items-center gap-1 text-green-600">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-medium">Live</span>
                      </div>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="text-sm">
                  {getFilteredEvents(allEvents).length} tasks
                </Badge>
              </div>

              {/* Kanban Board */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Pending Tasks */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-700">Pending</h3>
                    <Badge variant="outline">
                      {getFilteredEvents(allEvents).filter(event => event.taskData?.status === 'pending').length}
                    </Badge>
                  </div>
                  <div className="space-y-3 min-h-[400px]">
                    {getFilteredEvents(allEvents)
                      .filter(event => event.taskData?.status === 'pending')
                      .map(event => (
                        <Card
                          key={event.id}
                          className={`cursor-pointer transition-all hover:shadow-md hover:scale-105 border-l-4 ${event.taskData?.priority === 'urgent' ? 'border-l-red-500 bg-red-50' :
                            event.taskData?.priority === 'high' ? 'border-l-orange-500 bg-orange-50' :
                              event.taskData?.priority === 'medium' ? 'border-l-yellow-500 bg-yellow-50' :
                                event.taskData?.priority === 'low' ? 'border-l-green-500 bg-green-50' :
                                  'border-l-gray-500 bg-gray-50'
                            }`}
                          onClick={() => handleEventClick(event)}
                        >
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <h4 className="font-medium text-sm leading-tight">{event.title}</h4>
                                <Badge variant={
                                  event.taskData?.priority === 'urgent' ? 'destructive' :
                                    event.taskData?.priority === 'high' ? 'default' :
                                      event.taskData?.priority === 'medium' ? 'secondary' : 'outline'
                                } className="text-xs">
                                  {event.taskData?.priority}
                                </Badge>
                              </div>

                              {event.taskData?.description && (
                                <p className="text-xs text-gray-600 line-clamp-2">
                                  {event.taskData.description}
                                </p>
                              )}

                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3 text-gray-400" />
                                  <span className="text-xs text-gray-600">{event.taskData?.agent_name}</span>
                                </div>

                                {event.taskData?.due_date && (
                                  <div className="flex items-center gap-2">
                                    <CalendarIcon className="h-3 w-3 text-gray-400" />
                                    <span className="text-xs text-gray-600">
                                      {new Date(event.taskData.due_date).toLocaleDateString()}
                                      {event.taskData.time && ` at ${event.taskData.time.substring(0, 5)}`}
                                    </span>
                                  </div>
                                )}

                                {event.taskData?.urgency_status === 'overdue' && (
                                  <div className="flex items-center gap-1 text-red-600">
                                    <AlertCircle className="h-3 w-3" />
                                    <span className="text-xs font-medium">Overdue</span>
                                  </div>
                                )}
                                {event.taskData?.urgency_status === 'due_soon' && (
                                  <div className="flex items-center gap-1 text-orange-600">
                                    <Clock className="h-3 w-3" />
                                    <span className="text-xs font-medium">Due Soon</span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleStartTask(event.taskData!.id);
                                  }}
                                >
                                  <Play className="h-3 w-3 mr-1" />
                                  Start
                                </Button>
                                <span className="text-xs text-gray-500">
                                  {new Date(event.taskData?.created_at || '').toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    {getFilteredEvents(allEvents).filter(event => event.taskData?.status === 'pending').length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No pending tasks</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* In Progress Tasks */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-blue-700">In Progress</h3>
                    <Badge variant="outline">
                      {getFilteredEvents(allEvents).filter(event => event.taskData?.status === 'in_progress').length}
                    </Badge>
                  </div>
                  <div className="space-y-3 min-h-[400px]">
                    {getFilteredEvents(allEvents)
                      .filter(event => event.taskData?.status === 'in_progress')
                      .map(event => (
                        <Card
                          key={event.id}
                          className={`cursor-pointer transition-all hover:shadow-md hover:scale-105 border-l-4 ${event.taskData?.priority === 'urgent' ? 'border-l-red-500 bg-red-50' :
                            event.taskData?.priority === 'high' ? 'border-l-orange-500 bg-orange-50' :
                              event.taskData?.priority === 'medium' ? 'border-l-yellow-500 bg-yellow-50' :
                                event.taskData?.priority === 'low' ? 'border-l-green-500 bg-green-50' :
                                  'border-l-gray-500 bg-gray-50'
                            }`}
                          onClick={() => handleEventClick(event)}
                        >
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <h4 className="font-medium text-sm leading-tight">{event.title}</h4>
                                <Badge variant={
                                  event.taskData?.priority === 'urgent' ? 'destructive' :
                                    event.taskData?.priority === 'high' ? 'default' :
                                      event.taskData?.priority === 'medium' ? 'secondary' : 'outline'
                                } className="text-xs">
                                  {event.taskData?.priority}
                                </Badge>
                              </div>

                              {event.taskData?.description && (
                                <p className="text-xs text-gray-600 line-clamp-2">
                                  {event.taskData.description}
                                </p>
                              )}

                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3 text-gray-400" />
                                  <span className="text-xs text-gray-600">{event.taskData?.agent_name}</span>
                                </div>

                                {event.taskData?.due_date && (
                                  <div className="flex items-center gap-2">
                                    <CalendarIcon className="h-3 w-3 text-gray-400" />
                                    <span className="text-xs text-gray-600">
                                      {new Date(event.taskData.due_date).toLocaleDateString()}
                                      {event.taskData.time && ` at ${event.taskData.time.substring(0, 5)}`}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t">
                                <Button
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCompleteTask(event.taskData!.id);
                                  }}
                                >
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Complete
                                </Button>
                                <span className="text-xs text-gray-500">
                                  {new Date(event.taskData?.created_at || '').toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    {getFilteredEvents(allEvents).filter(event => event.taskData?.status === 'in_progress').length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <Play className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No active tasks</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Completed Tasks */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-green-700">Completed</h3>
                    <Badge variant="outline">
                      {getFilteredEvents(allEvents).filter(event => event.taskData?.status === 'completed').length}
                    </Badge>
                  </div>
                  <div className="space-y-3 min-h-[400px]">
                    {getFilteredEvents(allEvents)
                      .filter(event => event.taskData?.status === 'completed')
                      .map(event => (
                        <Card
                          key={event.id}
                          className="cursor-pointer transition-all hover:shadow-md hover:scale-105 border-l-4 border-l-green-500 bg-green-50 opacity-75"
                          onClick={() => handleEventClick(event)}
                        >
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <h4 className="font-medium text-sm leading-tight line-through">{event.title}</h4>
                                <div className="flex items-center gap-1 text-green-600">
                                  <CheckCircle className="h-3 w-3" />
                                  <span className="text-xs font-medium">Completed</span>
                                </div>
                              </div>

                              {event.taskData?.description && (
                                <p className="text-xs text-gray-600 line-clamp-2 line-through">
                                  {event.taskData.description}
                                </p>
                              )}

                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3 text-gray-400" />
                                  <span className="text-xs text-gray-600">{event.taskData?.agent_name}</span>
                                </div>

                                {event.taskData?.completed_at && (
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="h-3 w-3 text-green-600" />
                                    <span className="text-xs text-green-600">
                                      Completed: {new Date(event.taskData.completed_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    {getFilteredEvents(allEvents).filter(event => event.taskData?.status === 'completed').length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No completed tasks</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cancelled Tasks */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-700">Cancelled</h3>
                    <Badge variant="outline">
                      {getFilteredEvents(allEvents).filter(event => event.taskData?.status === 'cancelled').length}
                    </Badge>
                  </div>
                  <div className="space-y-3 min-h-[400px]">
                    {getFilteredEvents(allEvents)
                      .filter(event => event.taskData?.status === 'cancelled')
                      .map(event => (
                        <Card
                          key={event.id}
                          className="cursor-pointer transition-all hover:shadow-md hover:scale-105 border-l-4 border-l-gray-500 bg-gray-50 opacity-75"
                          onClick={() => handleEventClick(event)}
                        >
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div className="flex items-start justify-between">
                                <h4 className="font-medium text-sm leading-tight line-through">{event.title}</h4>
                                <div className="flex items-center gap-1 text-gray-600">
                                  <AlertCircle className="h-3 w-3" />
                                  <span className="text-xs font-medium">Cancelled</span>
                                </div>
                              </div>

                              {event.taskData?.description && (
                                <p className="text-xs text-gray-600 line-clamp-2 line-through">
                                  {event.taskData.description}
                                </p>
                              )}

                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3 text-gray-400" />
                                  <span className="text-xs text-gray-600">{event.taskData?.agent_name}</span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    {getFilteredEvents(allEvents).filter(event => event.taskData?.status === 'cancelled').length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">No cancelled tasks</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Details Dialog */}
      <Dialog open={showEventDetails} onOpenChange={setShowEventDetails}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Event Details
            </DialogTitle>
          </DialogHeader>

          {selectedEvent && (
            <div className="space-y-6 py-4">
              {/* Event Header */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Badge className={getEventTypeColor(selectedEvent.type)}>
                    {selectedEvent.type}
                  </Badge>
                  <Badge variant="outline" className={getPriorityColor(selectedEvent.priority)}>
                    {selectedEvent.priority} priority
                  </Badge>
                  <Badge variant="outline" className="bg-gray-100 text-gray-600">
                    {selectedEvent.status}
                  </Badge>
                </div>

                <h2 className="text-xl sm:text-2xl font-bold">{selectedEvent.title}</h2>

                {selectedEvent.description && (
                  <p className="text-muted-foreground text-sm sm:text-lg">{selectedEvent.description}</p>
                )}
              </div>

              {/* Event Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Date & Time */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Schedule
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Date:</span>
                      <span>{new Date(selectedEvent.date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Time:</span>
                      <span>{selectedEvent.startTime} - {selectedEvent.endTime}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Duration:</span>
                      <span>
                        {(() => {
                          const start = new Date(`2000-01-01T${selectedEvent.startTime}`);
                          const end = new Date(`2000-01-01T${selectedEvent.endTime}`);
                          const diff = end.getTime() - start.getTime();
                          const hours = Math.floor(diff / (1000 * 60 * 60));
                          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                          return `${hours}h ${minutes}m`;
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Task Completion Info */}
                {selectedEvent.type === 'task' && selectedEvent.taskData && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Task Status
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Status:</span>
                        <Badge variant="outline" className={
                          selectedEvent.taskData.status === 'completed' ? 'bg-green-100 text-green-600' :
                            selectedEvent.taskData.status === 'in_progress' ? 'bg-blue-100 text-blue-600' :
                              selectedEvent.taskData.status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                                'bg-gray-100 text-gray-600'
                        }>
                          {selectedEvent.taskData.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      {selectedEvent.taskData.completed_at && (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Completed:</span>
                          <span>{new Date(selectedEvent.taskData.completed_at).toLocaleString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Assigned by:</span>
                        <span>{selectedEvent.taskData.leader_name}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Task Attachment/Photo */}
                {selectedEvent.type === 'task' && selectedEvent.taskData?.attachment_url && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Camera className="h-5 w-5" />
                      Attachment
                    </h3>
                    <div className="relative rounded-lg overflow-hidden border">
                      <img
                        src={selectedEvent.taskData.attachment_url}
                        alt="Task attachment"
                        className="w-full h-96 object-contain bg-gray-50"
                        onClick={() => {
                          const newWindow = window.open();
                          if (newWindow) {
                            newWindow.document.write(`
                              <html>
                                <head><title>Task Attachment</title></head>
                                <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000;">
                                  <img src="${selectedEvent.taskData.attachment_url}" style="max-width:100%;max-height:100vh;object-fit:contain;" />
                                </body>
                              </html>
                            `);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">Click image to view full size</p>
                  </div>
                )}

                {/* Visit Details (Photo & Map) */}
                {selectedEvent.visitData && (
                  <div className="col-span-1 md:col-span-2 space-y-4">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Visit Verification
                    </h3>

                    {/* Status Banner */}
                    <div className={`p-3 rounded-lg border flex items-center gap-3 ${selectedEvent.visitData.is_within_radius ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                      {selectedEvent.visitData.is_within_radius ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <AlertCircle className="h-5 w-5" />
                      )}
                      <div className="flex-1">
                        <p className="font-bold">
                          {selectedEvent.visitData.is_within_radius ? 'Verified Visit' : 'Location Warning'}
                        </p>
                        <p className="text-sm">
                          {selectedEvent.visitData.is_within_radius
                            ? `Agent was within ${Math.round(selectedEvent.visitData.distance_meters || 0)}m of client location.`
                            : `Agent was ${Math.round(selectedEvent.visitData.distance_meters || 0)}m away from client (Limit: ${selectedEvent.visitData.radius_limit_meters || 100}m).`
                          }
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Photo */}
                      {selectedEvent.visitData.photo_url ? (
                        <div className="relative rounded-lg overflow-hidden border bg-black h-64">
                          <img
                            src={selectedEvent.visitData.photo_url}
                            alt="Visit verification"
                            className="w-full h-full object-contain cursor-pointer"
                            onClick={() => window.open(selectedEvent.visitData!.photo_url, '_blank')}
                          />
                        </div>
                      ) : (
                        <div className="h-64 rounded-lg border bg-gray-50 flex items-center justify-center text-muted-foreground">
                          No photo captured
                        </div>
                      )}

                      {/* Map */}
                      <div className="h-64 rounded-lg overflow-hidden border relative z-0">
                        {selectedEvent.visitData.latitude && selectedEvent.visitData.longitude ? (
                          <MapContainer
                            center={[selectedEvent.visitData.latitude, selectedEvent.visitData.longitude]}
                            zoom={16}
                            style={{ height: '100%', width: '100%' }}
                            dragging={!isMobile}
                          >
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            {/* Client Location Circle */}
                            {selectedEvent.visitData.client?.location_latitude && (
                              <Circle
                                center={[selectedEvent.visitData.client.location_latitude, selectedEvent.visitData.client.location_longitude]}
                                pathOptions={{ fillColor: '#22c55e', color: '#16a34a', weight: 1, opacity: 0.8, fillOpacity: 0.2 }}
                                radius={selectedEvent.visitData.radius_limit_meters || 100}
                              />
                            )}
                            {/* Visit Location */}
                            <Marker position={[selectedEvent.visitData.latitude, selectedEvent.visitData.longitude]}>
                              <Popup>
                                Visit Location<br />
                                {new Date(selectedEvent.visitData.visited_at).toLocaleTimeString()}
                              </Popup>
                            </Marker>
                          </MapContainer>
                        ) : (
                          <div className="flex items-center justify-center h-full bg-muted text-muted-foreground">
                            Map unavailable
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Location & Attendees */}
                <div className="space-y-3">
                  {selectedEvent.location && (
                    <div>
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        <MapPin className="h-5 w-5" />
                        Location
                      </h3>
                      <p className="text-muted-foreground">{selectedEvent.location}</p>
                    </div>
                  )}

                  {selectedEvent.attendees && selectedEvent.attendees.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-lg flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Attendees ({selectedEvent.attendees.length})
                      </h3>
                      <div className="space-y-1">
                        {selectedEvent.attendees.map((attendee, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-primary rounded-full"></div>
                            <span className="text-muted-foreground">{attendee}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowEventDetails(false)}>
                  Close
                </Button>

                {/* Task-specific actions */}
                {selectedEvent.type === 'task' && selectedEvent.taskData && (
                  <>
                    {selectedEvent.taskData.status === 'pending' && (
                      <Button
                        variant="default"
                        onClick={() => handleStartTask(selectedEvent.taskData!.id)}
                        className="flex items-center gap-2"
                      >
                        <Play className="h-4 w-4" />
                        Start Task
                      </Button>
                    )}
                    {selectedEvent.taskData.status === 'in_progress' && (
                      <Button
                        variant="default"
                        onClick={handleCompleteTaskWithConfirmation}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Complete Task
                      </Button>
                    )}
                    {selectedEvent.taskData.status === 'completed' && (
                      <div className="flex items-center gap-2 text-green-600 font-medium">
                        <CheckCircle className="h-4 w-4" />
                        Task Completed
                      </div>
                    )}
                  </>
                )}

                {/* General event actions (for non-task events) */}
                {selectedEvent.type !== 'task' && (
                  <>
                    <Button variant="outline">
                      Edit Event
                    </Button>
                    <Button variant="destructive">
                      Delete Event
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Task Completion Confirmation Dialog */}
      <Dialog open={showCompletionConfirm} onOpenChange={setShowCompletionConfirm}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Complete Task
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-muted-foreground">
              Are you sure you want to mark this task as completed? This action cannot be undone.
            </p>

            {selectedEvent?.taskData && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <h4 className="font-medium text-sm text-gray-700 mb-1">Task Details:</h4>
                <p className="text-sm font-medium">{selectedEvent.taskData.title}</p>
                {selectedEvent.taskData.description && (
                  <p className="text-xs text-gray-600 mt-1">{selectedEvent.taskData.description}</p>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowCompletionConfirm(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                onClick={() => selectedEvent?.taskData && handleCompleteTask(selectedEvent.taskData.id)}
                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Yes, Complete Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div >
  );
}
