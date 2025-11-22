import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Edit, Trash2, Building, Camera, Upload, X, MapPin, RefreshCw, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { subscribeToTable, unsubscribe } from '@/lib/realtime.helpers';
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

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  city?: string;
  totalOrders: number;
  lastOrder: string;
  photo?: string; // Base64 image data
  photoTimestamp?: string; // When the photo was taken
  address?: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    capturedAt: string;
  };
  account_type?: 'Key Accounts' | 'Standard Accounts';
  category?: 'Permanently Closed' | 'Renovating' | 'Open';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  approvalRequestedAt?: string;
  approvedAt?: string;
  approvalNotes?: string;
  approvedBy?: string | null;
  status?: 'active' | 'inactive';
}

export default function MyClientsPage() {
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newClientPhoto, setNewClientPhoto] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    city: '',
    address: '',
    account_type: 'Standard Accounts' as 'Key Accounts' | 'Standard Accounts',
    category: 'Open' as 'Permanently Closed' | 'Renovating' | 'Open'
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [capturedLocation, setCapturedLocation] = useState<{
    latitude: number;
    longitude: number;
    address: string;
    accuracy: number;
  } | null>(null);
  const [isPrewarmingLocation, setIsPrewarmingLocation] = useState(false);
  const [prewarmPosition, setPrewarmPosition] = useState<GeolocationPosition | null>(null);
  const [agentCities, setAgentCities] = useState<string[]>([]);
  
  // Edit Dialog States
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState({
    photo: '',
    name: '',
    company: '',
    email: '',
    phone: '',
    account_type: 'Standard Accounts' as 'Key Accounts' | 'Standard Accounts',
    category: 'Open' as 'Permanently Closed' | 'Renovating' | 'Open'
  });
  
  // Edit Photo States
  const [editPhoto, setEditPhoto] = useState<string | null>(null);
  const [isEditCameraOpen, setIsEditCameraOpen] = useState(false);
  const [editStream, setEditStream] = useState<MediaStream | null>(null);
  const [isEditCameraLoading, setIsEditCameraLoading] = useState(false);
  const editVideoRef = useRef<HTMLVideoElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  
  // Delete Confirmation States
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  
  // Update Confirmation States
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);
  
  // View Dialog States
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  
  const { toast } = useToast();

  // Fetch clients from Supabase
  useEffect(() => {
    fetchClients();
    fetchAgentCities();

    // Real-time subscriptions: refresh when clients or orders change
    const channels = [
      subscribeToTable('clients', () => fetchClients()),
      subscribeToTable('client_orders', () => fetchClients()),
    ];

    return () => channels.forEach(unsubscribe);
  }, [user?.id]);

  // Fetch agent's cities from profile
  const fetchAgentCities = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('city')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      // Parse comma-separated cities
      const cities = data?.city 
        ? data.city.split(',').map(c => c.trim()).filter(c => c.length > 0)
        : [];
      
      setAgentCities(cities);
    } catch (error) {
      console.error('Error fetching agent cities:', error);
      // Don't show error toast as this is not critical for initial load
    }
  };

  const fetchClients = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('agent_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch per-client stats from view for this agent
      const { data: statsView } = await supabase
        .from('client_order_stats')
        .select('client_id, agent_id, total_orders, last_order_date')
        .eq('agent_id', user.id);

      const statsByClient = (statsView || []).reduce((acc: any, r: any) => {
        acc[r.client_id] = {
          totalOrders: Number(r.total_orders) || 0,
          lastOrder: r.last_order_date || null,
        };
        return acc;
      }, {} as Record<string, { totalOrders: number; lastOrder: string | null }>);

      const formattedClients: Client[] = (data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email || '',
        phone: c.phone || '',
        company: c.company || '',
        city: c.city || '',
        account_type: c.account_type || 'Standard Accounts',
        category: c.category || 'Open',
        address: c.address || '',
        totalOrders: statsByClient[c.id]?.totalOrders ?? c.total_orders ?? 0,
        lastOrder: statsByClient[c.id]?.lastOrder ?? c.last_order_date ?? new Date().toISOString().split('T')[0],
        photo: c.photo_url,
        photoTimestamp: c.photo_timestamp || c.created_at,
        location: c.location_latitude && c.location_longitude ? {
          latitude: c.location_latitude,
          longitude: c.location_longitude,
          accuracy: c.location_accuracy || 0,
          capturedAt: c.location_captured_at || c.created_at
        } : undefined,
        approvalStatus: (c.approval_status || 'approved') as Client['approvalStatus'],
        approvalRequestedAt: c.approval_requested_at || undefined,
        approvedAt: c.approved_at || undefined,
        approvalNotes: c.approval_notes || undefined,
        approvedBy: c.approved_by || null,
        status: c.status || undefined
      }));

      setClients(formattedClients);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: 'Error',
        description: 'Failed to load clients',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.company.toLowerCase().includes(searchQuery.toLowerCase())
  );

