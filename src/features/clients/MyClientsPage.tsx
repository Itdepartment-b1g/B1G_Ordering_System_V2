import { useState, useRef, useEffect } from 'react';
import { sendNotification } from '@/features/shared/lib/notification.helpers';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Edit, Trash2, Building, Camera, Upload, X, MapPin, RefreshCw, Eye, Loader2, CheckCircle, User, Mail, FileText, Phone, ExternalLink, Tag } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useMyClients, Client } from './hooks';
import { useQueryClient } from '@tanstack/react-query';
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



export default function MyClientsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: clients = [], isLoading: loading } = useMyClients();
  // Derive assigned cities directly from the latest profile data.
  // AuthContext already keeps `user.city` in sync via its own realtime subscription.
  const agentCities = (user?.city || '')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newClientPhoto, setNewClientPhoto] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    city: '',
    address: '',
    contact_person: '',
    tin: '',
    account_type: 'Standard Accounts' as 'Key Accounts' | 'Standard Accounts',
    category: 'Open' as 'Permanently Closed' | 'Renovating' | 'Open',
    has_forge: false,
    brand_ids: [] as string[]
  });

  const [brands, setBrands] = useState<Array<{ id: string; name: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const corFileInputRef = useRef<HTMLInputElement>(null);
  const [newCorPhoto, setNewCorPhoto] = useState<string | null>(null);
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

  // Edit Dialog States
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editForm, setEditForm] = useState({
    photo: '',
    name: '',
    company: '',
    email: '',
    phone: '',
    contact_person: '',
    tin: '',
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
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // View Dialog States
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);

  const { toast } = useToast();

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
    // Strip +63 prefix from phone for editing
    const phoneNumber = client.phone || '';
    const phoneWithoutPrefix = phoneNumber.startsWith('+63 ') ? phoneNumber.slice(4) : phoneNumber;

    setEditForm({
      photo: client.photo || '',
      name: client.name,
      company: client.company,
      email: client.email,
      phone: phoneWithoutPrefix,
      contact_person: client.contactPerson || '',
      tin: client.tin || '',
      account_type: client.accountType || 'Standard Accounts',
      category: client.category || 'Open'
    });
    setNewCorPhoto(null);
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

  const handleConfirmUpdate = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!editingClient) return;

    setIsUpdating(true);
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

        // Get signed URL (required for private buckets)
        const { data: urlData, error: urlError } = await supabase.storage
          .from('client-photos')
          .createSignedUrl(fileName, 31536000); // 1 year expiry

        if (urlError || !urlData?.signedUrl) {
          throw new Error(`Failed to generate signed URL: ${urlError?.message || 'Unknown error'}`);
        }

        photoUrl = urlData.signedUrl;
      }

      // Handle COR Upload if new photo is selected (reuse logic or add similar block)
      let corUrl = editingClient.corUrl;
      if (newCorPhoto) {
        const base64Data = newCorPhoto.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const isJPG = newCorPhoto.startsWith('data:image/jpeg') || newCorPhoto.startsWith('data:image/jpg');
        const contentType = isJPG ? 'image/jpeg' : 'image/png';
        const fileExtension = isJPG ? 'jpg' : 'png';
        const blob = new Blob([byteArray], { type: contentType });

        const sanitizeName = (str: string) => {
          return str.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        };
        const clientName = sanitizeName(editForm.name || 'client');
        const clientCompany = sanitizeName(editForm.company || 'company');
        const timestamp = Date.now();
        const corFileName = `${user?.id}/company_${user?.company_id}_client_${clientName}_${clientCompany}_cor_${timestamp}.${fileExtension}`;

        const { error: corUploadError } = await supabase.storage.from('client-cor').upload(corFileName, blob, { contentType, upsert: false });
        if (corUploadError) throw new Error(`Failed to upload COR: ${corUploadError.message}`);

        const { data: corUrlData, error: corUrlError } = await supabase.storage.from('client-cor').createSignedUrl(corFileName, 31536000);
        if (corUrlError || !corUrlData?.signedUrl) throw new Error(`Failed to generate COR signed URL`);

        corUrl = corUrlData.signedUrl;
      }

      const { error } = await supabase
        .from('clients')
        .update({
          name: editForm.name,
          email: editForm.email,
          phone: editForm.phone ? `+63 ${editForm.phone}` : null,
          company: editForm.company || null,
          contact_person: editForm.contact_person || null,
          tin: editForm.tin || null,
          account_type: editForm.account_type,
          category: editForm.category,
          photo_url: photoUrl,
          photo_timestamp: photoUrl ? new Date().toISOString() : null,
          cor_url: corUrl || null,
          tax_status: (corUrl || null) ? 'Tax on Sales' : 'Tax Exempt' // Determine tax status based on COR presence
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

      queryClient.invalidateQueries({ queryKey: ['my_clients', user?.id] });
    } catch (error) {
      console.error('Error updating client:', error);
      toast({
        title: 'Error',
        description: 'Failed to update client. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenDelete = (client: Client) => {
    setClientToDelete(client);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!clientToDelete) return;

    setIsDeleting(true);
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

      queryClient.invalidateQueries({ queryKey: ['my_clients', user?.id] });
    } catch (error) {
      console.error('Error deleting client:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete client. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
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

        // Use pre-warmed location if available, otherwise get fresh with fallback
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
            // Use fallback method that tries high accuracy first, then lower accuracy
            position = await getLocationWithFallback();
          }

          await processLocationAndAddress(position);
        } catch (error: any) {
          // Handle different geolocation error types gracefully
          const errorCode = error?.code;
          let errorMessage = 'Could not get location. Please enter address manually.';
          let actionButton: { label: string; onClick: () => void } | null = null;

          // Create a retry function that only retries location (not photo capture)
          const retryLocationOnly = async () => {
            toast({
              title: 'Retrying location...',
              description: 'Trying alternative methods to get your location.'
            });
            try {
              const position = await getLocationWithFallback();
              await processLocationAndAddress(position);
              toast({
                title: 'Success!',
                description: 'Location captured and address auto-filled.',
              });
            } catch (retryError: any) {
              const retryErrorCode = retryError?.code;
              let retryErrorMessage = 'Location still unavailable. Please enter address manually.';

              if (retryErrorCode === 1) {
                retryErrorMessage = 'Location permission still denied. Please enable location access in browser settings.';
              } else if (retryErrorCode === 2) {
                retryErrorMessage = 'Still unable to determine location. Try moving to an area with better GPS signal or enter address manually.';
              } else if (retryErrorCode === 3) {
                retryErrorMessage = 'Location request timed out again. Please enter address manually.';
              }

              toast({
                title: 'Still Unavailable',
                description: retryErrorMessage,
                variant: 'destructive'
              });
            }
          };

          if (errorCode === 1) {
            errorMessage = 'Location permission denied. Please enable location access in your browser settings, then click retry.';
            actionButton = {
              label: 'Retry Location',
              onClick: retryLocationOnly
            };
          } else if (errorCode === 2) {
            errorMessage = 'Unable to determine location. This may be due to:\n• Weak GPS signal (try moving near a window or outdoors)\n• Network location services unavailable\n• Device location services disabled\n\nYou can retry or enter the address manually.';
            actionButton = {
              label: 'Retry Location',
              onClick: retryLocationOnly
            };
          } else if (errorCode === 3) {
            errorMessage = 'Location request timed out. This may take longer in areas with poor signal. You can retry or enter address manually.';
            actionButton = {
              label: 'Retry Location',
              onClick: retryLocationOnly
            };
          }

          // Only log unexpected errors, suppress common ones
          if (errorCode !== 1 && errorCode !== 2) {
            console.warn('📸 Location error:', error?.message || error);
          }

          toast({
            title: 'Location Unavailable',
            description: errorMessage,
            variant: 'destructive',
            action: actionButton ? (
              <ToastAction
                altText={actionButton.label}
                onClick={actionButton.onClick}
              >
                {actionButton.label}
              </ToastAction>
            ) : undefined
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCorFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'Error', description: 'Image size should be less than 10MB', variant: 'destructive' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewCorPhoto(reader.result as string);
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

  const getCurrentLocation = (options?: { useHighAccuracy?: boolean; timeout?: number }): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      const useHighAccuracy = options?.useHighAccuracy !== false;
      const timeout = options?.timeout || 20000; // Default 20 seconds

      navigator.geolocation.getCurrentPosition(
        (position) => resolve(position),
        (error) => {
          // Create a more descriptive error with code
          const geoError = error as GeolocationPositionError;
          reject(geoError);
        },
        {
          enableHighAccuracy: useHighAccuracy,
          timeout: timeout,
          maximumAge: 120000 // Allow cached position up to 2 minutes old
        }
      );
    });
  };

  // Get location with fallback - tries multiple strategies
  const getLocationWithFallback = async (): Promise<GeolocationPosition> => {
    const strategies = [
      // Strategy 1: High accuracy with long timeout
      { useHighAccuracy: true, timeout: 20000, maxAge: 0 },
      // Strategy 2: Low accuracy with medium timeout
      { useHighAccuracy: false, timeout: 15000, maxAge: 0 },
      // Strategy 3: Low accuracy with cached position (up to 5 minutes old)
      { useHighAccuracy: false, timeout: 10000, maxAge: 300000 },
      // Strategy 4: Any cached position (up to 10 minutes old)
      { useHighAccuracy: false, timeout: 5000, maxAge: 600000 }
    ];

    let lastError: any = null;

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      try {
        console.log(`📍 Trying location strategy ${i + 1}/${strategies.length}:`, strategy);
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'));
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (position) => resolve(position),
            (error) => reject(error),
            {
              enableHighAccuracy: strategy.useHighAccuracy,
              timeout: strategy.timeout,
              maximumAge: strategy.maxAge
            }
          );
        });

        console.log(`✅ Location obtained with strategy ${i + 1}:`, {
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString()
        });
        return position;
      } catch (error: any) {
        console.log(`❌ Strategy ${i + 1} failed:`, error?.code, error?.message);
        lastError = error;

        // If it's a permission error (code 1), don't try other strategies
        if (error?.code === 1) {
          throw error;
        }

        // Continue to next strategy if this one failed
        continue;
      }
    }

    // All strategies failed
    console.error('❌ All location strategies failed. Last error:', lastError);
    throw lastError || new Error('Unable to determine location after multiple attempts');
  };

  // Pre-warm GPS when dialog opens
  const startLocationPrewarm = async () => {
    // Check if geolocation is available before attempting
    if (!navigator.geolocation) {
      return; // Silently fail if geolocation is not supported
    }

    setIsPrewarmingLocation(true);
    try {
      // Use fallback method that tries high accuracy first, then lower accuracy
      const position = await getLocationWithFallback();
      setPrewarmPosition(position);
      console.log('Location pre-warmed:', position.coords.accuracy, 'meters accuracy');
    } catch (error: any) {
      // Suppress console errors for common location issues
      // Code 1 = PERMISSION_DENIED, Code 2 = POSITION_UNAVAILABLE
      // These are expected in some scenarios and don't need console spam
      if (error?.code !== 1 && error?.code !== 2) {
        console.warn('Pre-warm location error:', error?.message || error);
      }
      // Clear any stale pre-warmed position on error
      setPrewarmPosition(null);
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
      console.log('🌍 Starting reverse geocoding for:', { latitude, longitude });

      // Add a small delay to respect Nominatim rate limiting (1 request per second)
      // Store last request time to ensure we don't exceed rate limit
      const now = Date.now();
      const lastRequestTime = (window as any).__lastNominatimRequest || 0;
      const timeSinceLastRequest = now - lastRequestTime;

      if (timeSinceLastRequest < 1000) {
        const waitTime = 1000 - timeSinceLastRequest;
        console.log(`⏳ Rate limiting: waiting ${waitTime}ms before next request`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'en',
            'User-Agent': 'MultiTenantB2B-ClientApp/1.0' // Required by Nominatim
          }
        }
      );

      // Update last request time
      (window as any).__lastNominatimRequest = Date.now();

      if (!response.ok) {
        console.error('❌ Reverse geocoding API error:', response.status, response.statusText);
        throw new Error(`Geocoding API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('🌍 Reverse geocoding response:', data);

      if (data && data.address) {
        // Extract city from various possible fields
        const addr = data.address;
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';

        // Construct full address with better formatting
        const addressParts = [
          addr.house_number,
          addr.road,
          addr.suburb || addr.neighbourhood,
          addr.city || addr.town || addr.village,
          addr.state || addr.region,
          addr.country
        ].filter(Boolean);

        const fullAddress = addressParts.join(', ');
        const extractedCity = city;

        console.log('✅ Extracted address:', { fullAddress, extractedCity });

        return {
          address: fullAddress || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
          city: extractedCity
        };
      } else if (data && data.display_name) {
        // Fallback to display_name if address object is not available
        console.log('⚠️ Using display_name fallback:', data.display_name);
        // Try to extract city from display_name
        const displayParts = data.display_name.split(',');
        const possibleCity = displayParts.length > 1 ? displayParts[displayParts.length - 2]?.trim() : '';

        return {
          address: data.display_name,
          city: possibleCity
        };
      }

      console.warn('⚠️ No address data found in response, using coordinates');
      return {
        address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        city: ''
      };
    } catch (error: any) {
      console.error('❌ Reverse geocoding error:', error);
      console.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name
      });

      // Return coordinates as fallback
      return {
        address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
        city: ''
      };
    }
  };

  const processLocationAndAddress = async (position: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = position.coords;

    console.log('📍 Processing location:', { latitude, longitude, accuracy });

    try {
      // Get address and city from coordinates
      const { address, city } = await reverseGeocode(latitude, longitude);

      console.log('📍 Reverse geocoded result:', { address, city });

      // Validate that we got meaningful data
      if (!address || address === `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`) {
        console.warn('⚠️ Reverse geocoding returned coordinates only, address extraction may have failed');
      }

      if (!city) {
        console.warn('⚠️ City not found in reverse geocoding response');
      }

      // Auto-fill the address and city fields
      setFormData(prev => {
        const updated = {
          ...prev,
          address: address || prev.address, // Keep existing if new is empty
          city: city || prev.city // Keep existing if new is empty
        };
        console.log('📍 Updating form data with:', {
          address: updated.address,
          city: updated.city,
          previousAddress: prev.address,
          previousCity: prev.city
        });
        return updated;
      });

      setCapturedLocation({ latitude, longitude, address: address || '', accuracy });

      const badge = getAccuracyBadge(accuracy);
      const cityStatus = city ? `City: ${city}` : 'City: Not found';
      toast({
        title: 'Location Captured',
        description: `${badge.icon} ${badge.label} (±${Math.round(accuracy)}m) - ${cityStatus}`,
      });
    } catch (error: any) {
      console.error('❌ Error in processLocationAndAddress:', error);
      toast({
        title: 'Location Error',
        description: 'Location captured but address lookup failed. Please enter address manually.',
        variant: 'destructive'
      });
    }
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

        // Use pre-warmed location if available, otherwise get fresh with fallback
        // This MUST complete before the function returns to ensure form is updated
        try {
          let position: GeolocationPosition;

          if (prewarmPosition) {
            console.log('📸 Using pre-warmed location for photo');
            position = prewarmPosition;
          } else {
            console.log('📸 Getting fresh location for photo');
            toast({
              title: 'Getting location...',
              description: 'Please wait while we capture your current location.'
            });
            // Use fallback method that tries high accuracy first, then lower accuracy
            position = await getLocationWithFallback();
          }

          console.log('📸 Location obtained, processing address...');
          // Await this to ensure form is updated before function completes
          await processLocationAndAddress(position);
          console.log('📸 Location processing complete');
        } catch (error: any) {
          // Handle different geolocation error types gracefully
          const errorCode = error?.code;
          let errorMessage = 'Could not get location. Please enter address manually.';

          if (errorCode === 1) {
            errorMessage = 'Location permission denied. Please enable location access or enter address manually.';
          } else if (errorCode === 2) {
            errorMessage = 'Unable to determine location. This may be due to weak GPS signal or network issues. Please try moving to an area with better signal or enter address manually.';
          } else if (errorCode === 3) {
            errorMessage = 'Location request timed out. Please try again or enter address manually.';
          }

          // Only log unexpected errors, suppress common ones
          if (errorCode !== 1 && errorCode !== 2) {
            console.warn('📸 Location error:', error?.message || error);
          }
          toast({
            title: 'Location Unavailable',
            description: errorMessage,
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
      // Use fallback method that tries high accuracy first, then lower accuracy
      const position = await getLocationWithFallback();
      await processLocationAndAddress(position);
    } catch (error: any) {
      // Handle different geolocation error types gracefully
      const errorCode = error?.code;
      let errorMessage = 'Still unable to get location. Please enter address manually.';

      if (errorCode === 1) {
        errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
      } else if (errorCode === 2) {
        errorMessage = 'Unable to determine location. Try moving to an area with better GPS signal or check your network connection.';
      } else if (errorCode === 3) {
        errorMessage = 'Location request timed out. Please try again.';
      }

      // Only log unexpected errors, suppress common ones
      if (errorCode !== 1 && errorCode !== 2) {
        console.warn('Retry location error:', error?.message || error);
      }
      toast({
        title: 'Location Error',
        description: errorMessage,
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

  // Fetch brands for the company
  const fetchBrands = async () => {
    if (!user?.company_id) {
      console.log('No company_id found, cannot fetch brands');
      setBrands([]);
      return;
    }
    
    try {
      console.log('Fetching brands for company_id:', user.company_id);
      const { data, error } = await supabase
        .from('brands')
        .select('id, name')
        .eq('company_id', user.company_id)
        .order('name');
      
      if (error) {
        console.error('Error fetching brands:', error);
        throw error;
      }
      
      console.log('Fetched brands:', data);
      console.log('Number of brands found:', data?.length || 0);
      
      if (data && data.length > 0) {
        setBrands(data);
      } else {
        console.log('No brands found for company_id:', user.company_id);
        setBrands([]);
      }
    } catch (error: any) {
      console.error('Error fetching brands:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      setBrands([]);
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
      contact_person: '',
      tin: '',
      account_type: 'Standard Accounts',
      category: 'Open',
      has_forge: false,
      brand_ids: []
    });
    setNewClientPhoto(null);
    setCapturedLocation(null);
    setPrewarmPosition(null);
    setIsPrewarmingLocation(false);
    closeCamera();
  };

  // Philippine phone number formatter
  const formatPhilippinePhone = (value: string): string => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');

    // If starts with 63, remove it (we'll add +63 prefix separately)
    let phoneDigits = digits.startsWith('63') ? digits.slice(2) : digits;

    // Limit to 10 digits (after country code)
    phoneDigits = phoneDigits.slice(0, 10);

    // Format: 9XX-XXX-XXXX
    if (phoneDigits.length <= 3) {
      return phoneDigits;
    } else if (phoneDigits.length <= 6) {
      return `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3)}`;
    } else {
      return `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;
    }
  };

  const handlePhoneChange = (value: string, formType: 'add' | 'edit') => {
    const formatted = formatPhilippinePhone(value);
    if (formType === 'add') {
      setFormData({ ...formData, phone: formatted });
    } else {
      setEditForm({ ...editForm, phone: formatted });
    }
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

    // COR is now optional
    /*
    if (!newCorPhoto) {
      toast({ title: 'Error', description: 'COR (Certificate of Registration) photo is required', variant: 'destructive' });
      return;
    }
    */

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

    setIsSubmitting(true);
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

        // Get signed URL (required for private buckets)
        const { data: urlData, error: urlError } = await supabase.storage
          .from('client-photos')
          .createSignedUrl(fileName, 31536000); // 1 year expiry

        if (urlError || !urlData?.signedUrl) {
          throw new Error(`Failed to generate signed URL: ${urlError?.message || 'Unknown error'}`);
        }

        photoUrl = urlData.signedUrl;
      }

      // Upload COR if present
      let corUrl = null;
      if (newCorPhoto) {
        const base64Data = newCorPhoto.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const isJPG = newCorPhoto.startsWith('data:image/jpeg') || newCorPhoto.startsWith('data:image/jpg');
        const contentType = isJPG ? 'image/jpeg' : 'image/png';
        const fileExtension = isJPG ? 'jpg' : 'png';
        const blob = new Blob([byteArray], { type: contentType });

        const sanitizeName = (str: string) => {
          return str.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        };
        const clientName = sanitizeName(formData.name || 'client');
        const clientCompany = sanitizeName(formData.company || 'company');
        const timestamp = Date.now();
        const corFileName = `${user.id}/company_${user.company_id}_client_${clientName}_${clientCompany}_cor_${timestamp}.${fileExtension}`;

        const { error: corUploadError } = await supabase.storage.from('client-cor').upload(corFileName, blob, { contentType, upsert: false });
        if (corUploadError) throw new Error(`Failed to upload COR: ${corUploadError.message}`);

        const { data: corUrlData, error: corUrlError } = await supabase.storage.from('client-cor').createSignedUrl(corFileName, 31536000);
        if (corUrlError || !corUrlData?.signedUrl) throw new Error(`Failed to generate COR signed URL`);

        corUrl = corUrlData.signedUrl;
      }

      const nowIso = new Date().toISOString();
      const approvalStatus = cityMatches ? 'approved' : 'pending';
      const approvalRequestedAt = cityMatches ? null : nowIso;
      const approvalNotes = cityMatches ? null : `City "${clientCityValue || 'N/A'}" outside assigned cities: ${agentCities.join(', ')}`;
      const approvedAt = cityMatches ? nowIso : null;

      // Validate company_id
      if (!user.company_id) {
        throw new Error('User company_id not found');
      }

      // Save client to database
      const { data, error } = await supabase
        .from('clients')
        .insert({
          company_id: user.company_id,
          agent_id: user.id,
          name: formData.name,
          email: formData.email,
          phone: formData.phone ? `+63 ${formData.phone}` : null,
          company: formData.company || null,
          city: formData.city || null,
          address: formData.address || null,
          contact_person: formData.contact_person || null,
          tin: formData.tin || null,
          account_type: formData.account_type,
          category: formData.category,
          has_forge: formData.has_forge,
          brand_ids: formData.brand_ids.length > 0 ? formData.brand_ids : null,
          cor_url: corUrl,
          photo_url: photoUrl,
          photo_timestamp: photoUrl ? new Date().toISOString() : null,
          location_latitude: capturedLocation?.latitude || null,
          location_longitude: capturedLocation?.longitude || null,
          location_accuracy: capturedLocation?.accuracy || null,
          location_captured_at: capturedLocation ? new Date().toISOString() : null,
          approval_status: approvalStatus,
          approval_requested_at: approvalRequestedAt,
          approval_notes: approvalNotes,
          tax_status: corUrl ? 'Tax on Sales' : 'Tax Exempt',
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

      // Notify Leader if approval is required
      if (approvalStatus === 'pending' && user?.id && user?.company_id) {
        try {
          const { data: leaderRow } = await supabase
            .from('leader_teams')
            .select('leader_id')
            .eq('agent_id', user.id)
            .maybeSingle();

          if (leaderRow?.leader_id) {
            await sendNotification({
              userId: leaderRow.leader_id,
              companyId: user.company_id,
              type: 'new_client',
              title: 'Client Pending Approval',
              message: `${user.full_name} has added a new client "${formData.name}" that requires approval (outside assigned cities).`,
              referenceType: 'client',
              referenceId: data.id
            });
          }
        } catch (err) {
          console.error('Failed to notify leader of new client approval:', err);
        }
      }

      resetForm();
      setIsDialogOpen(false);

      queryClient.invalidateQueries({ queryKey: ['my_clients', user?.id] });
    } catch (error: any) {
      console.error('Error adding client:', error);
      const errorMessage = error?.message || error?.error_description || 'Failed to add client';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading && clients.length === 0) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-muted-foreground">Loading clients...</div>
        </div>
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
          if (open) {
            fetchBrands(); // Fetch brands when dialog opens
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
              <DialogDescription>
                Add a new client to your list. Take a photo to automatically capture location, or enter details manually.
              </DialogDescription>
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


              {/* COR Upload Section */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">
                  COR (Certificate of Registration) <span className="text-muted-foreground font-normal">(Optional)</span>
                </Label>
                <p className="text-xs text-muted-foreground">Upload PNG or JPG image (max 10MB). Uploading a COR will set tax status to "Tax on Sales".</p>

                {!newCorPhoto && (
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => corFileInputRef.current?.click()}
                      className="w-full"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload COR Image
                    </Button>
                    <input
                      ref={corFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleCorFileUpload}
                      className="hidden"
                    />
                  </div>
                )}

                {newCorPhoto && (
                  <div className="relative">
                    <img
                      src={newCorPhoto}
                      alt="COR preview"
                      className="w-full h-48 object-contain rounded-lg border bg-gray-50"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => setNewCorPhoto(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="mt-2 text-xs text-green-600 font-medium">
                      ✓ COR uploaded successfully
                    </div>
                  </div>
                )}
              </div>

              {/* Client Information Fields */}
              <div className="space-y-2">
                <Label>Trade Name *</Label>
                <Input
                  placeholder="Enter trade name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Shop Name</Label>
                <Input
                  placeholder="Shop name"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Person</Label>
                <Input
                  placeholder="Contact person name"
                  value={formData.contact_person}
                  onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>TIN (Tax Identification Number)</Label>
                <Input
                  placeholder="000-000-000-000"
                  value={formData.tin}
                  onChange={(e) => setFormData({ ...formData, tin: e.target.value })}
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
                <Label>Phone Number</Label>
                <div className="flex gap-2">
                  <div className="w-16">
                    <Input
                      value="+63"
                      disabled
                      className="bg-muted text-center font-semibold"
                    />
                  </div>
                  <Input
                    placeholder="9XX-XXX-XXXX"
                    value={formData.phone}
                    onChange={(e) => handlePhoneChange(e.target.value, 'add')}
                    maxLength={12}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Format: +63 9XX-XXX-XXXX</p>
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

              {/* Brands Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Products / Brands Client is Holding</Label>
                <p className="text-xs text-muted-foreground">Select all brands/products this client is currently holding</p>
                {brands.length > 0 ? (
                  <>
                    <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                      {brands.map((brand) => (
                        <div key={brand.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`brand-${brand.id}`}
                            checked={formData.brand_ids.includes(brand.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFormData({
                                  ...formData,
                                  brand_ids: [...formData.brand_ids, brand.id]
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  brand_ids: formData.brand_ids.filter(id => id !== brand.id)
                                });
                              }
                            }}
                          />
                          <Label htmlFor={`brand-${brand.id}`} className="text-sm font-normal cursor-pointer">
                            {brand.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {formData.brand_ids.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {formData.brand_ids.length} {formData.brand_ids.length === 1 ? 'brand' : 'brands'} selected
                      </p>
                    )}
                  </>
                ) : (
                  <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground">
                    <p>No brands available for this company.</p>
                    <p className="text-xs mt-1">Add brands in the inventory section to see them here.</p>
                  </div>
                )}
              </div>

              <Button className="w-full" onClick={handleAddClient} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding Client...
                  </>
                ) : (
                  'Add Client'
                )}
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
                  <TableHead className="text-center">Trade Name</TableHead>
                  <TableHead className="text-center">Shop Name</TableHead>
                  <TableHead className="text-center">Email</TableHead>
                  <TableHead className="text-center">Phone</TableHead>
                  <TableHead className="text-center">Total Orders</TableHead>
                  <TableHead className="text-center">Visits</TableHead>
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
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 font-medium text-purple-600">
                        <MapPin className="h-3 w-3" />
                        {client.visitCount}
                      </div>
                    </TableCell>
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
                        {user?.role !== 'mobile_sales' && (
                        <Button variant="ghost" size="icon" onClick={() => handleOpenDelete(client)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        )}
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
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">Client Details</DialogTitle>
          </DialogHeader>
          {viewingClient && (
            <div className="space-y-6 py-4">
              {/* Top Section: Photo & Basic Info */}
              <div className="flex flex-col md:flex-row gap-6">
                {/* Photo Column */}
                <div className="w-full md:w-1/3 space-y-3">
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden border-2 border-gray-100 bg-gray-50 flex items-center justify-center shadow-sm">
                    {viewingClient.photo ? (
                      <img
                        src={viewingClient.photo}
                        alt={viewingClient.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center p-4 text-muted-foreground">
                        <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">No photo available</p>
                      </div>
                    )}

                    {/* Status Badge Overlay */}
                    <div className="absolute top-2 right-2">
                      <Badge variant="outline" className={`bg-white/90 backdrop-blur border shadow-sm ${getApprovalStatusBadge(viewingClient.approvalStatus).className}`}>
                        {getApprovalStatusBadge(viewingClient.approvalStatus).label}
                      </Badge>
                    </div>
                  </div>

                  {viewingClient.photoTimestamp && (
                    <div className="text-center text-xs text-muted-foreground bg-gray-50 p-2 rounded-lg border">
                      Captured: {new Date(viewingClient.photoTimestamp).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Basic Info Column */}
                <div className="flex-1 space-y-6">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900">{viewingClient.name}</h3>
                    <div className="flex items-center gap-2 text-muted-foreground mt-1">
                      <Building className="h-4 w-4" />
                      <span className="font-medium">{viewingClient.company || 'No Shop Name'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 p-3 rounded-lg border">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Account Type</span>
                      <div className="mt-1">
                        {viewingClient.accountType === 'Key Accounts' ? (
                          <Badge className="bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100">
                            <span className="mr-1">⭐</span> Key Account
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            Standard Account
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-50 p-3 rounded-lg border">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Category</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`w-2 h-2 rounded-full ${viewingClient.category === 'Open' ? 'bg-green-500' :
                          viewingClient.category === 'Renovating' ? 'bg-yellow-500' : 'bg-red-500'
                          }`} />
                        <p className="font-semibold text-gray-900">{viewingClient.category}</p>
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="flex gap-4 border-t pt-4">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Total Orders</p>
                      <p className="text-2xl font-bold text-primary">{viewingClient.totalOrders}</p>
                    </div>
                    <div className="w-px bg-border" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">Total Visits</p>
                      <p className="text-2xl font-bold text-purple-600">{viewingClient.visitCount}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* Information Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Contact Information */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2 text-primary">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    Contact Details
                  </h4>
                  <div className="space-y-3 bg-gray-50/50 p-4 rounded-xl border">
                    <div className="grid grid-cols-[24px_1fr] gap-2 items-start">
                      <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <span className="text-xs text-muted-foreground block">Contact Person</span>
                        <span className="font-medium">{viewingClient.contactPerson || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-[24px_1fr] gap-2 items-start">
                      <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <span className="text-xs text-muted-foreground block">Email Address</span>
                        <span className="font-medium break-all">{viewingClient.email}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-[24px_1fr] gap-2 items-start">
                      <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <span className="text-xs text-muted-foreground block">Phone Number</span>
                        <span className="font-medium">{viewingClient.phone || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Legal & Compliance */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2 text-primary">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    Legal & Compliance
                  </h4>
                  <div className="space-y-3 bg-gray-50/50 p-4 rounded-xl border">
                    <div className="grid grid-cols-[24px_1fr] gap-2 items-start">
                      <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <span className="text-xs text-muted-foreground block">TIN (Tax ID)</span>
                        <span className="font-mono font-medium">{viewingClient.tin || 'N/A'}</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed my-2" />

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground font-medium uppercase">COR Document</span>
                        {viewingClient.corUrl ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">Verified</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Missing</Badge>
                        )}
                      </div>

                      {viewingClient.corUrl ? (
                        <div className="flex items-center gap-3 p-2 bg-white rounded-lg border">
                          <div className="h-10 w-10 bg-gray-100 rounded flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5 text-gray-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">Certificate of Org.</p>
                            <p className="text-xs text-muted-foreground">View document</p>
                          </div>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => window.open(viewingClient.corUrl, '_blank')}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="p-3 text-center border-2 border-dashed rounded-lg bg-gray-50 text-muted-foreground text-xs">
                          No document uploaded
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Brands */}
              <div className="space-y-4">
                <h4 className="font-semibold text-sm flex items-center gap-2 text-primary">
                  <Tag className="h-4 w-4" />
                  Brands they have
                </h4>
                <div className="bg-gray-50/50 p-4 rounded-xl border">
                  {viewingClient.brandIds && viewingClient.brandIds.length > 0 && brands.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {viewingClient.brandIds
                        .map((id) => brands.find((b) => b.id === id))
                        .filter((b): b is { id: string; name: string } => !!b)
                        .map((b) => (
                          <Badge key={b.id} variant="secondary" className="font-normal">
                            {b.name}
                          </Badge>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No brands assigned</p>
                  )}
                </div>
              </div>

              {/* Location Section */}
              {viewingClient.location && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2 text-primary">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    Location Data
                  </h4>
                  <div className="bg-muted/50 p-4 rounded-xl border space-y-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-medium text-sm leading-tight">{viewingClient.address}</p>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>{viewingClient.city || 'City not detailed'}</span>
                          <span>•</span>
                          <span>Lat: {viewingClient.location.latitude.toFixed(6)}</span>
                          <span>•</span>
                          <span>Lon: {viewingClient.location.longitude.toFixed(6)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-dashed border-gray-300">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={getAccuracyBadge(viewingClient.location.accuracy).color}>
                          {getAccuracyBadge(viewingClient.location.accuracy).icon} ±{Math.round(viewingClient.location.accuracy)}m Accuracy
                        </Badge>
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${viewingClient.location.latitude},${viewingClient.location.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium flex items-center gap-1"
                      >
                        Open Maps <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )}
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
            <div className="space-y-6 py-4">
              {/* Top Section: Photo & Basic Info */}
              <div className="flex flex-col md:flex-row gap-6">
                {/* Photo Column */}
                <div className="w-full md:w-1/3 space-y-3">
                  <Label className="text-sm font-semibold">Client Photo</Label>

                  {/* Photo Display Area */}
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center group hover:border-primary/50 transition-colors">
                    {/* Camera View */}
                    {isEditCameraOpen ? (
                      <div className="absolute inset-0 bg-black">
                        <video
                          ref={editVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                          onLoadedMetadata={() => {
                            if (editVideoRef.current) {
                              editVideoRef.current.play().catch(err => console.error(err));
                              setIsEditCameraLoading(false);
                            }
                          }}
                        />
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4">
                          <Button
                            size="sm"
                            onClick={captureEditPhoto}
                            disabled={isEditCameraLoading}
                            className="flex-1 bg-white text-black hover:bg-white/90"
                          >
                            Capture
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={closeEditCamera}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Image Display
                      (editPhoto || editingClient.photo) ? (
                        <>
                          <img
                            src={editPhoto || editingClient.photo}
                            alt="Client"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 right-2 flex gap-1 bg-black/50 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="h-8 w-8"
                              onClick={removeEditPhoto}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          {editPhoto && (
                            <div className="absolute bottom-2 left-2 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-medium">
                              New
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-center p-4 text-muted-foreground">
                          <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-xs">No photo available</p>
                        </div>
                      )
                    )}
                  </div>

                  {/* Photo Actions */}
                  {!isEditCameraOpen && (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={openEditCamera}
                        className="text-xs"
                      >
                        <Camera className="h-3 w-3 mr-1.5" />
                        Camera
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => editFileInputRef.current?.click()}
                        className="text-xs"
                      >
                        <Upload className="h-3 w-3 mr-1.5" />
                        Upload
                      </Button>
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

                {/* Basic Info Column */}
                <div className="flex-1 space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label>Trade Name</Label>
                      <Input
                        placeholder="Enter trade name"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Shop Name</Label>
                      <Input
                        placeholder="Shop name"
                        value={editForm.company}
                        onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                        className="h-10"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Type Of Account</Label>
                        <Select
                          value={editForm.account_type}
                          onValueChange={(value: 'Key Accounts' | 'Standard Accounts') =>
                            setEditForm({ ...editForm, account_type: value })
                          }
                        >
                          <SelectTrigger className="h-10">
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
                          <SelectTrigger className="h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Open">Open</SelectItem>
                            <SelectItem value="Renovating">Renovating</SelectItem>
                            <SelectItem value="Permanently Closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* Contact & Legal Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Contact Info */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2 text-primary">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    Contact Information
                  </h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      <Input
                        placeholder="Name of contact"
                        value={editForm.contact_person}
                        onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email Address</Label>
                      <Input
                        type="email"
                        placeholder="client@company.com"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <div className="flex gap-2">
                        <div className="w-16 shrink-0">
                          <Input
                            value="+63"
                            disabled
                            className="bg-muted text-center font-semibold"
                          />
                        </div>
                        <Input
                          placeholder="9XX-XXX-XXXX"
                          value={editForm.phone}
                          onChange={(e) => handlePhoneChange(e.target.value, 'edit')}
                          maxLength={12}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Legal & Documents */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2 text-primary">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    Legal & Documents
                  </h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>TIN (Tax Identification Number)</Label>
                      <Input
                        placeholder="000-000-000-000"
                        value={editForm.tin}
                        onChange={(e) => setEditForm({ ...editForm, tin: e.target.value })}
                        className="font-mono text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="flex justify-between items-center">
                        <span>COR Document</span>
                        <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
                      </Label>

                      <div className="border rounded-lg p-3 bg-gray-50/50 space-y-3">
                        {/* COR Status/Preview */}
                        <div className="flex items-center gap-3">
                          {newCorPhoto ? (
                            <div className="relative h-16 w-16 shrink-0 rounded-md overflow-hidden border">
                              <img src={newCorPhoto} alt="New COR" className="h-full w-full object-cover" />
                              <div className="absolute inset-0 bg-green-500/20 ring-1 ring-inset ring-green-500/50" />
                            </div>
                          ) : editingClient.corUrl ? (
                            <div className="relative h-16 w-16 shrink-0 rounded-md overflow-hidden border">
                              <img src={editingClient.corUrl} alt="Current COR" className="h-full w-full object-cover opacity-80" />
                            </div>
                          ) : (
                            <div className="h-16 w-16 shrink-0 rounded-md border border-dashed flex items-center justify-center bg-white text-muted-foreground">
                              <Upload className="h-6 w-6 opacity-30" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {newCorPhoto ? 'New Document Selected' : editingClient.corUrl ? 'COR on File' : 'No Document'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {newCorPhoto ? 'Will replace existing' : editingClient.corUrl ? 'View or replace below' : 'Upload PNG/JPG (Max 10MB)'}
                            </p>
                          </div>
                        </div>

                        {/* COR Actions */}
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full text-xs h-8"
                            onClick={() => corFileInputRef.current?.click()}
                          >
                            <Upload className="h-3 w-3 mr-1.5" />
                            {editingClient.corUrl || newCorPhoto ? "Replace" : "Upload"}
                          </Button>
                          {newCorPhoto && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="w-full text-xs h-8 text-destructive hover:text-destructive"
                              onClick={() => setNewCorPhoto(null)}
                            >
                              <X className="h-3 w-3 mr-1.5" />
                              Clear New
                            </Button>
                          )}
                          <input
                            ref={corFileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg"
                            onChange={handleCorFileUpload}
                            className="hidden"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              <div className="pt-2 flex justify-end gap-3">
                <Button className="w-full sm:w-auto min-w-[120px]" onClick={handleSaveEdit}>
                  Save Changes
                </Button>
              </div>
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
            <AlertDialogAction onClick={handleConfirmUpdate} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Confirm Update'
              )}
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
            <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing...
                </>
              ) : (
                'Remove Client'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div >
  );
}

