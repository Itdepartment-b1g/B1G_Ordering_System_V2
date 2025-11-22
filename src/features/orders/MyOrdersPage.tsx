import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Eye, Trash2, ShoppingCart, X, FileSignature, ChevronLeft, ChevronRight, Calendar, CreditCard, Camera, Upload, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useOrders, type OrderItem } from './OrderContext';
import { useAuth } from '@/features/auth';
import { useAgentInventory } from '@/features/inventory/hooks';
import { supabase } from '@/lib/supabase';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { sendOrderConfirmationEmail } from '@/lib/email.helpers';

interface SelectedItem {
  variantId: string;
  brandName: string;
  variantName: string;
  variantType: 'flavor' | 'battery';
  unitPrice: number;
  sellingPrice?: number;
  dspPrice?: number;
  rspPrice?: number;
  availableStock: number;
  quantity: number;
}

export default function MyOrdersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { getOrdersByAgent, addOrder, orders: allOrders } = useOrders();
  const { agentBrands } = useAgentInventory();
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Helper function to get display status from stage
  const getDisplayStatus = (order: any) => {
    const stage = order.stage || order.status;
    switch (stage) {
      case 'agent_pending':
        return { text: 'Pending', variant: 'secondary' as const };
      case 'leader_approved':
        return { text: 'Approved by Leader', variant: 'default' as const };
      case 'admin_approved':
        return { text: 'Approved', variant: 'default' as const };
      case 'leader_rejected':
        return { text: 'Rejected', variant: 'destructive' as const };
      case 'admin_rejected':
        return { text: 'Rejected', variant: 'destructive' as const };
      default:
        return { text: order.status || 'Pending', variant: 'secondary' as const };
    }
  };

  // Date filter state
  const [dateFilterStart, setDateFilterStart] = useState('');
  const [dateFilterEnd, setDateFilterEnd] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 10;

  // Client search state
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [showClientSearch, setShowClientSearch] = useState(false);

  // View Dialog States
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [orderToView, setOrderToView] = useState<any>(null);

  // Signature states
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [emailSentSuccessfully, setEmailSentSuccessfully] = useState(false);

  // Payment method states
  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'GCASH' | 'BANK_TRANSFER' | 'CASH' | null>(null);
  const [showPaymentProofModal, setShowPaymentProofModal] = useState(false);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [uploadingPaymentProof, setUploadingPaymentProof] = useState(false);

  // Camera states
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [videoRef, setVideoRef] = useState<HTMLVideoElement | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment'); // 'user' = front, 'environment' = back

  // Agent's clients
  const [myClients, setMyClients] = useState<any[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientEmail, setClientEmail] = useState('');

  const { toast } = useToast();

  // Form states
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientCompany, setClientCompany] = useState('');
  const [selectedBrandName, setSelectedBrandName] = useState('');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [requestSalesInvoice, setRequestSalesInvoice] = useState(false);

  // Confirmation modal states
  const [showNoInvoiceConfirmModal, setShowNoInvoiceConfirmModal] = useState(false);
  const [showWithInvoiceConfirmModal, setShowWithInvoiceConfirmModal] = useState(false);

  const myOrders = user ? getOrdersByAgent(user.id) : [];

  // Apply all filters
  const filteredOrders = myOrders.filter(order => {
    const searchMatch = order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.clientName.toLowerCase().includes(searchQuery.toLowerCase());

    // Date filter
    if (dateFilterStart && dateFilterEnd) {
      const orderDate = new Date(order.date);
      const startDate = new Date(dateFilterStart);
      const endDate = new Date(dateFilterEnd);
      endDate.setHours(23, 59, 59, 999); // Include the entire end date
      return searchMatch && orderDate >= startDate && orderDate <= endDate;
    }

    return searchMatch;
  });

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / ordersPerPage);
  const startIndex = (currentPage - 1) * ordersPerPage;
  const endIndex = startIndex + ordersPerPage;
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilterStart, dateFilterEnd]);

  const selectedBrand = agentBrands.find(b => b.name === selectedBrandName);

  // Fetch agent's clients
  useEffect(() => {
    if (user?.id && createDialogOpen) {
      fetchMyClients();
    }
  }, [user?.id, createDialogOpen]);

  const fetchMyClients = async () => {
    if (!user?.id) return;

    try {
      setLoadingClients(true);
      const { data: clients, error } = await supabase
        .from('clients')
        .select('id, name, company, email')
        .eq('agent_id', user.id)
        .eq('status', 'active')
        .eq('approval_status', 'approved')
        .order('name');

      if (error) throw error;

      console.log('📋 Agent clients:', clients);
      setMyClients(clients || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your clients',
        variant: 'destructive'
      });
    } finally {
      setLoadingClients(false);
    }
  };

  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = myClients.find(c => c.id === clientId);
    if (client) {
      setClientName(client.name);
      setClientCompany(client.company || '');
      setClientEmail(client.email || '');
    }
  };

  // Filter clients based on search query
  const filteredClients = myClients.filter(client =>
    client.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
    (client.company && client.company.toLowerCase().includes(clientSearchQuery.toLowerCase())) ||
    (client.email && client.email.toLowerCase().includes(clientSearchQuery.toLowerCase()))
  );

  const clearClientSearch = () => {
    setClientSearchQuery('');
    setShowClientSearch(false);
  };

  const calculateSubtotal = () => selectedItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  const calculateTax = () => (calculateSubtotal() * taxRate) / 100;
  const calculateTotal = () => calculateSubtotal() + calculateTax() - discount;

  const handleViewOrder = (order: any) => {
    setOrderToView(order);
    setViewDialogOpen(true);
  };

  const handleQuantityChange = (
    variantId: string,
    quantity: number,
    brandName: string,
    variantName: string,
    variantType: 'flavor' | 'battery',
    unitPrice: number,
    availableStock: number,
    sellingPrice?: number,
    dspPrice?: number,
    rspPrice?: number
  ) => {
    const safeQuantity = Math.min(Math.max(0, quantity), availableStock);
    const existingItemIndex = selectedItems.findIndex(item => item.variantId === variantId);

    if (safeQuantity > 0) {
      // Add or update item
      if (existingItemIndex >= 0) {
        // Update existing item
        setSelectedItems(selectedItems.map(item =>
          item.variantId === variantId
            ? { ...item, quantity: safeQuantity }
            : item
        ));
      } else {
        // Add new item
        setSelectedItems([...selectedItems, {
          variantId,
          brandName,
          variantName,
          variantType,
          unitPrice,
          sellingPrice,
          dspPrice,
          rspPrice,
          availableStock,
          quantity: safeQuantity
        }]);
      }
    } else {
      // Remove item if quantity is 0
      if (existingItemIndex >= 0) {
        setSelectedItems(selectedItems.filter(item => item.variantId !== variantId));
      }
    }
  };

  const handleRemoveItem = (variantId: string) => {
    setSelectedItems(selectedItems.filter(item => item.variantId !== variantId));
  };

  const resetForm = () => {
    setSelectedClientId('');
    setClientName('');
    setClientCompany('');
    setClientEmail('');
    setSelectedBrandName('');
    setSelectedItems([]);
    setDiscount(0);
    setNotes('');
    setClientSearchQuery('');
    setShowClientSearch(false);
    setSignatureDataUrl(null);
    setEmailSentSuccessfully(false);
    // Reset payment-related states
    setPaymentMethod(null);
    setPaymentProofFile(null);
    setPaymentProofPreview(null);
    // Reset sales invoice request
    setRequestSalesInvoice(false);
  };

  // Validate order before proceeding to signature
  const handlePrepareOrderForSignature = () => {
    if (!selectedClientId) {
      toast({ title: 'Error', description: 'Please select a client', variant: 'destructive' });
      return;
    }

    if (!selectedBrandName) {
      toast({ title: 'Error', description: 'Please select a brand', variant: 'destructive' });
      return;
    }

    if (selectedItems.length === 0) {
      toast({ title: 'Error', description: 'Please select at least one product', variant: 'destructive' });
      return;
    }

    if (!user) {
      toast({ title: 'Error', description: 'User not authenticated', variant: 'destructive' });
      return;
    }

    // Close the create dialog and open signature modal
    setCreateDialogOpen(false);
    setShowSignatureModal(true);
  };

  // Handle signature capture
  const handleSignatureCaptured = (dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    setShowSignatureModal(false);
    setShowPaymentMethodModal(true);
  };

  // Handle payment method selection
  const handlePaymentMethodSelected = (method: 'GCASH' | 'BANK_TRANSFER' | 'CASH') => {
    setPaymentMethod(method);
    setShowPaymentMethodModal(false);
    setShowPaymentProofModal(true);
  };

  // Handle payment proof file selection
  const handlePaymentProofFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPaymentProofFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPaymentProofPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setShowCamera(false);
      stopCamera();
    }
  };

  // Start camera
  const startCamera = async (mode?: 'user' | 'environment') => {
    try {
      // Stop existing stream first
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }

      const targetMode = mode || facingMode;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetMode }
      });

      setCameraStream(stream);
      setFacingMode(targetMode);
      setShowCamera(true);

      // Set video stream after a brief delay to ensure video element is rendered
      setTimeout(() => {
        if (videoRef) {
          videoRef.srcObject = stream;
          videoRef.play().catch(err => console.error('Error playing video:', err));
        }
      }, 100);
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: 'Camera Access Error',
        description: 'Unable to access camera. Please check permissions or use file upload instead.',
        variant: 'destructive'
      });
      setShowCamera(false);
    }
  };

  // Switch camera (front/back)
  const switchCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    startCamera(newMode);
  };

  // Stop camera
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    if (videoRef) {
      videoRef.srcObject = null;
    }
    setShowCamera(false);
  };

  // Capture photo from camera
  const capturePhoto = () => {
    if (!videoRef) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.videoWidth;
    canvas.height = videoRef.videoHeight;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.drawImage(videoRef, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `payment-proof-${Date.now()}.jpg`, { type: 'image/jpeg' });
          setPaymentProofFile(file);
          setPaymentProofPreview(canvas.toDataURL('image/jpeg'));
          stopCamera();
        }
      }, 'image/jpeg', 0.9);
    }
  };

  // Upload payment proof to Supabase Storage
  const uploadPaymentProofToStorage = async (): Promise<string> => {
    if (!paymentProofFile || !user || !paymentMethod || !selectedClientId || !clientName) {
      throw new Error('Payment proof file, user, payment method, client ID, or client name not available');
    }

    try {
      setUploadingPaymentProof(true);

      // Use a single bucket with folders for different payment methods
      const bucketName = 'payment-proofs';

      // Determine folder based on payment method (uppercase for folder names)
      const paymentMethodFolder = paymentMethod === 'GCASH'
        ? 'GCASH'
        : paymentMethod === 'BANK_TRANSFER'
          ? 'BANK TRANSFER'
          : 'CASH';

      // Sanitize client name and company for folder name
      // Format: "Client Name _ Company Name" (with underscore separator)
      const sanitizeForPath = (str: string) => {
        return str
          .trim()
          .replace(/[<>:"/\\|?*]/g, '') // Remove invalid path characters
          .replace(/\s+/g, ' ') // Replace multiple spaces with single space
          .trim();
      };

      const cleanClientName = sanitizeForPath(clientName);
      const cleanCompanyName = sanitizeForPath(clientCompany || '');
      const clientFolderName = cleanCompanyName
        ? `${cleanClientName} _ ${cleanCompanyName}`
        : cleanClientName;

      // Format date: MM/DD/YYYY (e.g., "12/15/2025")
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }); // Format: MM/DD/YYYY

      // Format time: H:MMam/pm (e.g., "1:30pm")
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const ampm = hours >= 12 ? 'pm' : 'am';
      const displayHours = hours % 12 || 12; // Convert to 12-hour format, 0 becomes 12
      const timeStr = `${displayHours}:${minutes.toString().padStart(2, '0')}${ampm}`;

      // Generate filename: date_time.jpg (e.g., "12/15/2025_1:30pm.jpg")
      const fileExt = paymentProofFile.name.split('.').pop() || 'jpg';
      const fileName = `${paymentMethodFolder}/${clientFolderName}/${dateStr}_${timeStr}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, paymentProofFile, {
          contentType: paymentProofFile.type,
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Failed to upload payment proof: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      if (!urlData?.publicUrl) {
        throw new Error('Failed to generate public URL for payment proof');
      }

      console.log('✅ Payment proof uploaded to:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading payment proof:', error);
      throw error;
    } finally {
      setUploadingPaymentProof(false);
    }
  };

  // Handle payment proof capture complete
  const handlePaymentProofCaptured = () => {
    if (paymentProofFile) {
      stopCamera(); // Ensure camera is stopped
      setShowPaymentProofModal(false);
      setShowConfirmModal(true);
    }
  };

  // Cleanup camera on unmount or modal close
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Stop camera when modal closes
  useEffect(() => {
    if (!showPaymentProofModal) {
      stopCamera();
    }
  }, [showPaymentProofModal]);

  // Upload signature to Supabase Storage
  const uploadSignatureToStorage = async (): Promise<string> => {
    if (!signatureDataUrl || !user) {
      throw new Error('Signature data or user not available');
    }

    try {
      // Convert data URL to blob
      const base64Data = signatureDataUrl.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      // Generate unique filename: {agentId}/{timestamp}.png
      const timestamp = Date.now();
      const fileName = `${user.id}/${timestamp}.png`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('client-signatures')
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: false
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        throw new Error(`Failed to upload signature: ${uploadError.message}`);
      }

      // Get signed URL (since bucket is private)
      const { data: urlData, error: urlError } = await supabase.storage
        .from('client-signatures')
        .createSignedUrl(fileName, 31536000); // 1 year expiry

      if (urlError || !urlData?.signedUrl) {
        throw new Error('Failed to generate signed URL for signature');
      }

      return urlData.signedUrl;
    } catch (error: any) {
      console.error('Error uploading signature:', error);
      throw error;
    }
  };

  // Final order submission
  const handleConfirmAndSubmitOrder = async () => {
    if (!user || !signatureDataUrl || !paymentMethod || !paymentProofFile) {
      toast({
        title: 'Error',
        description: 'User not authenticated, signature missing, payment method not selected, or payment proof missing',
        variant: 'destructive'
      });
      return;
    }

    setUploadingSignature(true);

    try {
      // Upload signature to Supabase Storage
      const signatureUrl = await uploadSignatureToStorage();

      // Upload payment proof to Supabase Storage
      const paymentProofUrl = await uploadPaymentProofToStorage();

      // Convert selectedItems to OrderItems with variant IDs
      const orderItems: OrderItem[] = selectedItems.map((item) => ({
        id: item.variantId,
        brandName: item.brandName,
        variantName: item.variantName,
        variantType: item.variantType,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        sellingPrice: item.sellingPrice,
        dspPrice: item.dspPrice,
        rspPrice: item.rspPrice,
        total: item.quantity * item.unitPrice
      }));

      const newOrder = {
        id: Date.now().toString(),
        orderNumber: '',
        agentId: user.id,
        agentName: user.name,
        clientId: selectedClientId,
        clientName: clientName,
        date: orderDate,
        items: orderItems,
        subtotal: calculateSubtotal(),
        tax: calculateTax(),
        discount,
        total: calculateTotal(),
        notes,
        status: 'pending' as const,
        signatureUrl, // Add signature URL to order
        paymentMethod, // Add payment method
        paymentProofUrl // Add payment proof URL
      };

      console.log('🛒 Creating order with signature:', newOrder);

      // Save order to database (this will also deduct from agent inventory)
      const generatedOrderNumber = await addOrder(newOrder);

      // Fetch agent phone for email contact section
      let agentPhone: string | undefined = undefined;
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', user.id)
          .single();
        agentPhone = prof?.phone || undefined;
      } catch (_e) {
        agentPhone = undefined;
      }

      // Fetch leader info for IT receipt
      let leaderName: string | undefined = undefined;
      try {
        const { data: leaderData, error: leaderError } = await supabase
          .from('leader_teams')
          .select(`
            leader_id,
            profiles!leader_teams_leader_id_fkey(
              id,
              full_name
            )
          `)
          .eq('agent_id', user.id)
          .single();

        if (!leaderError && leaderData && (leaderData.profiles as any)?.full_name) {
          leaderName = (leaderData.profiles as any).full_name;
        }
      } catch (_e) {
        // Leader not found or error - non-critical
        leaderName = undefined;
      }

      // Fetch client photo for IT receipt
      let clientPhotoUrl: string | undefined = undefined;
      try {
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('photo_url')
          .eq('id', selectedClientId)
          .single();

        if (!clientError && clientData?.photo_url) {
          clientPhotoUrl = clientData.photo_url;
        }
      } catch (_e) {
        // Client photo not found or error - non-critical
        clientPhotoUrl = undefined;
      }

      // Send email confirmation to client
      let emailSent = false;
      try {
        await sendOrderConfirmationEmail({
          orderNumber: generatedOrderNumber,
          clientName: clientName,
          clientEmail: clientEmail,
          orderDate: orderDate,
          items: orderItems.map(item => ({
            brandName: item.brandName,
            variantName: item.variantName,
            variantType: item.variantType,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total
          })),
          subtotal: calculateSubtotal(),
          tax: calculateTax(),
          discount: discount,
          total: calculateTotal(),
          notes: notes || undefined,
          signatureUrl: signatureUrl || undefined,
          agentName: user.name,
          agentEmail: user.email,
          agentPhone: agentPhone,
          leaderName: leaderName,
          paymentMethod: paymentMethod,
          paymentProofUrl: paymentProofUrl,
          requestSalesInvoice: requestSalesInvoice
        });

        setEmailSentSuccessfully(true);
        emailSent = true;
        console.log('📧 Order confirmation email sent to client');
      } catch (emailError: any) {
        setEmailSentSuccessfully(false);
        emailSent = false;
        console.error('Failed to send email, but order was created:', emailError);

        // Show warning toast about email failure
        toast({
          title: 'Order Created - Email Warning',
          description: `Order ${generatedOrderNumber} was created successfully, but failed to send confirmation email to ${clientEmail}. You may want to contact the client manually.`,
          variant: 'destructive',
          duration: 8000
        });
      }

      // Close confirmation modal
      setShowConfirmModal(false);

      // Reset all form data
      resetForm();

      // Show different messages based on email status
      if (emailSent) {
        toast({
          title: 'Success',
          description: `Order ${generatedOrderNumber} created successfully and confirmation email sent to ${clientEmail}`,
          duration: 5000
        });
      } else {
        // This won't show if we already showed the warning above
        // But keep it as fallback
        toast({
          title: 'Order Created',
          description: `Order ${generatedOrderNumber} created successfully`,
          duration: 5000
        });
      }
    } catch (error: any) {
      console.error('Error creating order:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create order. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setUploadingSignature(false);
    }
  };

  const handleCreateOrder = async () => {
    // This function is now replaced by handlePrepareOrderForSignature
    handlePrepareOrderForSignature();
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold">My Orders</h1>
          <p className="text-sm md:text-base text-muted-foreground">Create and manage your client orders</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create New Order
            </Button>
          </DialogTrigger>
          <DialogContent
            className="max-w-[90vw] sm:max-w-2xl md:max-w-4xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden p-3 sm:p-6"
            onInteractOutside={(e) => {
              // Prevent closing when clicking outside the dialog
              e.preventDefault();
            }}
          >
            <DialogHeader className="pb-1 sm:pb-4">
              <DialogTitle className="text-base sm:text-xl">Create New Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-6 py-1 sm:py-4">
              {/* Order Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <Label>Order Number</Label>
                  <Input value="Auto-generated by system" disabled className="text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Order number will be assigned automatically
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Order Date</Label>
                  <Input
                    type="date"
                    value={orderDate}
                    disabled
                    readOnly
                    className="text-muted-foreground bg-muted cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">
                    Order date is set to today's date automatically
                  </p>
                </div>
              </div>

              {/* Client Selection */}
              <div className="space-y-2">
                <Label>Select Client *</Label>

                {/* Search Bar */}
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search clients by name, company, or email..."
                        value={clientSearchQuery}
                        onChange={(e) => setClientSearchQuery(e.target.value)}
                        className="pl-10 pr-10"
                        onFocus={() => setShowClientSearch(true)}
                      />
                      {clientSearchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                          onClick={clearClientSearch}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowClientSearch(!showClientSearch)}
                    >
                      {showClientSearch ? 'Hide' : 'Show'} All
                    </Button>
                  </div>

                  {/* Search Results Dropdown */}
                  {showClientSearch && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredClients.length > 0 ? (
                        filteredClients.map((client) => (
                          <div
                            key={client.id}
                            className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                            onClick={() => {
                              handleClientSelect(client.id);
                              setShowClientSearch(false);
                              setClientSearchQuery('');
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{client.name}</span>
                              {client.company && (
                                <span className="text-xs text-muted-foreground">{client.company}</span>
                              )}
                              {client.email && (
                                <span className="text-xs text-blue-600">{client.email}</span>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 text-sm text-muted-foreground text-center">
                          {clientSearchQuery ? 'No clients found matching your search' : 'No clients available'}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Client Display */}
                {selectedClientId && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-green-800">{clientName}</span>
                          {clientCompany && (
                            <span className="text-sm text-green-600">• {clientCompany}</span>
                          )}
                        </div>
                        {clientEmail && (
                          <p className="text-sm text-green-700 mt-1">
                            📧 {clientEmail}
                          </p>
                        )}
                        <p className="text-xs text-green-600 mt-1">Client selected</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedClientId('');
                          setClientName('');
                          setClientCompany('');
                          setClientEmail('');
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Fallback Select for when search is not used */}
                {!showClientSearch && !selectedClientId && (
                  <Select value={selectedClientId} onValueChange={handleClientSelect} disabled={loadingClients}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingClients ? "Loading clients..." : "Choose a client from your list"} />
                    </SelectTrigger>
                    <SelectContent>
                      {myClients.length > 0 ? (
                        myClients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{client.name}</span>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {client.company && <span>{client.company}</span>}
                                {client.email && <span>• {client.email}</span>}
                              </div>
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-clients" disabled>
                          No clients found. Add clients first.
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}

                <p className="text-xs text-muted-foreground">
                  Search by name, company, or email to quickly find your client
                </p>
              </div>

              {/* Brand Selection */}
              <div className="space-y-2">
                <Label>Select Brand *</Label>
                <Select value={selectedBrandName} onValueChange={setSelectedBrandName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a brand from your inventory" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentBrands.map((brand) => (
                      <SelectItem key={brand.id} value={brand.name}>
                        {brand.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select the brand the client wants to order
                </p>
              </div>

              {/* Products Selection */}
              {selectedBrand && (
                <div className="border rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4">
                  <Label className="text-sm sm:text-base font-semibold">Select Products</Label>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Choose products from your allocated inventory
                  </p>

                  {/* Flavors */}
                  {selectedBrand.flavors.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm text-blue-700 flex items-center gap-2">
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">Flavors</Badge>
                        Available: {selectedBrand.flavors.length}
                      </h4>
                      <div className="space-y-2 pl-4">
                        {selectedBrand.flavors.map((flavor) => {
                          const selectedItem = selectedItems.find(item => item.variantId === flavor.id);
                          const currentQuantity = selectedItem?.quantity || 0;

                          // Prefer explicit sellingPrice when present (including 0); fallback to effective price
                          const flavorUnitPrice = (flavor as any).sellingPrice ?? flavor.price;
                          return (
                            <div key={flavor.id} className="p-3 sm:p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                              {/* Mobile: Card Layout */}
                              <div className="block sm:hidden space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{flavor.name}</p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      <Badge variant={flavor.status === 'available' ? 'default' : 'secondary'} className="text-xs">
                                        {flavor.stock} in stock
                                      </Badge>
                                      <span className="text-sm font-semibold text-blue-700">₱{flavorUnitPrice.toFixed(2)}</span>
                                    </div>
                                    {flavor.stock === 0 && (
                                      <p className="text-xs text-red-600 mt-1">No more stock available</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 pt-2 border-t border-blue-200">
                                  <Label className="text-xs font-medium">Qty:</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    max={flavor.stock}
                                    value={currentQuantity === 0 ? '' : currentQuantity}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      const quantity = value === '' ? 0 : parseInt(value) || 0;
                                      handleQuantityChange(
                                        flavor.id,
                                        quantity,
                                        selectedBrand.name,
                                        flavor.name,
                                        'flavor',
                                        flavorUnitPrice,
                                        flavor.stock,
                                        (flavor as any).sellingPrice,
                                        (flavor as any).dspPrice,
                                        (flavor as any).rspPrice
                                      );
                                    }}
                                    className="w-24 h-9"
                                    disabled={flavor.stock === 0}
                                  />
                                </div>
                              </div>
                              {/* Desktop: Row Layout */}
                              <div className="hidden sm:flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                  <span className="font-medium">{flavor.name}</span>
                                  <Badge variant={flavor.status === 'available' ? 'default' : 'secondary'} className="text-xs">
                                    {flavor.stock} in stock
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">₱{flavorUnitPrice.toFixed(2)}</span>
                                </div>
                                {flavor.stock === 0 ? (
                                  <span className="text-xs text-red-600">No more stock available</span>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs">Qty:</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      max={flavor.stock}
                                      value={currentQuantity === 0 ? '' : currentQuantity}
                                      placeholder="0"
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const quantity = value === '' ? 0 : parseInt(value) || 0;
                                        handleQuantityChange(
                                          flavor.id,
                                          quantity,
                                          selectedBrand.name,
                                          flavor.name,
                                          'flavor',
                                          flavorUnitPrice,
                                          flavor.stock
                                        );
                                      }}
                                      className="w-20 h-8"
                                      disabled={flavor.stock === 0}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Batteries */}
                  {selectedBrand.batteries.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm text-green-700 flex items-center gap-2">
                        <Badge variant="secondary" className="bg-green-100 text-green-700">Batteries</Badge>
                        Available: {selectedBrand.batteries.length}
                      </h4>
                      <div className="space-y-2 pl-4">
                        {selectedBrand.batteries.map((battery) => {
                          const selectedItem = selectedItems.find(item => item.variantId === battery.id);
                          const currentQuantity = selectedItem?.quantity || 0;

                          const batteryUnitPrice = (battery as any).sellingPrice ?? battery.price;
                          return (
                            <div key={battery.id} className="p-3 sm:p-4 bg-green-50/50 rounded-lg border border-green-100">
                              {/* Mobile: Card Layout */}
                              <div className="block sm:hidden space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{battery.name}</p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      <Badge variant={battery.status === 'available' ? 'default' : 'secondary'} className="text-xs">
                                        {battery.stock} in stock
                                      </Badge>
                                      <span className="text-sm font-semibold text-green-700">₱{batteryUnitPrice.toFixed(2)}</span>
                                    </div>
                                    {battery.stock === 0 && (
                                      <p className="text-xs text-red-600 mt-1">No more stock available</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 pt-2 border-t border-green-200">
                                  <Label className="text-xs font-medium">Qty:</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    max={battery.stock}
                                    value={currentQuantity === 0 ? '' : currentQuantity}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      const quantity = value === '' ? 0 : parseInt(value) || 0;
                                      handleQuantityChange(
                                        battery.id,
                                        quantity,
                                        selectedBrand.name,
                                        battery.name,
                                        'battery',
                                        batteryUnitPrice,
                                        battery.stock,
                                        (battery as any).sellingPrice,
                                        (battery as any).dspPrice,
                                        (battery as any).rspPrice
                                      );
                                    }}
                                    className="w-24 h-9"
                                    disabled={battery.stock === 0}
                                  />
                                </div>
                              </div>
                              {/* Desktop: Row Layout */}
                              <div className="hidden sm:flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                  <span className="font-medium">{battery.name}</span>
                                  <Badge variant={battery.status === 'available' ? 'default' : 'secondary'} className="text-xs">
                                    {battery.stock} in stock
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">₱{batteryUnitPrice.toFixed(2)}</span>
                                </div>
                                {battery.stock === 0 ? (
                                  <span className="text-xs text-red-600">No more stock available</span>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs">Qty:</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      max={battery.stock}
                                      value={currentQuantity === 0 ? '' : currentQuantity}
                                      placeholder="0"
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const quantity = value === '' ? 0 : parseInt(value) || 0;
                                        handleQuantityChange(
                                          battery.id,
                                          quantity,
                                          selectedBrand.name,
                                          battery.name,
                                          'battery',
                                          batteryUnitPrice,
                                          battery.stock
                                        );
                                      }}
                                      className="w-20 h-8"
                                      disabled={battery.stock === 0}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Selected Items Summary */}
              {selectedItems.length > 0 && (
                <div className="border rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3 bg-muted/30">
                  <Label className="text-sm sm:text-base font-semibold">Order Summary ({selectedItems.length} items)</Label>
                  <div className="space-y-2 max-h-48 sm:max-h-60 overflow-y-auto">
                    {selectedItems.map((item) => (
                      <div key={item.variantId} className="bg-background p-3 sm:p-3 rounded-md border">
                        {/* Mobile: Card Layout */}
                        <div className="block sm:hidden space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{item.variantName}</p>
                              <Badge
                                variant="secondary"
                                className={`mt-1 ${item.variantType === 'flavor' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}
                              >
                                {item.variantType}
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveItem(item.variantId)}
                              className="h-8 w-8"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                            <div>
                              <p className="text-xs text-muted-foreground">Quantity</p>
                              <p className="font-medium">{item.quantity} units</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Unit Price</p>
                              <p className="font-medium">₱{item.unitPrice.toLocaleString()}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-xs text-muted-foreground">Total</p>
                              <p className="font-semibold text-base">₱{(item.quantity * item.unitPrice).toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                        {/* Desktop: Grid Layout */}
                        <div className="hidden sm:flex items-center justify-between">
                          <div className="flex-1 grid grid-cols-4 gap-2 sm:gap-4 text-xs sm:text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground">Product</p>
                              <p className="font-medium">{item.variantName}</p>
                              <Badge
                                variant="secondary"
                                className={item.variantType === 'flavor' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}
                              >
                                {item.variantType}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Quantity</p>
                              <p>{item.quantity} units</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Unit Price</p>
                              <p>₱{item.unitPrice.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Total</p>
                              <p className="font-semibold">₱{(item.quantity * item.unitPrice).toLocaleString()}</p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(item.variantId)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pricing */}
              {selectedItems.length > 0 && (
                isAdmin ? (
                  <div className="border rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3">
                    <Label className="text-sm sm:text-base font-semibold">Pricing Details</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                      <div className="space-y-2">
                        <Label>Tax Rate (%)</Label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={taxRate}
                          onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Discount (₱)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={discount}
                          onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span className="font-medium">₱{calculateSubtotal().toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tax ({taxRate}%):</span>
                        <span className="font-medium">₱{calculateTax().toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Discount:</span>
                        <span className="font-medium">- ₱{discount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-lg font-bold border-t pt-2">
                        <span>Total Amount:</span>
                        <span>₱{calculateTotal().toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-lg p-3 sm:p-4 space-y-2 sm:space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span className="font-medium">₱{calculateSubtotal().toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>Total Amount:</span>
                      <span>₱{calculateTotal().toLocaleString()}</span>
                    </div>
                  </div>
                )
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes (Optional)</Label>
                <Textarea
                  placeholder="Add any notes or special instructions..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <Button
                className="w-full min-h-[44px]"
                onClick={handleCreateOrder}
                disabled={selectedItems.length === 0}
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Create Order
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">My Total Orders</p>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold">{myOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Pending Approval</p>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-yellow-600">
              {myOrders.filter(o => (o.stage || o.status) === 'agent_pending').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <p className="text-sm font-medium">Approved Orders</p>
          </CardHeader>
          <CardContent>
            <div className="text-xl md:text-2xl font-bold text-green-600">
              {myOrders.filter(o => o.status === 'approved').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-4">
          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Start Date Filter */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                placeholder="Start Date"
                value={dateFilterStart}
                onChange={(e) => setDateFilterStart(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* End Date Filter */}
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                placeholder="End Date"
                value={dateFilterEnd}
                onChange={(e) => setDateFilterEnd(e.target.value)}
                className="pl-10"
                min={dateFilterStart}
              />
            </div>
          </div>

          {/* Clear Filters Button */}
          {(dateFilterStart || dateFilterEnd || searchQuery) && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDateFilterStart('');
                  setDateFilterEnd('');
                  setSearchQuery('');
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear Filters
              </Button>
            </div>
          )}

          {/* Results Count */}
          <div className="flex justify-between items-center text-sm text-muted-foreground">
            <div>
              Showing {paginatedOrders.length} of {filteredOrders.length} orders
              {(dateFilterStart || dateFilterEnd) && (
                <span className="ml-2">
                  {dateFilterStart && dateFilterEnd
                    ? `from ${new Date(dateFilterStart).toLocaleDateString()} to ${new Date(dateFilterEnd).toLocaleDateString()}`
                    : ''}
                </span>
              )}
            </div>
            {totalPages > 1 && (
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile: card list */}
          <div className="md:hidden space-y-3">
            {paginatedOrders.length === 0 ? (
              <div className="text-center text-muted-foreground py-6">No orders found</div>
            ) : (
              paginatedOrders.map((order) => (
                <div key={order.id} className="rounded-lg border bg-background p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Order #</div>
                      <div className="font-mono font-semibold">{order.orderNumber}</div>
                    </div>
                    <Badge variant={getDisplayStatus(order).variant}>
                      {getDisplayStatus(order).text}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Client</div>
                      <div className="font-medium truncate">{order.clientName}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Date</div>
                      <div>{new Date(order.date).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Items</div>
                      <div>{order.items.length}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Total</div>
                      <div className="font-semibold">₱{order.total.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => handleViewOrder(order)}>
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop/Tablet: table */}
          <div className="hidden md:block w-full overflow-x-auto">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono font-medium">{order.orderNumber}</TableCell>
                    <TableCell>{order.clientName}</TableCell>
                    <TableCell>{new Date(order.date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">{order.items.length}</TableCell>
                    <TableCell className="text-right font-semibold">
                      ₱{order.total.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getDisplayStatus(order).variant}>
                        {getDisplayStatus(order).text}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => handleViewOrder(order)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * ordersPerPage + 1} to {Math.min(currentPage * ordersPerPage, filteredOrders.length)} of {filteredOrders.length} orders
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant={page === currentPage ? 'default' : 'outline'}
                      size="icon"
                      className="w-10"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signature Modal */}
      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent
          className="max-w-[90vw] sm:max-w-lg md:max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden p-3 sm:p-6"
          onInteractOutside={(e) => {
            // Prevent closing when clicking outside the dialog
            e.preventDefault();
          }}
        >
          <DialogHeader className="pb-1 sm:pb-4">
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
              <FileSignature className="h-3 w-3 sm:h-5 sm:w-5" />
              Client Signature Required
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 sm:space-y-4 py-1 sm:py-4">
            <Alert className="py-2 sm:py-3">
              <AlertDescription className="text-xs sm:text-sm">
                Please have the client draw their signature below. This will be used to confirm the order.
              </AlertDescription>
            </Alert>

            <SignatureCanvas
              onSave={handleSignatureCaptured}
              onCancel={() => {
                setShowSignatureModal(false);
                setCreateDialogOpen(true);
              }}
              title="Client Signature"
              description="Draw the client's signature in the area below"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Method Selection Modal */}
      <Dialog open={showPaymentMethodModal} onOpenChange={setShowPaymentMethodModal}>
        <DialogContent
          className="max-w-[90vw] sm:max-w-md max-h-[85vh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden p-3 sm:p-6"
          onInteractOutside={(e) => {
            // Prevent closing when clicking outside the dialog
            e.preventDefault();
          }}
        >
          <DialogHeader className="pb-1 sm:pb-4">
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
              <CreditCard className="h-3 w-3 sm:h-5 sm:w-5" />
              Select Payment Method
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 sm:space-y-4 py-1 sm:py-4">
            <Alert className="py-2 sm:py-3">
              <AlertDescription className="text-xs sm:text-sm">
                Please select the payment method the client used for this order.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 gap-2 sm:gap-3">
              <Button
                variant={paymentMethod === 'GCASH' ? 'default' : 'outline'}
                className="h-14 sm:h-16 flex items-center justify-center gap-2 sm:gap-3 min-h-[44px]"
                onClick={() => handlePaymentMethodSelected('GCASH')}
              >
                <CreditCard className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-base sm:text-lg font-semibold">GCash</span>
              </Button>

              <Button
                variant={paymentMethod === 'BANK_TRANSFER' ? 'default' : 'outline'}
                className="h-14 sm:h-16 flex items-center justify-center gap-2 sm:gap-3 min-h-[44px]"
                onClick={() => handlePaymentMethodSelected('BANK_TRANSFER')}
              >
                <CreditCard className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-base sm:text-lg font-semibold">Bank Transfer</span>
              </Button>

              <Button
                variant={paymentMethod === 'CASH' ? 'default' : 'outline'}
                className="h-14 sm:h-16 flex items-center justify-center gap-2 sm:gap-3 min-h-[44px]"
                onClick={() => handlePaymentMethodSelected('CASH')}
              >
                <CreditCard className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-base sm:text-lg font-semibold">Cash</span>
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 sm:pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPaymentMethodModal(false);
                  setShowSignatureModal(true);
                }}
                className="w-full sm:w-auto min-h-[44px]"
              >
                Back
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Proof Capture Modal */}
      <Dialog open={showPaymentProofModal} onOpenChange={setShowPaymentProofModal}>
        <DialogContent
          className="max-w-[90vw] sm:max-w-lg md:max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden p-3 sm:p-6"
          onInteractOutside={(e) => {
            // Prevent closing when clicking outside the dialog
            e.preventDefault();
          }}
        >
          <DialogHeader className="pb-1 sm:pb-4">
            <DialogTitle className="flex items-center gap-2 text-sm sm:text-lg">
              <Camera className="h-3 w-3 sm:h-5 sm:w-5" />
              Capture Payment Proof
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 sm:space-y-4 py-1 sm:py-4">
            <Alert className="py-2 sm:py-3">
              <AlertDescription className="text-xs sm:text-sm">
                Please take a picture or upload a file showing the payment proof for <strong>{paymentMethod === 'GCASH' ? 'GCash' : paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : 'Cash'}</strong> payment.
              </AlertDescription>
            </Alert>

            {/* Payment Method Display */}
            {paymentMethod && (
              <div className="flex items-center justify-center">
                <Badge className="text-base px-4 py-2">
                  {paymentMethod === 'GCASH' ? 'GCash' : paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : 'Cash'}
                </Badge>
              </div>
            )}

            {/* Camera Preview */}
            {showCamera && (
              <div className="space-y-2">
                <Label>Camera Preview</Label>
                <div className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-black">
                  <video
                    ref={(el) => {
                      setVideoRef(el);
                      if (el && cameraStream) {
                        el.srcObject = cameraStream;
                        el.play().catch(err => console.error('Error playing video:', err));
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-64 object-cover"
                  />
                  <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={stopCamera}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={switchCamera}
                      className="bg-gray-700 hover:bg-gray-800 text-white"
                      title={facingMode === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {facingMode === 'user' ? 'Back' : 'Front'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={capturePhoto}
                      className="bg-white hover:bg-gray-100 text-gray-900"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Capture
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* File Input / Camera Controls */}
            {!showCamera && (
              <div className="space-y-2">
                <Label>Payment Proof</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => startCamera()}
                    className="w-full min-h-[44px]"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Take Photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const input = document.getElementById('payment-proof-input') as HTMLInputElement;
                      input?.click();
                    }}
                    className="w-full min-h-[44px]"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload File
                  </Button>
                </div>
                <Input
                  id="payment-proof-input"
                  type="file"
                  accept="image/*"
                  onChange={handlePaymentProofFileChange}
                  className="hidden"
                />
                {paymentProofFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {paymentProofFile.name} ({(paymentProofFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
                {!paymentProofFile && !showCamera && (
                  <p className="text-sm text-muted-foreground">
                    Take a photo using your camera or select an image file showing the payment receipt/proof
                  </p>
                )}
              </div>
            )}

            {/* Preview */}
            {paymentProofPreview && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white">
                  <img
                    src={paymentProofPreview}
                    alt="Payment proof preview"
                    className="w-full h-64 object-contain rounded"
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 sm:pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPaymentProofModal(false);
                  setShowPaymentMethodModal(true);
                }}
                className="w-full sm:w-auto min-h-[44px]"
              >
                Back
              </Button>
              <Button
                onClick={handlePaymentProofCaptured}
                disabled={!paymentProofFile || uploadingPaymentProof}
                className="w-full sm:w-auto min-h-[44px]"
              >
                {uploadingPaymentProof ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent
          className="max-w-[90vw] sm:max-w-lg md:max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden p-3 sm:p-6"
          onInteractOutside={(e) => {
            // Prevent closing when clicking outside the dialog
            e.preventDefault();
          }}
        >
          <DialogHeader className="pb-1 sm:pb-4">
            <DialogTitle className="text-sm sm:text-lg">Confirm Order Creation</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 sm:space-y-4 py-1 sm:py-4 max-h-[calc(85vh-80px)] sm:max-h-[calc(90vh-140px)] overflow-y-auto">
            <Alert className="py-2 sm:py-3">
              <AlertDescription className="text-xs sm:text-sm">
                Please review the order details below. Once confirmed, the order will be submitted for approval.
              </AlertDescription>
            </Alert>

            {/* Signature Preview */}
            {signatureDataUrl && (
              <div className="space-y-2">
                <Label className="font-semibold">Captured Signature</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white">
                  <img
                    src={signatureDataUrl}
                    alt="Signature preview"
                    className="w-full h-32 object-contain"
                  />
                </div>
              </div>
            )}

            {/* Order Summary */}
            <div className="space-y-2 sm:space-y-3 border rounded-lg p-3 sm:p-4">
              <h4 className="font-semibold text-base sm:text-lg">Order Summary</h4>

              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Client:</span>
                  <span className="font-medium">{clientName}</span>
                </div>
                {clientCompany && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Company:</span>
                    <span className="font-medium">{clientCompany}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Brand:</span>
                  <span className="font-medium">{selectedBrandName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items:</span>
                  <span className="font-medium">{selectedItems.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Items Quantity:</span>
                  <span className="font-medium">
                    {selectedItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                </div>
                <div className="flex justify-between text-base font-bold border-t pt-2">
                  <span>Total Amount:</span>
                  <span>₱{calculateTotal().toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Payment Method Display */}
            {paymentMethod && (
              <div className="space-y-2 border rounded-lg p-4">
                <Label className="font-semibold">Payment Method</Label>
                <Badge className="text-base px-3 py-1">
                  {paymentMethod === 'GCASH' ? 'GCash' : paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : 'Cash'}
                </Badge>
              </div>
            )}

            {/* Payment Proof Preview */}
            {paymentProofPreview && (
              <div className="space-y-2">
                <Label className="font-semibold">Payment Proof</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white">
                  <img
                    src={paymentProofPreview}
                    alt="Payment proof preview"
                    className="w-full h-48 object-contain rounded"
                  />
                </div>
              </div>
            )}

            {/* Sales Invoice Checkbox */}
            <div className="flex items-center space-x-2 pt-2 border-t">
              <Checkbox
                id="request-sales-invoice"
                checked={requestSalesInvoice}
                onCheckedChange={(checked) => setRequestSalesInvoice(checked === true)}
              />
              <Label
                htmlFor="request-sales-invoice"
                className="text-sm font-normal cursor-pointer"
              >
                Request for Sales Invoice
              </Label>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 sm:pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirmModal(false);
                  setShowPaymentProofModal(true);
                }}
                disabled={uploadingSignature || uploadingPaymentProof}
                className="w-full sm:w-auto min-h-[44px]"
              >
                Back to Payment Proof
              </Button>
              <Button
                onClick={() => {
                  if (requestSalesInvoice) {
                    setShowWithInvoiceConfirmModal(true);
                  } else {
                    setShowNoInvoiceConfirmModal(true);
                  }
                }}
                disabled={uploadingSignature || uploadingPaymentProof}
                className="w-full sm:w-auto min-h-[44px]"
              >
                {(uploadingSignature || uploadingPaymentProof) ? (
                  <>
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Submitting Order...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    Confirm & Create Order
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal - Without Sales Invoice */}
      <AlertDialog
        open={showNoInvoiceConfirmModal}
        onOpenChange={setShowNoInvoiceConfirmModal}
      >
        <AlertDialogContent
          {...({
            onPointerDownOutside: (e: Event) => {
              // Prevent closing when clicking outside the dialog
              e.preventDefault();
            },
            onEscapeKeyDown: (e: KeyboardEvent) => {
              // Prevent closing when pressing Escape
              e.preventDefault();
            }
          } as any)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Continue Without Sales Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to continue the order without requesting a sales invoice?
              <br /><br />
              The order will be created without a sales invoice request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowNoInvoiceConfirmModal(false);
              handleConfirmAndSubmitOrder();
            }}>
              Continue Without Invoice
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation Modal - With Sales Invoice */}
      <AlertDialog
        open={showWithInvoiceConfirmModal}
        onOpenChange={setShowWithInvoiceConfirmModal}
      >
        <AlertDialogContent
          {...({
            onPointerDownOutside: (e: Event) => {
              // Prevent closing when clicking outside the dialog
              e.preventDefault();
            },
            onEscapeKeyDown: (e: KeyboardEvent) => {
              // Prevent closing when pressing Escape
              e.preventDefault();
            }
          } as any)}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Order Creation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to confirm this order?
              <br /><br />
              This order includes a request for a sales invoice, which will be included in the emails sent to the client and IT department.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowWithInvoiceConfirmModal(false);
              handleConfirmAndSubmitOrder();
            }}>
              Confirm Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Order Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
          </DialogHeader>
          {orderToView && (
            <div className="space-y-6 py-4">
              {/* Order Number and Status */}
              <div className="flex justify-between items-center pb-4 border-b">
                <div>
                  <h3 className="text-xl md:text-2xl font-bold">{orderToView.orderNumber}</h3>
                  <p className="text-sm text-muted-foreground">Client Order</p>
                </div>
                <Badge
                  variant={
                    orderToView.status === 'approved' ? 'default' :
                      orderToView.status === 'pending' ? 'secondary' :
                        'destructive'
                  }
                  className="text-base px-4 py-2"
                >
                  {orderToView.status.toUpperCase()}
                </Badge>
              </div>

              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Order Date</Label>
                  <p className="font-medium">{new Date(orderToView.date).toLocaleDateString()}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Client Name</Label>
                  <p className="font-medium">{orderToView.clientName}</p>
                </div>
              </div>

              {/* Agent Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-lg">Sales Agent</h4>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-medium">{orderToView.agentName}</p>
                  <p className="text-sm text-muted-foreground">Agent ID: {orderToView.agentId}</p>
                </div>
              </div>

              {/* Items - Responsive */}
              <div className="space-y-2">
                <h4 className="font-semibold text-lg">Items</h4>
                {/* Mobile: card list */}
                <div className="md:hidden space-y-2">
                  {orderToView.items && orderToView.items.length > 0 ? (
                    orderToView.items.map((item: any) => (
                      <div key={item.id} className="rounded-lg border bg-background p-3">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{item.variantName}</div>
                            <div className="text-xs text-muted-foreground truncate">{item.brandName}</div>
                          </div>
                          <Badge variant={item.variantType === 'flavor' ? 'default' : 'secondary'}>
                            {item.variantType}
                          </Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground">Qty</div>
                            <div>{item.quantity}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-muted-foreground">Unit</div>
                            <div>₱{item.unitPrice.toFixed(2)}</div>
                          </div>
                          <div className="col-span-2 flex justify-between border-t pt-2 font-medium">
                            <span>Total</span>
                            <span>₱{item.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                      No items found for this order
                    </div>
                  )}
                </div>

                {/* Desktop/Tablet: table */}
                <div className="hidden md:block border rounded-lg">
                  {orderToView.items && orderToView.items.length > 0 ? (
                    <div className="w-full overflow-x-auto">
                      <Table className="min-w-[640px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Brand</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderToView.items.map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.brandName}</TableCell>
                              <TableCell>{item.variantName}</TableCell>
                              <TableCell>
                                <Badge variant={item.variantType === 'flavor' ? 'default' : 'secondary'}>
                                  {item.variantType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">₱{item.unitPrice.toFixed(2)}</TableCell>
                              <TableCell className="text-right font-semibold">₱{item.total.toFixed(2)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No items found for this order
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Information */}
              {orderToView.paymentMethod && (
                <div className="space-y-3 border-t pt-4">
                  <h4 className="font-semibold text-lg">Payment Information</h4>
                  <div className="space-y-2">
                    <div>
                      <Label className="text-muted-foreground">Payment Method</Label>
                      <p className="font-medium">
                        {orderToView.paymentMethod === 'GCASH' ? 'GCash' :
                          orderToView.paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' :
                            'Cash'}
                      </p>
                    </div>
                    {orderToView.paymentProofUrl && (
                      <div>
                        <Label className="text-muted-foreground">Payment Proof</Label>
                        <div className="mt-2 border rounded-lg overflow-hidden bg-white">
                          <img
                            src={orderToView.paymentProofUrl}
                            alt="Payment Proof"
                            className="w-full h-auto max-h-96 object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2YjcyODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Client Signature */}
              {orderToView.signatureUrl && (
                <div className="space-y-3 border-t pt-4">
                  <h4 className="font-semibold text-lg flex items-center gap-2">
                    <FileSignature className="h-5 w-5" />
                    Client Signature
                  </h4>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white">
                    <img
                      src={orderToView.signatureUrl}
                      alt="Client signature"
                      className="w-full h-40 object-contain"
                      onClick={() => {
                        // Open signature in new window for full view
                        const newWindow = window.open();
                        if (newWindow) {
                          newWindow.document.write(`
                            <html>
                              <head>
                                <title>Client Signature - ${orderToView.orderNumber}</title>
                                <style>
                                  body {
                                    margin: 0;
                                    display: flex;
                                    justify-content: center;
                                    align-items: center;
                                    min-height: 100vh;
                                    background: #f5f5f5;
                                  }
                                  img {
                                    max-width: 90%;
                                    max-height: 90vh;
                                    object-fit: contain;
                                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                                    background: white;
                                    padding: 20px;
                                  }
                                </style>
                              </head>
                              <body>
                                <img src="${orderToView.signatureUrl}" alt="Client Signature" />
                              </body>
                            </html>
                          `);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Click image to view full size
                    </p>
                  </div>
                </div>
              )}

              {/* Pricing Summary */}
              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">₱{orderToView.subtotal.toFixed(2)}</span>
                </div>
                {isAdmin && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax (12%):</span>
                      <span className="font-medium">₱{orderToView.tax.toFixed(2)}</span>
                    </div>
                    {orderToView.discount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Discount:</span>
                        <span className="font-medium text-green-600">- ₱{orderToView.discount.toFixed(2)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total Amount:</span>
                  <span>₱{orderToView.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Notes */}
              {orderToView.notes && (
                <div className="space-y-2">
                  <Label className="font-semibold">Notes</Label>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">{orderToView.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