const getApprovalStatusBadge = (status: Client['approvalStatus']) => {
  switch (status) {
    case 'approved':
      return { label: 'Approved', className: 'bg-green-50 text-green-700 border-green-200' };
    case 'rejected':
      return { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' };
    default:
      return { label: 'Pending Approval', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' };
  }
};

  const handleOpenView = (client: Client) => {
    setViewingClient(client);
    setViewDialogOpen(true);
  };

  const handleOpenEdit = (client: Client) => {
    setEditingClient(client);
    setEditForm({
      photo: client.photo || '',
      name: client.name,
      company: client.company,
      email: client.email,
      phone: client.phone,
      account_type: client.account_type || 'Standard Accounts',
      category: client.category || 'Open'
    });
    setEditPhoto(client.photo || null);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingClient) return;
    
    if (!editForm.name.trim() || !editForm.company.trim() || !editForm.email.trim() || !editForm.phone.trim()) {
      toast({ title: 'Error', description: 'All fields except photo are required', variant: 'destructive' });
      return;
    }
    
    setUpdateConfirmOpen(true);
  };

  const handleConfirmUpdate = async () => {
    if (!editingClient) return;
    
    try {
      // Handle photo upload if there's a new photo
      let photoUrl = editForm.photo;
      
      if (editPhoto && editPhoto !== editingClient.photo) {
        // Convert base64 to blob
        const base64Data = editPhoto.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        // Generate unique filename
        const sanitizeName = (str: string) => {
          return str
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        };
        
        const clientName = sanitizeName(editForm.name || 'client');
        const timestamp = Date.now();
        const fileName = `${user?.id}/${clientName}_${timestamp}.jpg`;
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('client-photos')
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
          .from('client-photos')
          .getPublicUrl(fileName);
        
        photoUrl = urlData.publicUrl;
      } else if (editPhoto === null) {
        // Photo was removed
        photoUrl = null;
      }

      const { error } = await supabase
        .from('clients')
        .update({
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone || null,
          company: editForm.company || null,
          account_type: editForm.account_type,
          category: editForm.category,
          photo_url: photoUrl,
          photo_timestamp: photoUrl ? new Date().toISOString() : null,
        } as any)
        .eq('id', editingClient.id);

      if (error) throw error;

      toast({ 
        title: 'Success', 
        description: `${editForm.name} has been updated successfully` 
      });
      
      setUpdateConfirmOpen(false);
      setEditDialogOpen(false);
      setEditingClient(null);
      setEditPhoto(null);
      
      // Real-time will handle updating the list
    } catch (error) {
      console.error('Error updating client:', error);
      toast({
        title: 'Error',
        description: 'Failed to update client. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleOpenDelete = (client: Client) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!clientToDelete) return;
    
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientToDelete.id);

      if (error) throw error;

      toast({ 
        title: 'Success', 
        description: `${clientToDelete.name} has been removed from your client list` 
      });
      
      setDeleteDialogOpen(false);
      setClientToDelete(null);
      
      // Real-time will handle updating the list
    } catch (error) {
      console.error('Error deleting client:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete client. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ 
          title: 'Error', 
          description: 'Image size should be less than 5MB',
          variant: 'destructive'
        });
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        setNewClientPhoto(reader.result as string);
        
        // Use pre-warmed location if available, otherwise get fresh
        try {
          let position: GeolocationPosition;
          
          if (prewarmPosition) {
            console.log('Using pre-warmed location for upload');
            position = prewarmPosition;
          } else {
            toast({
              title: 'Getting location...',
              description: 'Capturing your current location.'
            });
            position = await getCurrentLocation();
          }
          
          await processLocationAndAddress(position);
        } catch (error) {
          console.error('Location error:', error);
          toast({
            title: 'Location Unavailable',
            description: 'Could not get location. Please enter address manually.',
            variant: 'destructive'
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const openCamera = async () => {
    setIsCameraLoading(true);
    try {
      // Try with facingMode first, fallback to basic video if that fails
      let mediaStream: MediaStream | null = null;
      
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        });
      } catch (err) {
        // Fallback to any available camera
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: true 
        });
      }
      
      if (mediaStream) {
        setStream(mediaStream);
        setIsCameraOpen(true);
        
        // Wait for next tick to ensure video element is rendered
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
            // Explicitly play the video
            videoRef.current.play().catch(err => {
              // Ignore AbortError (happens when camera is being initialized)
              if (err.name !== 'AbortError') {
                console.error('Error playing video:', err);
              }
            });
          }
          setIsCameraLoading(false);
        }, 100);
      } else {
        setIsCameraLoading(false);
      }
    } catch (error) {
      console.error('Camera error:', error);
      setIsCameraLoading(false);
      toast({
        title: 'Camera Error',
        description: 'Unable to access camera. Please check permissions and ensure your device has a camera.',
        variant: 'destructive'
      });
    }
  };

  // Ensure video plays when stream is set
  useEffect(() => {
    if (isCameraOpen && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => {
        console.error('Error playing video:', err);
      });
    }
  }, [isCameraOpen, stream]);

  const getCurrentLocation = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position),
        (error) => reject(error),
        {
          enableHighAccuracy: true,
          timeout: 30000, // Increased to 30 seconds
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
      console.log('Location pre-warmed:', position.coords.accuracy, 'meters accuracy');
    } catch (error) {
      console.error('Pre-warm location error:', error);
    } finally {
      setIsPrewarmingLocation(false);
    }
  };

  // Get accuracy badge info based on meters
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
    } else {
      return { 
        label: 'Poor', 
        color: 'bg-red-50 text-red-700 border-red-200',
        icon: '⚠️'
      };
    }
  };

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
        // Extract city from various possible fields
        const addr = data.address;
        const city = addr.city || addr.town || addr.village || addr.municipality || '';
        
        // Construct full address
        const parts = [
          addr.house_number,
          addr.road,
          addr.suburb || addr.neighbourhood,
          addr.city || addr.town || addr.village,
          addr.state,
          addr.country
        ].filter(Boolean);
        
        return {
          address: parts.join(', '),
          city: city
        };
      } else if (data && data.display_name) {
        return {
          address: data.display_name,
          city: ''
        };
      }
      
      return {
        address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        city: ''
      };
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return {
        address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        city: ''
      };
    }
  };

  const processLocationAndAddress = async (position: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = position.coords;
    
    // Get address and city from coordinates
    const { address, city } = await reverseGeocode(latitude, longitude);
    
    // Auto-fill the address and city fields
    setFormData(prev => ({ ...prev, address, city }));
    setCapturedLocation({ latitude, longitude, address, accuracy });
    
    const badge = getAccuracyBadge(accuracy);
    toast({
      title: 'Location Captured',
      description: `${badge.icon} ${badge.label} (±${Math.round(accuracy)}m)`,
    });
  };

  const capturePhoto = async () => {
    if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setNewClientPhoto(imageData);
        closeCamera();

        // Use pre-warmed location if available, otherwise get fresh
        try {
          let position: GeolocationPosition;
          
          if (prewarmPosition) {
            console.log('Using pre-warmed location');
            position = prewarmPosition;
          } else {
            toast({
              title: 'Getting location...',
              description: 'Please wait while we capture your current location.'
            });
            position = await getCurrentLocation();
          }
          
          await processLocationAndAddress(position);
        } catch (error) {
          console.error('Location error:', error);
          toast({
            title: 'Location Unavailable',
            description: 'Could not get location. Please enter address manually.',
            variant: 'destructive'
          });
        }
      }
    } else {
      toast({
        title: 'Camera Not Ready',
        description: 'Please wait for the camera to fully initialize before capturing.',
        variant: 'destructive'
      });
    }
  };

  const retryLocation = async () => {
    toast({
      title: 'Retrying Location...',
      description: 'Getting a more accurate location.'
    });

    try {
      const position = await getCurrentLocation();
      await processLocationAndAddress(position);
    } catch (error) {
      console.error('Retry location error:', error);
      toast({
        title: 'Location Error',
        description: 'Still unable to get location. Please enter address manually.',
        variant: 'destructive'
      });
    }
  };

  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
    setIsCameraLoading(false);
  };

  const removePhoto = () => {
    setNewClientPhoto(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Edit Photo Functions
  const openEditCamera = async () => {
    setIsEditCameraLoading(true);
    try {
      let mediaStream: MediaStream | null = null;
      
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        });
      } catch (err) {
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: true 
        });
      }
      
      if (mediaStream) {
        setEditStream(mediaStream);
        setIsEditCameraOpen(true);
        
        setTimeout(() => {
          if (editVideoRef.current) {
            editVideoRef.current.srcObject = mediaStream;
            editVideoRef.current.play().catch(err => {
              if (err.name !== 'AbortError') {
                console.error('Error playing video:', err);
              }
            });
          }
          setIsEditCameraLoading(false);
        }, 100);
      } else {
        setIsEditCameraLoading(false);
      }
    } catch (error) {
      console.error('Camera error:', error);
      setIsEditCameraLoading(false);
      toast({
        title: 'Camera Error',
        description: 'Unable to access camera. Please check permissions.',
        variant: 'destructive'
      });
    }
  };

  const captureEditPhoto = async () => {
    if (editVideoRef.current && editVideoRef.current.videoWidth > 0 && editVideoRef.current.videoHeight > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = editVideoRef.current.videoWidth;
      canvas.height = editVideoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(editVideoRef.current, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        setEditPhoto(imageData);
        closeEditCamera();
        toast({
          title: 'Photo Captured',
          description: 'New photo captured successfully',
        });
      }
    } else {
      toast({
        title: 'Camera Not Ready',
        description: 'Please wait for the camera to fully initialize.',
        variant: 'destructive'
      });
    }
  };

  const closeEditCamera = () => {
    if (editStream) {
      editStream.getTracks().forEach(track => track.stop());
      setEditStream(null);
    }
    setIsEditCameraOpen(false);
    setIsEditCameraLoading(false);
  };

  const handleEditFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ 
          title: 'Error', 
          description: 'Image size should be less than 5MB',
          variant: 'destructive'
        });
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditPhoto(reader.result as string);
        toast({
          title: 'Photo Uploaded',
          description: 'New photo uploaded successfully',
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeEditPhoto = () => {
    setEditPhoto(null);
    if (editFileInputRef.current) {
      editFileInputRef.current.value = '';
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      company: '',
      email: '',
      phone: '',
      city: '',
      address: '',
      account_type: 'Standard Accounts',
      category: 'Open'
    });
    setNewClientPhoto(null);
    setCapturedLocation(null);
    setPrewarmPosition(null);
    setIsPrewarmingLocation(false);
    closeCamera();
  };

  const handleAddClient = async () => {
    if (!formData.name || !formData.email) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in at least Name and Email',
        variant: 'destructive'
      });
      return;
    }

    if (!newClientPhoto) {
      toast({
        title: 'Photo Required',
        description: 'Please take a photo or upload one for verification',
        variant: 'destructive'
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'User not authenticated',
        variant: 'destructive'
      });
      return;
    }

    let cityMatches = true;
    let clientCityValue = formData.city?.trim() || '';
    if (agentCities.length > 0) {
      if (!clientCityValue) {
        toast({
          title: 'City Required',
          description: `Please enter a city. It must be one of: ${agentCities.join(', ')}`,
          variant: 'destructive'
        });
        return;
      }

      const normalizedClientCity = clientCityValue.toLowerCase();
      const normalizedAgentCities = agentCities
        .map(city => city.toLowerCase().trim())
        .filter(Boolean);

      cityMatches = normalizedAgentCities.includes(normalizedClientCity);

      if (!cityMatches) {
        toast({
          title: 'Client Pending Approval',
          description: `"${clientCityValue}" is outside your assigned cities. The client will require admin approval before you can create orders.`,
        });
      }
    } else {
      // Agent has no cities assigned - they cannot add clients
      toast({
        title: 'No Cities Assigned',
        description: 'You cannot add clients until your administrator assigns you to at least one city.',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Upload photo to Supabase Storage
      let photoUrl = null;
      
      if (newClientPhoto) {
        // Convert base64 to blob
        const base64Data = newClientPhoto.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        // Generate unique filename with user folder structure and client info
        // Sanitize name and company for filename (remove special chars, replace spaces with underscores)
        const sanitizeName = (str: string) => {
          return str
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')  // Replace non-alphanumeric with underscore
            .replace(/_+/g, '_')          // Replace multiple underscores with single
            .replace(/^_|_$/g, '');       // Remove leading/trailing underscores
        };
        
        const clientName = sanitizeName(formData.name || 'client');
        const clientCompany = sanitizeName(formData.company || 'company');
        const timestamp = Date.now();
        
        const fileName = `${user.id}/${clientName}_${clientCompany}_${timestamp}.jpg`;
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('client-photos')
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
          .from('client-photos')
          .getPublicUrl(fileName);
        
        photoUrl = urlData.publicUrl;
      }

      const nowIso = new Date().toISOString();
      const approvalStatus = cityMatches ? 'approved' : 'pending';
      const approvalRequestedAt = cityMatches ? null : nowIso;
      const approvalNotes = cityMatches ? null : `City "${clientCityValue || 'N/A'}" outside assigned cities: ${agentCities.join(', ')}`;
      const approvedAt = cityMatches ? nowIso : null;

      // Save client to database
      const { data, error } = await supabase
        .from('clients')
        .insert({
          agent_id: user.id,
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          company: formData.company || null,
          city: formData.city || null,
          address: formData.address || null,
          account_type: formData.account_type,
          category: formData.category,
          photo_url: photoUrl,
          photo_timestamp: photoUrl ? new Date().toISOString() : null,
          location_latitude: capturedLocation?.latitude || null,
          location_longitude: capturedLocation?.longitude || null,
          location_accuracy: capturedLocation?.accuracy || null,
          location_captured_at: capturedLocation ? new Date().toISOString() : null,
          approval_status: approvalStatus,
          approval_requested_at: approvalRequestedAt,
          approval_notes: approvalNotes,
          approved_at: approvedAt,
          approved_by: null,
          status: 'active'
        } as any)
        .select()
        .single();

      if (error) throw error;

      toast({ 
        title: approvalStatus === 'approved' ? 'Client Added' : 'Client Pending Approval', 
        description: approvalStatus === 'approved'
          ? (capturedLocation 
              ? 'Client added successfully with photo and location verification.' 
              : 'Client added successfully with photo verification.')
          : 'Client added and sent for admin approval. You will not be able to create orders for this client until approval is granted.'
      });
      
      resetForm();
      setIsDialogOpen(false);
      
      // Real-time will handle updating the list
    } catch (error: any) {
      console.error('Error adding client:', error);
      const errorMessage = error?.message || error?.error_description || 'Failed to add client';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-muted-foreground">Loading clients...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">My Clients</h1>
          <p className="text-sm md:text-base text-muted-foreground">Manage your client relationships</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (open) {
            // Pre-warm GPS when dialog opens
            startLocationPrewarm();
          } else {
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto shrink-0">
              <Plus className="h-4 w-4" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Photo Section */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Client Photo / Proof of Identity *</Label>
                <p className="text-xs text-muted-foreground">Required for verification - Take a photo or upload an existing one</p>
                
                {!newClientPhoto && !isCameraOpen && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={openCamera}
                      className="flex-1"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Open Camera
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Photo
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                )}

                {isCameraOpen && (
                  <div className="space-y-2">
                    <div className="relative rounded-lg overflow-hidden bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-64 object-cover"
                        onLoadedMetadata={() => {
                          // Ensure video plays once metadata is loaded
                          if (videoRef.current) {
                            videoRef.current.play().catch(err => {
                              console.error('Error playing video:', err);
                            });
                            setIsCameraLoading(false);
                          }
                        }}
                      />
                      {isCameraLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <div className="text-center text-white">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                            <p className="text-sm">Initializing camera...</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={capturePhoto}
                        className="flex-1"
                        disabled={isCameraLoading}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Capture Photo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={closeCamera}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {newClientPhoto && !isCameraOpen && (
                  <div className="relative">
                    <img
                      src={newClientPhoto}
                      alt="Client preview"
                      className="w-full h-64 object-cover rounded-lg border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={removePhoto}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="mt-2 text-xs text-green-600 font-medium">
                      ✓ Photo captured: {new Date().toLocaleString()}
                    </div>
                  </div>
                )}
              </div>

              {/* Client Information Fields */}
              <div className="space-y-2">
                <Label>Client Name *</Label>
                <Input 
                  placeholder="Enter client name" 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input 
                  placeholder="Company name" 
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input 
                  type="email" 
                  placeholder="client@company.com" 
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input 
                  placeholder="555-0000" 
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  City
                  <span className="text-xs text-muted-foreground ml-2">(Auto-filled from location)</span>
                  {agentCities.length > 0 && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (Must be: {agentCities.join(', ')})
                    </span>
                  )}
                </Label>
                <Input 
                  placeholder="City will be auto-filled when location is captured" 
                  value={formData.city}
                  disabled
                  readOnly
                  className="bg-muted cursor-not-allowed"
                />
                {!capturedLocation && (
                  <p className="text-xs text-muted-foreground">
                    📍 Capture location to auto-fill city
                  </p>
                )}
                {capturedLocation && formData.city && agentCities.length > 0 && (() => {
                  const clientCity = formData.city.trim().toLowerCase();
                  const normalizedAgentCities = agentCities.map(c => c.toLowerCase());
                  const cityMatches = normalizedAgentCities.includes(clientCity);
                  return cityMatches ? (
                    <p className="text-xs text-green-600">✓ City matches your assigned cities</p>
                  ) : (
                    <p className="text-xs text-destructive">
                      ⚠ City "{formData.city}" does not match your assigned cities: {agentCities.join(', ')}
                    </p>
                  );
                })()}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  Address
                  {isPrewarmingLocation && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                      <div className="animate-pulse">🌍 Pre-warming GPS...</div>
                    </Badge>
                  )}
                  {capturedLocation && (
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${getAccuracyBadge(capturedLocation.accuracy).color}`}
                    >
                      <MapPin className="h-3 w-3 mr-1" />
                      {getAccuracyBadge(capturedLocation.accuracy).icon} {getAccuracyBadge(capturedLocation.accuracy).label} (±{Math.round(capturedLocation.accuracy)}m)
                    </Badge>
                  )}
                </Label>
                <div className="flex gap-2">
                  <Input 
                    placeholder={capturedLocation ? "Auto-filled from location" : "Address will be auto-filled when location is captured"} 
                    value={formData.address}
                    disabled
                    readOnly
                    className={`bg-muted cursor-not-allowed ${capturedLocation ? (
                      capturedLocation.accuracy <= 100 ? "border-green-300" : 
                      capturedLocation.accuracy <= 500 ? "border-yellow-300" : "border-red-300"
                    ) : ""}`}
                  />
                  {capturedLocation && capturedLocation.accuracy > 100 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={retryLocation}
                      title="Retry for better accuracy"
                      className="shrink-0"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {capturedLocation && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>📍 Lat: {capturedLocation.latitude.toFixed(6)}, Lon: {capturedLocation.longitude.toFixed(6)}</p>
                    {capturedLocation.accuracy > 100 && (
                      <p className="text-yellow-600 font-medium">
                        ⚠ Low accuracy detected. Click retry button for better location.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Type Of Account</Label>
                <Select
                  value={formData.account_type}
                  onValueChange={(value: 'Key Accounts' | 'Standard Accounts') => 
                    setFormData({ ...formData, account_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard Accounts">Standard Accounts</SelectItem>
                    <SelectItem value="Key Accounts">Key Accounts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value: 'Permanently Closed' | 'Renovating' | 'Open') => 
                    setFormData({ ...formData, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="Renovating">Renovating</SelectItem>
                    <SelectItem value="Permanently Closed">Permanently Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={handleAddClient}>
                Add Client
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Clients</p>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{clients.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Total Orders</p>
            <Building className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">
              {clients.reduce((sum, c) => sum + c.totalOrders, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Active This Month</p>
            <Building className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{clients.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {filteredClients.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">No clients found</div>
            ) : (
              filteredClients.map((client) => (
                <div key={client.id} className="rounded-lg border bg-background p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{client.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{client.company}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className={`border ${getApprovalStatusBadge(client.approvalStatus).className}`}>
                        {getApprovalStatusBadge(client.approvalStatus).label}
                      </Badge>
                      <Badge variant="secondary">{client.totalOrders} orders</Badge>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Email</div>
                      <div className="truncate">{client.email}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Last Order</div>
                      <div>{new Date(client.lastOrder).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenView(client)}>
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(client)}>
                      <Edit className="h-4 w-4 mr-1" /> Edit
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop/Tablet: table */}
          <div className="hidden md:block w-full overflow-x-auto">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">Photo</TableHead>
                <TableHead className="text-center">Name</TableHead>
                <TableHead className="text-center">Company</TableHead>
                <TableHead className="text-center">Email</TableHead>
                <TableHead className="text-center">Phone</TableHead>
                <TableHead className="text-center">Total Orders</TableHead>
                <TableHead className="text-center">Last Order</TableHead>
                <TableHead className="text-center">Approval</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="text-center">
                    {client.photo ? (
                      <div className="relative group">
                        <img 
                          src={client.photo} 
                          alt={client.name}
                          className="w-10 h-10 rounded-full object-cover border-2 border-primary cursor-pointer"
                          title="Click to view full size"
                          onClick={() => {
                            const newWindow = window.open();
                            if (newWindow) {
                              newWindow.document.write(`
                                <html>
                                  <head><title>${client.name} - Photo</title></head>
                                  <body style="margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#000;">
                                    <div style="text-align:center;">
                                      <img src="${client.photo}" style="max-width:100%;max-height:90vh;object-fit:contain;" />
                                      <p style="color:#fff;padding:10px;">Captured: ${client.photoTimestamp ? new Date(client.photoTimestamp).toLocaleString() : 'Unknown'}</p>
                                    </div>
                                  </body>
                                </html>
                              `);
                            }
                          }}
                        />
                        <Camera className="w-4 h-4 absolute -bottom-1 -right-1 bg-primary text-white rounded-full p-0.5" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <Building className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-center">{client.name}</TableCell>
                  <TableCell className="text-center">{client.company}</TableCell>
                  <TableCell className="text-center">{client.email}</TableCell>
                  <TableCell className="text-center">{client.phone}</TableCell>
                  <TableCell className="text-center">{client.totalOrders}</TableCell>
                  <TableCell className="text-center">{new Date(client.lastOrder).toLocaleDateString()}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={`border ${getApprovalStatusBadge(client.approvalStatus).className}`}>
                      {getApprovalStatusBadge(client.approvalStatus).label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenView(client)} title="View Details">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(client)} title="Edit">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDelete(client)} title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* View Client Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Client Details</DialogTitle>
          </DialogHeader>
          {viewingClient && (
            <div className="space-y-6 py-4">
              {/* Client Photo */}
              {viewingClient.photo && (
                <div className="flex justify-center">
                  <div className="relative">
                    <img 
                      src={viewingClient.photo} 
                      alt={viewingClient.name}
                      className="w-48 h-48 rounded-lg object-cover border-4 border-primary shadow-lg"
                    />
                    <Badge className="absolute bottom-2 right-2 bg-primary">
                      <Camera className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  </div>
                </div>
              )}

              {/* Photo Timestamp */}
              {viewingClient.photoTimestamp && (
                <div className="text-center text-sm text-muted-foreground">
                  Photo captured: {new Date(viewingClient.photoTimestamp).toLocaleString()}
                </div>
              )}

              {/* Approval Status */}
              <div className="flex flex-col items-center gap-2">
                <Badge variant="outline" className={`border ${getApprovalStatusBadge(viewingClient.approvalStatus).className}`}>
                  {getApprovalStatusBadge(viewingClient.approvalStatus).label}
                </Badge>
                <div className="text-xs text-muted-foreground text-center space-y-1">
                  {viewingClient.approvalStatus === 'pending' && viewingClient.approvalRequestedAt && (
                    <p>Approval requested on {new Date(viewingClient.approvalRequestedAt).toLocaleString()}</p>
                  )}
                  {viewingClient.approvalStatus === 'approved' && viewingClient.approvedAt && (
                    <p>Approved on {new Date(viewingClient.approvedAt).toLocaleString()}</p>
                  )}
                  {viewingClient.approvalStatus === 'rejected' && viewingClient.approvalNotes && (
                    <p className="text-destructive">Reason: {viewingClient.approvalNotes}</p>
                  )}
                </div>
              </div>

              {/* Client Information */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Client Name</Label>
                  <p className="font-semibold text-lg">{viewingClient.name}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Company</Label>
                  <p className="font-semibold text-lg">{viewingClient.company || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{viewingClient.email}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Phone</Label>
                  <p className="font-medium">{viewingClient.phone || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">City</Label>
                  <p className="font-medium">{viewingClient.city || 'N/A'}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Total Orders</Label>
                  <p className="font-medium">{viewingClient.totalOrders}</p>
                </div>
              </div>

              {/* Address */}
              {viewingClient.address && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Address</Label>
                  <p className="font-medium">{viewingClient.address}</p>
                </div>
              )}

              {/* Location Information */}
              {viewingClient.location && (
                <div className="space-y-3 p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    <Label className="text-lg">Location Verification</Label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Latitude:</span>
                      <p className="font-mono font-medium">{viewingClient.location.latitude.toFixed(6)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Longitude:</span>
                      <p className="font-mono font-medium">{viewingClient.location.longitude.toFixed(6)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Accuracy:</span>
                      <Badge 
                        variant="outline" 
                        className={`${getAccuracyBadge(viewingClient.location.accuracy).color}`}
                      >
                        {getAccuracyBadge(viewingClient.location.accuracy).icon} ±{Math.round(viewingClient.location.accuracy)}m ({getAccuracyBadge(viewingClient.location.accuracy).label})
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Captured:</span>
                      <p className="text-sm">{new Date(viewingClient.location.capturedAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="pt-2">
                    <a 
                      href={`https://www.google.com/maps?q=${viewingClient.location.latitude},${viewingClient.location.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline text-sm font-medium"
                    >
                      📍 View on Google Maps →
                    </a>
                  </div>
                </div>
              )}

              {/* Order History */}
              <div className="space-y-2 p-4 bg-primary/5 rounded-lg">
                <Label className="text-lg">Order History</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-muted-foreground text-sm">Total Orders:</span>
                    <p className="font-bold text-xl text-primary">{viewingClient.totalOrders}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-sm">Last Order:</span>
                    <p className="font-medium">{new Date(viewingClient.lastOrder).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) {
          setEditPhoto(null);
          closeEditCamera();
        }
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Edit Client</DialogTitle>
          </DialogHeader>
          {editingClient && (
            <div className="space-y-4 py-4">
              {/* Photo Section */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Client Photo</Label>
                <p className="text-xs text-muted-foreground">Update, replace, or remove the client photo</p>
                
                {/* Current Photo Display */}
                {editPhoto && !isEditCameraOpen && (
                  <div className="relative">
                    <img
                      src={editPhoto}
                      alt="Client preview"
                      className="w-full h-64 object-cover rounded-lg border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={removeEditPhoto}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="mt-2 text-xs text-green-600 font-medium">
                      ✓ New photo selected
                    </div>
                  </div>
                )}

                {/* Original Photo Display */}
                {!editPhoto && editingClient.photo && !isEditCameraOpen && (
                  <div className="relative">
                    <img
                      src={editingClient.photo}
                      alt="Current client photo"
                      className="w-full h-64 object-cover rounded-lg border"
                    />
                    <div className="mt-2 text-xs text-muted-foreground">
                      Current photo
                    </div>
                  </div>
                )}

                {/* Camera Interface */}
                {isEditCameraOpen && (
                  <div className="space-y-2">
                    <div className="relative rounded-lg overflow-hidden bg-black">
                      <video
                        ref={editVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-64 object-cover"
                        onLoadedMetadata={() => {
                          if (editVideoRef.current) {
                            editVideoRef.current.play().catch(err => {
                              console.error('Error playing video:', err);
                            });
                            setIsEditCameraLoading(false);
                          }
                        }}
                      />
                      {isEditCameraLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <div className="text-center text-white">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                            <p className="text-sm">Initializing camera...</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={captureEditPhoto}
                        className="flex-1"
                        disabled={isEditCameraLoading}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Capture Photo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={closeEditCamera}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Photo Action Buttons */}
                {!isEditCameraOpen && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={openEditCamera}
                      className="flex-1"
                      size="sm"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Take New Photo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => editFileInputRef.current?.click()}
                      className="flex-1"
                      size="sm"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Photo
                    </Button>
                    {(editPhoto || editingClient.photo) && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={removeEditPhoto}
                        className="sm:flex-shrink-0"
                        size="sm"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    )}
                    <input
                      ref={editFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleEditFileUpload}
                      className="hidden"
                    />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Client Name</Label>
                <Input 
                  placeholder="Enter client name" 
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input 
                  placeholder="Company name" 
                  value={editForm.company}
                  onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input 
                  type="email" 
                  placeholder="client@company.com" 
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input 
                  placeholder="555-0000" 
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Type Of Account</Label>
                <Select
                  value={editForm.account_type}
                  onValueChange={(value: 'Key Accounts' | 'Standard Accounts') => 
                    setEditForm({ ...editForm, account_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard Accounts">Standard Accounts</SelectItem>
                    <SelectItem value="Key Accounts">Key Accounts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={editForm.category}
                  onValueChange={(value: 'Permanently Closed' | 'Renovating' | 'Open') => 
                    setEditForm({ ...editForm, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="Renovating">Renovating</SelectItem>
                    <SelectItem value="Permanently Closed">Permanently Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full sm:w-auto sm:ml-auto" onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Update Confirmation Dialog */}
      <AlertDialog open={updateConfirmOpen} onOpenChange={setUpdateConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Update</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to update {editingClient?.name}'s information?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmUpdate}>
              Confirm Update
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{clientToDelete?.name}</strong> from your client list? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove Client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

