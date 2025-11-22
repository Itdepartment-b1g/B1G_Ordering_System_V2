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

// Types
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
  status: 'scheduled' | 'completed' | 'cancelled';
  taskData?: Task; // For tasks from database
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
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  
  // Daily task creation states
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [dailyTaskPhoto, setDailyTaskPhoto] = useState<string | null>(null);
  const [dailyTaskForm, setDailyTaskForm] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    time: '',
    notes: ''
  });
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
  const [isPrewarmingLocation, setIsPrewarmingLocation] = useState(false);
  const [prewarmPosition, setPrewarmPosition] = useState<GeolocationPosition | null>(null);
  
  // Location capture states for daily task
  const [taskLocation, setTaskLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    address: string;
    city?: string;
  } | null>(null);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  
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

    return taskEvents; // Only show tasks, no sample events
  }, [tasks]);

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
              
            case 'UPDATE':
              // Task updated
              const updatedTask = payload.new as any;
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
        .select('*')
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

  // Handle daily task creation with photo upload
  const handleCreateDailyTask = async () => {
    if (!dailyTaskForm.title.trim()) {
      toast({ title: 'Error', description: 'Task title is required', variant: 'destructive' });
      return;
    }

    if (!dailyTaskPhoto) {
      toast({ title: 'Error', description: 'Photo is required. Please take a photo before creating the task.', variant: 'destructive' });
      return;
    }

    if (!selectedClient) {
      toast({ title: 'Error', description: 'Client selection is required. Please select a client before creating the task.', variant: 'destructive' });
      return;
    }

    if (!user?.id) {
      toast({ title: 'Error', description: 'User not authenticated', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      let attachmentUrl = null;

      // Photo is required, so we always upload it
      if (dailyTaskPhoto) {
        // Convert base64 to blob
        const base64Data = dailyTaskPhoto.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        // Generate unique filename
        const sanitizeTitle = dailyTaskForm.title
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
        
        const timestamp = Date.now();
        const fileName = `${user.id}/${sanitizeTitle}_${timestamp}.jpg`;
        
        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('daily-attachments')
          .upload(fileName, blob, {
            contentType: 'image/jpeg',
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error(`Failed to upload photo: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('daily-attachments')
          .getPublicUrl(fileName);
        
        attachmentUrl = urlData.publicUrl;
      }

      // Build notes with client and location info
      let finalNotes = dailyTaskForm.notes || '';
      if (selectedClient) {
        finalNotes += `\n\n--- Client Information ---\n`;
        finalNotes += `Client: ${selectedClient.name}`;
        if (selectedClient.company) {
          finalNotes += ` (${selectedClient.company})`;
        }
        if (selectedClient.city) {
          finalNotes += `\nCity: ${selectedClient.city}`;
        }
        if (selectedClient.address) {
          finalNotes += `\nAddress: ${selectedClient.address}`;
        }
        if (selectedClient.email) {
          finalNotes += `\nEmail: ${selectedClient.email}`;
        }
        if (selectedClient.phone) {
          finalNotes += `\nPhone: ${selectedClient.phone}`;
        }
      }
      if (taskLocation) {
        finalNotes += `\n\n--- Task Location ---\n`;
        finalNotes += `Location: ${taskLocation.address}${taskLocation.city ? ` (${taskLocation.city})` : ''}\n`;
        finalNotes += `Coordinates: ${taskLocation.latitude.toFixed(6)}, ${taskLocation.longitude.toFixed(6)}\n`;
        finalNotes += `Accuracy: ±${Math.round(taskLocation.accuracy)}m`;
        if (selectedClient && selectedClient.location_latitude && selectedClient.location_longitude) {
          const distance = calculateDistance(
            taskLocation.latitude,
            taskLocation.longitude,
            selectedClient.location_latitude,
            selectedClient.location_longitude
          );
          finalNotes += `\nDistance from client: ${Math.round(distance)}m`;
          if (distance > 100) {
            finalNotes += ` (⚠ Warning: More than 100m away)`;
          } else {
            finalNotes += ` (✓ Verified)`;
          }
        }
      }

      // Create task in database
      // Note: For agent-created tasks: leader_id = NULL, agent_id = current user
      // For leader-assigned tasks: leader_id = leader who assigns, agent_id = assigned agent
      const { error } = await supabase
        .from('tasks')
        .insert({
          agent_id: user.id,
          leader_id: null, // NULL for agent-created tasks
          title: dailyTaskForm.title,
          description: dailyTaskForm.description || null,
          due_date: dailyTaskForm.date || null,
          time: dailyTaskForm.time || null,
          notes: finalNotes.trim() || null,
          attachment_url: attachmentUrl,
          status: 'pending',
          priority: 'medium'
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Daily task created successfully'
      });

      // Reset form and close dialog
      setDailyTaskForm({
        title: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        time: '',
        notes: ''
      });
      setDailyTaskPhoto(null);
      setTaskLocation(null);
      setSelectedClient(null);
      setClientPopoverOpen(false);
      setPrewarmPosition(null);
      setIsPrewarmingLocation(false);
      setShowAddTaskDialog(false);

      // Refresh tasks (real-time will also handle this)
      await fetchTasks();
    } catch (error) {
      console.error('Error creating daily task:', error);
      toast({
        title: 'Error',
        description: 'Failed to create daily task. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const removeTaskPhoto = () => {
    setDailyTaskPhoto(null);
    setTaskLocation(null);
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

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  };

  const getAccuracyBadge = (accuracy: number) => {
    if (accuracy <= 50) {
      return {
        label: 'Excellent',
        color: 'bg-green-50 text-green-700 border-green-200',
        icon: '🎯'
      };
    } else if (accuracy <= 100) {
      return {
        label: 'Good',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: '✓'
      };
    } else if (accuracy <= 500) {
      return {
        label: 'Fair',
        color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        icon: '⚠'
      };
    }

    return {
      label: 'Poor',
      color: 'bg-red-50 text-red-700 border-red-200',
      icon: '⚠️'
    };
  };

  // Get current location
  const getCurrentLocation = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 30000,
          maximumAge: 0
        }
      );
    });
  };

  // Pre-warm GPS when dialog opens
  const startLocationPrewarm = async () => {
    setIsPrewarmingLocation(true);
    try {
      const position = await getCurrentLocation();
      setPrewarmPosition(position);
    } catch (error) {
      console.error('Pre-warm location error:', error);
    } finally {
      setIsPrewarmingLocation(false);
    }
  };

  // Reverse geocode location
  const reverseGeocode = async (latitude: number, longitude: number): Promise<{ address: string; city: string }> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'en'
          }
        }
      );
      
      const data = await response.json();
      
      if (data && data.address) {
        const addr = data.address;
        const city = addr.city || addr.town || addr.village || addr.municipality || '';
        const parts = [
          addr.house_number,
          addr.road,
          addr.suburb || addr.neighbourhood,
          addr.city || addr.town || addr.village,
          addr.state,
          addr.country
        ].filter(Boolean);
        return { address: parts.join(', '), city };
      } else if (data && data.display_name) {
        return { address: data.display_name, city: '' };
      }
      
      return { address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, city: '' };
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return { address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, city: '' };
    }
  };

  const processTaskLocation = async (position: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = position.coords;
    const { address, city } = await reverseGeocode(latitude, longitude);

    setTaskLocation({ latitude, longitude, accuracy, address, city });

    const badge = getAccuracyBadge(accuracy);
    toast({
      title: 'Location Captured',
      description: `${badge.icon} ${badge.label} (±${Math.round(accuracy)}m)`
    });

    return { latitude, longitude, accuracy, address, city };
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

  // Capture photo from camera
  const capturePhoto = async () => {
    if (!videoRef.current) return;
    
    setCapturingPhoto(true);
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setDailyTaskPhoto(dataUrl);
    }
    
    stopCamera();
    setCapturingPhoto(false);
    
    // Capture location when photo is taken, mirroring add-client logic
    try {
      setIsCapturingLocation(true);
      let position: GeolocationPosition;

      if (prewarmPosition) {
        position = prewarmPosition;
      } else {
        toast({
          title: 'Getting location...',
          description: 'Please wait while we capture your current location.'
        });
        position = await getCurrentLocation();
      }

      const locationData = await processTaskLocation(position);
      setPrewarmPosition(null);

      if (locationData && selectedClient && selectedClient.location_latitude && selectedClient.location_longitude) {
        const distance = calculateDistance(
          locationData.latitude,
          locationData.longitude,
          selectedClient.location_latitude,
          selectedClient.location_longitude
        );

        if (distance > 100) {
          toast({
            title: 'Location Mismatch',
            description: `You are ${Math.round(distance)}m away from the client's location. Please ensure you are at the correct location.`,
            variant: 'destructive'
          });
        } else {
          toast({
            title: 'Location Verified',
            description: `Location confirmed. You are ${Math.round(distance)}m from the client's location.`
          });
        }
      }

      // Prewarm again in case the user needs to retake the photo
      startLocationPrewarm();
    } catch (error: any) {
      console.error('Error capturing location:', error);
      toast({
        title: 'Location Error',
        description: error.message || 'Failed to capture location. Please ensure location permissions are enabled.',
        variant: 'destructive'
      });
    } finally {
      setIsCapturingLocation(false);
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

  return (
    <div className="p-3 sm:p-4 md:p-6 lg:p-8 space-y-3 sm:space-y-4 md:space-y-6 overflow-x-hidden max-w-full">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold">Calendar</h1>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-xs sm:text-sm md:text-base text-muted-foreground">Manage your tasks and schedule</p>
              {realtimeEnabled && (
                <div className="flex items-center gap-1 text-green-600 shrink-0">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-[10px] sm:text-xs font-medium">Live</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Add Daily Task Button - Full width on mobile */}
          <Dialog open={showAddTaskDialog} onOpenChange={(open) => {
            setShowAddTaskDialog(open);
            if (open) {
              // Fetch clients when dialog opens
              fetchClients();
              // Set system time when opening the dialog (only once, won't update when system time changes)
              const now = new Date();
              const hours = now.getHours().toString().padStart(2, '0');
              const minutes = now.getMinutes().toString().padStart(2, '0');
              setDailyTaskForm(prev => ({
                ...prev,
                time: `${hours}:${minutes}`
              }));
              startLocationPrewarm();
            } else {
              // Reset form when closing dialog
              setDailyTaskForm({
                title: '',
                description: '',
                date: new Date().toISOString().split('T')[0],
                time: '',
                notes: ''
              });
              setDailyTaskPhoto(null);
              setTaskLocation(null);
              setSelectedClient(null);
              setClientPopoverOpen(false);
              setPrewarmPosition(null);
              setIsPrewarmingLocation(false);
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-full sm:w-auto min-h-[44px] sm:min-h-0">
                <Plus className="h-4 w-4 mr-2" />
                <span className="text-sm sm:text-base">Add Daily Task</span>
              </Button>
            </DialogTrigger>
            <DialogContent 
              className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto"
              onInteractOutside={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle className="text-lg sm:text-xl">Create Daily Task</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Camera View */}
                {showCamera && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Camera</Label>
                    
                    <div className="relative bg-black rounded-lg overflow-hidden aspect-[4/3]">
                      {!stream && (
                        <div className="flex items-center justify-center h-full text-white">
                          <div className="text-center">
                            <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                            <p>Loading camera...</p>
                          </div>
                        </div>
                      )}
                      
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-full object-cover"
                        style={{ display: stream ? 'block' : 'none' }}
                      />
                      
                      <div className="absolute top-2 right-2 flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="bg-white/80 hover:bg-white"
                          onClick={switchCamera}
                          title={`Switch to ${facingMode === 'user' ? 'back' : 'front'} camera`}
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-3">
                        <Button
                          variant="destructive"
                          size="icon"
                          className="bg-white/80 hover:bg-white"
                          onClick={stopCamera}
                        >
                          <X className="h-5 w-5" />
                        </Button>
                        <Button
                          size="icon"
                          className="h-14 w-14 rounded-full bg-white shadow-lg"
                          onClick={capturePhoto}
                          disabled={capturingPhoto || !stream}
                        >
                          <div className="h-12 w-12 rounded-full border-4 border-gray-300"></div>
                        </Button>
                        <div className="w-12"></div>
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground text-center">
                      {facingMode === 'user' ? 'Front Camera' : 'Back Camera'}
                    </p>
                  </div>
                )}

                {/* Client Selection - Required */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    Client *
                    {selectedClient && selectedClient.city && (
                      <span className="text-xs text-muted-foreground ml-2">📍 {selectedClient.city}</span>
                    )}
                  </Label>
                  <Popover open={clientPopoverOpen} onOpenChange={setClientPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={clientPopoverOpen}
                        className="w-full justify-between min-h-[44px]"
                      >
                        {selectedClient ? (
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="truncate font-medium">{selectedClient.name}</span>
                            {selectedClient.company && (
                              <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                                ({selectedClient.company})
                              </span>
                            )}
                            {selectedClient.city && (
                              <span className="text-xs text-muted-foreground hidden md:inline">
                                📍 {selectedClient.city}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Select client...</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search clients by name, company, or email..." />
                        <CommandList>
                          <CommandEmpty>No clients found.</CommandEmpty>
                          <CommandGroup>
                            {clients.map((client) => (
                              <CommandItem
                                key={client.id}
                                value={`${client.name} ${client.company || ''} ${client.email || ''} ${client.city || ''}`}
                                onSelect={() => {
                                  setSelectedClient(client);
                                  setClientPopoverOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${
                                    selectedClient?.id === client.id ? 'opacity-100' : 'opacity-0'
                                  }`}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{client.name}</p>
                                  {client.company && (
                                    <p className="text-xs text-muted-foreground truncate">{client.company}</p>
                                  )}
                                  {client.city && (
                                    <p className="text-xs text-muted-foreground">📍 {client.city}</p>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  
                  {/* Selected Client Info */}
                  {selectedClient && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-1">
                      <p className="font-semibold text-sm">{selectedClient.name}</p>
                      {selectedClient.company && (
                        <p className="text-xs text-muted-foreground">Company: {selectedClient.company}</p>
                      )}
                      {selectedClient.city && (
                        <p className="text-xs text-muted-foreground">📍 City: <span className="font-medium">{selectedClient.city}</span></p>
                      )}
                      {selectedClient.address && (
                        <p className="text-xs text-muted-foreground">Address: {selectedClient.address}</p>
                      )}
                      {selectedClient.email && (
                        <p className="text-xs text-muted-foreground">Email: {selectedClient.email}</p>
                      )}
                      {selectedClient.phone && (
                        <p className="text-xs text-muted-foreground">Phone: {selectedClient.phone}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Photo Preview */}
                {!showCamera && (
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Photo *</Label>
                    <p className="text-xs text-muted-foreground">
                      Take a photo for this task (required)
                      {selectedClient && ' - Location will be captured and validated against client location'}
                    </p>
                    
                    {!dailyTaskPhoto && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={startCamera}
                        className="w-full min-h-[44px]"
                        disabled={isCapturingLocation}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        {isCapturingLocation ? 'Capturing Location...' : 'Take Photo'}
                      </Button>
                    )}
                    
                    {isPrewarmingLocation && !dailyTaskPhoto && (
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Preparing GPS for accurate location...
                      </p>
                    )}
                    
                    {dailyTaskPhoto && (
                      <div className="relative">
                        <img
                          src={dailyTaskPhoto}
                          alt="Task attachment preview"
                          className="w-full h-64 object-cover rounded-lg border"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={() => {
                            removeTaskPhoto();
                            setTaskLocation(null);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={startCamera}
                          className="w-full mt-2"
                          disabled={isCapturingLocation}
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Retake Photo
                        </Button>
                        
                        {/* Location Info */}
                        {taskLocation && (
                          <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs">
                            <p className="font-medium text-green-800">📍 Location Captured</p>
                            <p className="text-green-700">Accuracy: ±{Math.round(taskLocation.accuracy)}m</p>
                            <p className="text-green-700 truncate">{taskLocation.address}</p>
                            {taskLocation.city && (
                              <p className="text-green-700 truncate">City: {taskLocation.city}</p>
                            )}
                            {selectedClient && selectedClient.location_latitude && selectedClient.location_longitude && (
                              (() => {
                                const distance = calculateDistance(
                                  taskLocation.latitude,
                                  taskLocation.longitude,
                                  selectedClient.location_latitude!,
                                  selectedClient.location_longitude!
                                );
                                return (
                                  <p className={`font-medium mt-1 ${distance <= 100 ? 'text-green-700' : 'text-orange-600'}`}>
                                    {distance <= 100 
                                      ? `✓ Verified: ${Math.round(distance)}m from client location`
                                      : `⚠ Warning: ${Math.round(distance)}m from client location`
                                    }
                                  </p>
                                );
                              })()
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Task Title */}
                <div className="space-y-2">
                  <Label>Task Title *</Label>
                  <Input 
                    placeholder="Enter task title" 
                    value={dailyTaskForm.title}
                    onChange={(e) => setDailyTaskForm({ ...dailyTaskForm, title: e.target.value })}
                  />
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
                    <Label className="flex items-center gap-2 text-sm">
                      Date
                      <Badge variant="secondary" className="text-xs">Today Only</Badge>
                    </Label>
                    <Input 
                      type="date"
                      value={dailyTaskForm.date}
                      readOnly
                      disabled
                      className="bg-gray-50 cursor-not-allowed text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      Time
                      <Badge variant="secondary" className="text-xs">Auto</Badge>
                    </Label>
                    <Input 
                      type="time"
                      value={dailyTaskForm.time}
                      readOnly
                      disabled
                      className="bg-gray-50 cursor-not-allowed text-sm"
                    />
                  </div>
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
                  disabled={isUploading || !dailyTaskForm.title.trim() || !dailyTaskPhoto || !selectedClient}
                >
                  {isUploading ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                      Creating...
                    </>
                  ) : (
                    'Create Task'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Mobile Tab Navigation */}
          {isMobile ? (
            <div className="flex w-full">
              <div className="flex border rounded-lg w-full min-h-[44px]">
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
                        className={`py-2.5 sm:py-3 text-sm sm:text-base border-r last:border-r-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 transition-colors min-h-[44px] sm:min-h-[48px] active:scale-95 ${
                          isSelected ? 'bg-primary text-primary-foreground font-semibold' : isToday ? 'bg-muted font-semibold' : 'hover:bg-muted/50'
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
                      className={`cursor-pointer transition-all hover:shadow-sm active:scale-[0.98] border-l-4 ${
                        event.taskData?.priority === 'urgent' ? 'border-l-red-500 bg-red-50' :
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
                                <h4 className={`font-medium text-sm leading-tight truncate ${
                                  event.taskData?.status === 'completed' ? 'line-through text-muted-foreground' : ''
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
                    className={`min-h-[120px] p-2 border rounded-lg cursor-pointer transition-all duration-200 hover:bg-accent/50 ${
                      day.isCurrentMonth ? 'bg-background' : 'bg-muted/50'
                    } ${day.isToday ? 'ring-2 ring-primary' : ''} ${
                      isClicked ? 'bg-primary/10 border-primary ring-2 ring-primary/20' : ''
                    }`}
                    onClick={() => handleDayClick(day.date)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`text-sm font-medium ${
                        day.isCurrentMonth ? 'text-foreground' : 'text-muted-foreground'
                      } ${day.isToday ? 'text-primary font-bold' : ''} ${
                        isClicked ? 'text-primary font-bold' : ''
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
                      className={`text-center p-2 border rounded-lg cursor-pointer transition-all duration-200 hover:bg-accent/50 ${
                        day.isToday ? 'bg-primary text-primary-foreground' : 'bg-muted'
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
                          className={`cursor-pointer transition-all hover:shadow-md hover:scale-105 border-l-4 ${
                            event.taskData?.priority === 'urgent' ? 'border-l-red-500 bg-red-50' :
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
                          className={`cursor-pointer transition-all hover:shadow-md hover:scale-105 border-l-4 ${
                            event.taskData?.priority === 'urgent' ? 'border-l-red-500 bg-red-50' :
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

    </div>
  );
}
