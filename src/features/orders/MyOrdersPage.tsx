import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Eye, Trash2, ShoppingCart, X, FileSignature, ChevronLeft, ChevronRight, Calendar, CreditCard, Camera, RotateCcw, Smartphone, CheckCircle, Split, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useOrders, type OrderItem, type PaymentSplit } from './OrderContext';
import { useAuth } from '@/features/auth';
import { useAgentInventory } from '@/features/inventory/hooks';
import { supabase } from '@/lib/supabase';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { sendOrderConfirmationEmail } from '@/lib/email.helpers';
import { usePaymentSettings } from '@/features/finance/hooks/usePaymentSettings';
import type { BankAccount } from '@/types/database.types';
import { PRICING_OPTIONS, type PricingColumn } from '@/types/database.types';

interface SelectedItem {
  variantId: string;
  brandName: string;
  variantName: string;
  variantType: 'flavor' | 'battery' | 'posm';
  unitPrice: number;
  sellingPrice?: number;
  dspPrice?: number;
  rspPrice?: number;
  availableStock: number;
  quantity: number;
  customPrice?: number; // For special pricing
}

export default function MyOrdersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canCustomizePricing = ['team_leader', 'manager', 'admin'].includes(user?.role || '');
  const { getOrdersByAgent, addOrder, orders: allOrders } = useOrders();
  const { agentBrands } = useAgentInventory();
  const [searchQuery, setSearchQuery] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  // Auto-determined pricing based on company configuration
  const [allowedPricingStrategies, setAllowedPricingStrategies] = useState<string[]>([]);
  const [loadingPricingConfig, setLoadingPricingConfig] = useState(true);

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

  // Helper function to format payment / split payment summary
  const formatPaymentSummary = (order: any) => {
    // Split payment: show indicator + methods/banks
    if (order.paymentMode === 'SPLIT' && Array.isArray(order.paymentSplits) && order.paymentSplits.length > 0) {
      const parts = order.paymentSplits.map((split: any) => {
        if (split.method === 'BANK_TRANSFER') {
          return split.bank ? split.bank : 'Bank Transfer';
        }
        if (split.method === 'GCASH') return 'GCash';
        if (split.method === 'CASH') return 'Cash';
        if (split.method === 'CHEQUE') return 'Cheque';
        return split.method;
      });
      return `Split Payment: ${parts.join(' + ')}`;
    }

    // Full payment: fall back to legacy formatting
    const method = order.paymentMethod as string | undefined;
    const bankType = order.bankType as string | undefined;

    if (!method) return 'N/A';
    switch (method) {
      case 'GCASH':
        return 'GCash';
      case 'BANK_TRANSFER':
        return bankType ? `Bank Transfer (${bankType})` : 'Bank Transfer';
      case 'CASH':
        return 'Cash';
      case 'CHEQUE':
        return 'Cheque';
      default:
        return method;
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
  const [paymentMethod, setPaymentMethod] = useState<'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | null>(null);
  const [showBankSelectionModal, setShowBankSelectionModal] = useState(false);
  const [selectedBank, setSelectedBank] = useState<BankAccount | null>(null);
  const [showPaymentProofModal, setShowPaymentProofModal] = useState(false);
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [paymentProofPreview, setPaymentProofPreview] = useState<string | null>(null);
  const [uploadingPaymentProof, setUploadingPaymentProof] = useState(false);
  const paymentProofInputRef = useRef<HTMLInputElement>(null);

  // Split payment states
  const [paymentMode, setPaymentMode] = useState<'FULL' | 'SPLIT'>('FULL');
  const [showPaymentModeDialog, setShowPaymentModeDialog] = useState(false);
  const [showSplitPaymentDialog, setShowSplitPaymentDialog] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]); // Start with no selections
  const [splitValidationError, setSplitValidationError] = useState<string>('');

  // Payment settings from database
  const { settings: paymentSettings, loading: loadingPaymentSettings } = usePaymentSettings();
  
  // Get enabled bank accounts from payment settings
  const bankAccounts = paymentSettings?.bank_accounts?.filter(bank => bank.enabled) || [];

  // Log when payment settings change (for debugging real-time updates)
  useEffect(() => {
    if (paymentSettings) {
      console.log('🔄 [MyOrders] Payment settings updated:', {
        bank_transfer: paymentSettings.bank_transfer_enabled,
        gcash: paymentSettings.gcash_enabled,
        cash: paymentSettings.cash_enabled,
        cheque: paymentSettings.cheque_enabled,
        banks_count: bankAccounts.length
      });
    }
  }, [paymentSettings, bankAccounts.length]);

  // Log when payment modal is open and settings are available (to verify real-time)
  useEffect(() => {
    if (showPaymentMethodModal && paymentSettings) {
      console.log('💳 [Payment Modal] Rendering with settings:', {
        bank_transfer: paymentSettings.bank_transfer_enabled,
        gcash: paymentSettings.gcash_enabled,
        cash: paymentSettings.cash_enabled,
        cheque: paymentSettings.cheque_enabled
      });
    }
  }, [showPaymentMethodModal, paymentSettings]);

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
  const [pricingType, setPricingType] = useState<'rsp' | 'dsp' | 'special' | ''>(''); // No default - user must select
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({}); // For special pricing
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [requestSalesInvoice, setRequestSalesInvoice] = useState(false);

  // Confirmation modal states
  const [showNoInvoiceConfirmModal, setShowNoInvoiceConfirmModal] = useState(false);
  const [showWithInvoiceConfirmModal, setShowWithInvoiceConfirmModal] = useState(false);

  const myOrders = user ? getOrdersByAgent(user.id) : [];

  // Fetch company pricing configuration on mount and subscribe to real-time changes
  useEffect(() => {
    const fetchPricingConfig = async () => {
      if (!user?.company_id) {
        setLoadingPricingConfig(false);
        return;
      }

      try {
        const { data: company, error } = await supabase
          .from('companies')
          .select('team_leader_allowed_pricing, mobile_sales_allowed_pricing')
          .eq('id', user.company_id)
          .single();

        if (error) {
          console.error('Error fetching pricing config:', error);
          // Default to RSP if error
          setAllowedPricingStrategies(['rsp_price']);
          setPricingType('rsp');
          setLoadingPricingConfig(false);
          return;
        }

        // Determine allowed strategies based on user role
        let allowedStrategies: string[] = [];
        if (user.role === 'team_leader' || user.role === 'manager' || user.role === 'admin') {
          allowedStrategies = company?.team_leader_allowed_pricing || ['rsp_price'];
        } else if (user.role === 'mobile_sales' || user.role === 'sales_agent') {
          allowedStrategies = company?.mobile_sales_allowed_pricing || ['rsp_price'];
        } else {
          // Default to RSP for other roles
          allowedStrategies = ['rsp_price'];
        }

        setAllowedPricingStrategies(allowedStrategies);

        // If only ONE strategy is enabled, auto-select it (backward compatibility)
        // Otherwise, user must manually select
        if (allowedStrategies.length === 1) {
          const strategy = allowedStrategies[0];
          if (strategy === 'rsp_price') {
            setPricingType('rsp');
          } else if (strategy === 'dsp_price') {
            setPricingType('dsp');
          } else if (strategy === 'selling_price') {
            setPricingType('special');
          }
        } else {
          // Multiple strategies - no default, user must select
          setPricingType('');
        }

        console.log('✅ [Pricing Config] Loaded:', {
          role: user.role,
          allowedStrategies,
          autoSelected: allowedStrategies.length === 1
        });

      } catch (error) {
        console.error('Error in pricing config fetch:', error);
        setAllowedPricingStrategies(['rsp_price']);
        setPricingType('rsp'); // Single option, auto-select
      } finally {
        setLoadingPricingConfig(false);
      }
    };

    fetchPricingConfig();

    // Set up real-time subscription for pricing configuration changes
    if (user?.company_id) {
      console.log('🔄 [Pricing Config] Setting up real-time subscription for company:', user.company_id);
      
      const pricingChannel = supabase
        .channel(`pricing-config-${user.company_id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'companies',
            filter: `id=eq.${user.company_id}`
          },
          (payload) => {
            console.log('🔔 [Pricing Config] Real-time update received:', payload);
            
            // Re-fetch pricing config when company settings change
            fetchPricingConfig();
            
            // Show toast notification
            toast({
              title: 'Pricing Settings Updated',
              description: 'Your available pricing options have been updated by an administrator.',
            });
          }
        )
        .subscribe();

      // Cleanup subscription on unmount
      return () => {
        console.log('🔌 [Pricing Config] Unsubscribing from real-time updates');
        supabase.removeChannel(pricingChannel);
      };
    }
  }, [user?.company_id, user?.role, toast]);

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
    variantType: 'flavor' | 'battery' | 'posm',
    baseUnitPrice: number, // current displayed/effective price
    availableStock: number,
    sellingPrice?: number,
    dspPrice?: number,
    rspPrice?: number
  ) => {
    const safeQuantity = Math.min(Math.max(0, quantity), availableStock);
    const existingItemIndex = selectedItems.findIndex(item => item.variantId === variantId);

    // Determine the correct unit price based on pricing type strategy
    let finalUnitPrice = baseUnitPrice;
    const validDsp = dspPrice && dspPrice > 0 ? dspPrice : undefined;
    const validRsp = rspPrice && rspPrice > 0 ? rspPrice : undefined;
    const validSelling = sellingPrice && sellingPrice > 0 ? sellingPrice : undefined;

    // For Special Pricing, use custom price from customPrices state
    if (pricingType === 'special') {
      if (existingItemIndex >= 0) {
        // Keep existing custom price
        finalUnitPrice = selectedItems[existingItemIndex].customPrice || customPrices[variantId] || 0;
      } else {
        // Use custom price from state, or 0 if not set
        finalUnitPrice = customPrices[variantId] || 0;
      }
    } else if (pricingType === 'dsp') {
      finalUnitPrice = validDsp ?? validSelling ?? baseUnitPrice;
    } else if (pricingType === 'rsp') {
      finalUnitPrice = validRsp ?? validSelling ?? baseUnitPrice;
    }

    if (safeQuantity > 0) {
      // Add or update item
      if (existingItemIndex >= 0) {
        // Update existing item
        setSelectedItems(selectedItems.map(item =>
          item.variantId === variantId
            ? { ...item, quantity: safeQuantity, unitPrice: finalUnitPrice, customPrice: pricingType === 'special' ? finalUnitPrice : undefined }
            : item
        ));
      } else {
        // Add new item
        setSelectedItems([...selectedItems, {
          variantId,
          brandName,
          variantName,
          variantType,
          unitPrice: finalUnitPrice,
          sellingPrice,
          dspPrice,
          rspPrice,
          availableStock,
          quantity: safeQuantity,
          customPrice: pricingType === 'special' ? finalUnitPrice : undefined
        }]);
      }
    } else {
      // Remove item if quantity is 0
      if (existingItemIndex >= 0) {
        setSelectedItems(selectedItems.filter(item => item.variantId !== variantId));
        // Also remove custom price
        if (pricingType === 'special') {
          const newPrices = { ...customPrices };
          delete newPrices[variantId];
          setCustomPrices(newPrices);
        }
      }
    }
  };

  // Update item price manually (Special Pricing only)
  const handlePriceChange = (variantId: string, newPrice: number) => {
    if (pricingType !== 'special') return;

    setSelectedItems(selectedItems.map(item =>
      item.variantId === variantId
        ? { ...item, unitPrice: newPrice, customPrice: newPrice }
        : item
    ));
  };

  // Handle custom price input change
  const handleCustomPriceChange = (variantId: string, priceStr: string) => {
    const price = parseFloat(priceStr) || 0;
    setCustomPrices(prev => ({ ...prev, [variantId]: price }));
    
    // Update existing item if already selected
    const existingItem = selectedItems.find(item => item.variantId === variantId);
    if (existingItem) {
      setSelectedItems(selectedItems.map(item =>
        item.variantId === variantId
          ? { ...item, unitPrice: price, customPrice: price }
          : item
      ));
    }
  };

  // Update prices when pricing type changes (except for 'special', where we might reset or keep)
  useEffect(() => {
    if (selectedItems.length === 0) return;

    // Recalculate prices for all items based on new pricing type
    setSelectedItems(currentItems => currentItems.map(item => {
      if (pricingType === 'special') {
        return { ...item, unitPrice: 0 };
      }
      // Find the latest variant data from source of truth (agentBrands)
      let foundVariant: any = null;
      for (const brand of agentBrands) {
        const variant = (brand.allVariants || []).find(v => v.id === item.variantId);
        if (variant) {
          foundVariant = variant;
          break;
        }
      }

      // Use fresh data if available, otherwise fall back to stored item data
      const sourceData = foundVariant || item;

      // Extract prices (handling both direct properties from inventory and stored properties)
      const dspPrice = sourceData.dspPrice;
      const rspPrice = sourceData.rspPrice;
      // Inventory items use 'price' or 'sellingPrice', stored items use 'sellingPrice'
      const sellingPrice = sourceData.sellingPrice ?? sourceData.price;

      const validDsp = dspPrice && dspPrice > 0 ? dspPrice : undefined;
      const validRsp = rspPrice && rspPrice > 0 ? rspPrice : undefined;
      const validSelling = sellingPrice && sellingPrice > 0 ? sellingPrice : undefined;

      let newPrice = item.unitPrice;
      if (pricingType === 'dsp') {
        newPrice = validDsp ?? validSelling ?? item.unitPrice;
      } else if (pricingType === 'rsp') {
        newPrice = validRsp ?? validSelling ?? item.unitPrice;
      }

      // Return updated item with FRESH price data stored as well
      return {
        ...item,
        unitPrice: newPrice,
        sellingPrice: validSelling ?? item.sellingPrice,
        dspPrice: validDsp ?? item.dspPrice,
        rspPrice: validRsp ?? item.rspPrice
      };
    }));
  }, [pricingType, agentBrands]);

  const handleRemoveItem = (variantId: string) => {
    setSelectedItems(selectedItems.filter(item => item.variantId !== variantId));
  };

  const resetForm = () => {
    setSelectedClientId('');
    setClientName('');
    setClientCompany('');
    setClientEmail('');
    setSelectedBrandName('');
    
    // Reset pricing type based on allowed strategies
    if (allowedPricingStrategies.length === 1) {
      // Auto-select if only one option
      const strategy = allowedPricingStrategies[0];
      if (strategy === 'rsp_price') {
        setPricingType('rsp');
      } else if (strategy === 'dsp_price') {
        setPricingType('dsp');
      } else if (strategy === 'selling_price') {
        setPricingType('special');
      }
    } else {
      // No default if multiple options
      setPricingType('');
    }
    
    setCustomPrices({}); // Reset custom prices
    setSelectedItems([]);
    setDiscount(0);
    setNotes('');
    setClientSearchQuery('');
    setShowClientSearch(false);
    setSignatureDataUrl(null);
    setEmailSentSuccessfully(false);
    // Reset payment-related states
    setPaymentMethod(null);
    setSelectedBank(null);
    setPaymentProofFile(null);
    setPaymentProofPreview(null);
    // Reset split payment states
    setPaymentMode('FULL');
    setPaymentSplits([]); // Start with no selections
    setSplitValidationError('');
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

    // Validate pricing strategy selection
    if (allowedPricingStrategies.length > 1 && !pricingType) {
      toast({ 
        title: 'Pricing Strategy Required', 
        description: 'Please select a pricing strategy before creating the order', 
        variant: 'destructive' 
      });
      return;
    }

    // Validate custom prices for special pricing
    if (pricingType === 'special') {
      const itemsWithoutPrice = selectedItems.filter(item => {
        const customPrice = customPrices[item.variantId];
        return !customPrice || customPrice <= 0;
      });

      if (itemsWithoutPrice.length > 0) {
        toast({ 
          title: 'Custom Prices Required', 
          description: `Please enter valid prices for all selected items. ${itemsWithoutPrice.length} item(s) missing prices.`, 
          variant: 'destructive' 
        });
        return;
      }
    }

    // Close the create dialog and open signature modal
    setCreateDialogOpen(false);
    setShowSignatureModal(true);
  };

  // Handle signature capture
  const handleSignatureCaptured = (dataUrl: string) => {
    setSignatureDataUrl(dataUrl);
    setShowSignatureModal(false);
    setShowPaymentModeDialog(true); // Changed to show payment mode selector first
  };

  // Handle payment method selection
  const handlePaymentMethodSelected = (method: 'GCASH' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE') => {
    setPaymentMethod(method);
    setShowPaymentMethodModal(false);
    
    // If bank transfer, show bank selection first
    if (method === 'BANK_TRANSFER') {
      setShowBankSelectionModal(true);
    } else {
    // For GCASH, CASH, and CHEQUE, go directly to payment proof
    setShowPaymentProofModal(true);
    }
  };

  // Handle bank selection (use BankAccount shape from database.types)
  const handleBankSelected = (bank: BankAccount) => {
    setSelectedBank(bank);
    setShowBankSelectionModal(false);
    setShowPaymentProofModal(true);
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
        description: 'Unable to access camera. Please check permissions and try again.',
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
  const uploadPaymentProofToStorage = async (orderNumber?: string): Promise<string> => {
    if (!paymentProofFile || !user || !paymentMethod || !selectedClientId || !clientName) {
      throw new Error('Payment proof file, user, payment method, client ID, or client name not available');
    }

    // For bank transfer, require bank selection
    if (paymentMethod === 'BANK_TRANSFER' && !selectedBank) {
      throw new Error('Bank account must be selected for bank transfer payments');
    }

    try {
      setUploadingPaymentProof(true);

      // Use a single bucket with folders for different payment methods
      const bucketName = 'payment-proofs';

      // Determine folder and filename based on payment method
      let fileName: string;
      
      if (paymentMethod === 'BANK_TRANSFER') {
        // For bank transfer, use: bank-transfer/{bank_name}/{order_number}/filename
        if (orderNumber && selectedBank) {
          const sanitizedBankName = selectedBank.name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '-');
          
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
          fileName = `bank-transfer/${sanitizedBankName}/${orderNumber}/${dateStr}_${timeStr}.${fileExt}`;
        } else {
          // Fallback if order number not available yet
          const fileExt = paymentProofFile.name.split('.').pop() || 'jpg';
          fileName = `BANK TRANSFER/payment-proof-${Date.now()}.${fileExt}`;
        }
      } else {
        // For GCASH, CASH, and CHEQUE, use the original structure with client folder
        let paymentMethodFolder;
        if (paymentMethod === 'GCASH') {
          paymentMethodFolder = 'GCASH';
        } else if (paymentMethod === 'CHEQUE') {
          paymentMethodFolder = 'CHEQUE';
        } else {
          paymentMethodFolder = 'CASH';
        }

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
        fileName = `${paymentMethodFolder}/${clientFolderName}/${dateStr}_${timeStr}.${fileExt}`;
      }

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

  // Handle payment proof file selected (upload from device)
  const handlePaymentProofFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setPaymentProofFile(file);
      const reader = new FileReader();
      reader.onload = () => setPaymentProofPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
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

  // Split payment helper functions
  // Removed unused helper functions: updateSplit, applyPreset, autoFillAmount
  // The new design directly manipulates paymentSplits array

  const getSplitTotal = () => {
    return paymentSplits.reduce((sum, split) => sum + (split.amount || 0), 0);
  };

  const validateSplitPayment = () => {
    const total = getSplitTotal();
    const orderTotal = calculateTotal();
    const allMethodsSelected = paymentSplits.every(s => s.method);
    const allAmountsValid = paymentSplits.every(s => s.amount > 0);
    const allProofsUploaded = paymentSplits.every(s => s.proofFile);
    const totalMatches = Math.abs(total - orderTotal) < 0.01;

    if (!allMethodsSelected) {
      setSplitValidationError('Please select payment method for all splits');
      return false;
    }
    if (!allAmountsValid) {
      setSplitValidationError('Please enter amount for all splits');
      return false;
    }
    if (!allProofsUploaded) {
      setSplitValidationError('Please upload payment proof for all splits');
      return false;
    }
    if (total > orderTotal) {
      setSplitValidationError(`Split total exceeds order by ₱${(total - orderTotal).toLocaleString()}`);
      return false;
    }
    if (total < orderTotal) {
      setSplitValidationError(`Split total is ₱${(orderTotal - total).toLocaleString()} below order total`);
      return false;
    }
    
    setSplitValidationError('');
    return totalMatches;
  };

  const handleContinueWithSplit = () => {
    if (validateSplitPayment()) {
      setShowSplitPaymentDialog(false);
      setShowConfirmModal(true);
    }
  };

  // Upload split payment proof to Supabase Storage
  const uploadSplitProof = async (file: File, index: number, orderNumber: string): Promise<string> => {
    if (!user || !selectedClientId || !clientName) {
      throw new Error('User, client ID, or client name not available');
    }

    try {
      const bucketName = 'payment-proofs';
      const split = paymentSplits[index];
      
      // Determine folder based on payment method
      let folderPath: string;
      
      if (split.method === 'BANK_TRANSFER' && split.bank) {
        const sanitizedBankName = split.bank.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '-');
        folderPath = `bank-transfer/${sanitizedBankName}/${orderNumber}`;
      } else {
        // For GCASH, CASH, CHEQUE
        const sanitizeForPath = (str: string) => {
          return str
            .trim()
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        };
        
        const cleanClientName = sanitizeForPath(clientName);
        const cleanCompanyName = sanitizeForPath(clientCompany || '');
        const clientFolderName = cleanCompanyName
          ? `${cleanClientName} _ ${cleanCompanyName}`
          : cleanClientName;
        
        folderPath = `${split.method}/${clientFolderName}`;
      }
      
      // Format date and time
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const ampm = hours >= 12 ? 'pm' : 'am';
      const displayHours = hours % 12 || 12;
      const timeStr = `${displayHours}:${minutes.toString().padStart(2, '0')}${ampm}`;
      
      // Generate filename with split indicator
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${folderPath}/${dateStr}_${timeStr}_split${index + 1}.${fileExt}`;
      
      // Convert file to blob and upload
      const arrayBuffer = await file.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: file.type });
      
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, blob, {
          contentType: file.type,
          upsert: false
        });
      
      if (uploadError) {
        throw uploadError;
      }
      
      // Get signed URL
      const { data: { signedUrl }, error: signedUrlError } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(fileName, 31536000); // 1 year expiry
      
      if (signedUrlError || !signedUrl) {
        throw signedUrlError || new Error('Failed to get signed URL');
      }
      
      return signedUrl;
    } catch (error) {
      console.error('Error uploading split payment proof:', error);
      throw error;
    }
  };

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
    // Validate based on payment mode
    if (!user || !signatureDataUrl) {
      toast({
        title: 'Error',
        description: 'User not authenticated or signature missing',
        variant: 'destructive'
      });
      return;
    }

    // Validate FULL payment mode
    if (paymentMode === 'FULL') {
      if (!paymentMethod || !paymentProofFile) {
        toast({
          title: 'Error',
          description: 'Payment method not selected or payment proof missing',
        variant: 'destructive'
      });
      return;
    }

    // For bank transfer, require bank selection
    if (paymentMethod === 'BANK_TRANSFER' && !selectedBank) {
      toast({
        title: 'Error',
        description: 'Please select a bank account for bank transfer payment',
        variant: 'destructive'
      });
      return;
      }
    }

    // Validate SPLIT payment mode
    if (paymentMode === 'SPLIT') {
      if (!validateSplitPayment()) {
        toast({
          title: 'Error',
          description: 'Invalid split payment configuration',
          variant: 'destructive'
        });
        return;
      }
    }

    setUploadingSignature(true);

    try {
      // Generate order number first (needed for bank transfer path)
      const { data: orderNumberData, error: numberError } = await supabase
        .rpc('generate_order_number');

      if (numberError) {
        console.error('Error generating order number:', numberError);
        throw numberError;
      }

      const generatedOrderNumber = orderNumberData as string;
      console.log('🔢 Generated order number:', generatedOrderNumber);

      // Upload signature to Supabase Storage
      const signatureUrl = await uploadSignatureToStorage();

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
        customPrice: pricingType === 'special' ? item.customPrice : undefined,
        total: item.quantity * item.unitPrice
      }));

      // Handle payment uploads and order data based on mode
      let paymentProofUrl: string | undefined = undefined;
      let uploadedSplits: PaymentSplit[] | undefined = undefined;

      if (paymentMode === 'FULL') {
        // Upload payment proof for FULL payment
        paymentProofUrl = await uploadPaymentProofToStorage(generatedOrderNumber);
      } else {
        // Upload split payment proofs
        const uploadsPromises = paymentSplits.map((split, index) => {
          if (split.proofFile) {
            return uploadSplitProof(split.proofFile, index, generatedOrderNumber);
          }
          return Promise.resolve('');
        });
        
        const uploadedUrls = await Promise.all(uploadsPromises);
        
        uploadedSplits = paymentSplits.map((split, index) => ({
          method: split.method,
          bank: split.bank,
          amount: split.amount,
          proofUrl: uploadedUrls[index]
        }));
      }

      const newOrder = {
        id: Date.now().toString(),
        orderNumber: generatedOrderNumber, // Use pre-generated order number
        agentId: user.id,
        agentName: user.full_name || user.email || 'Unknown',
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
        paymentMode, // NEW: Add payment mode
        paymentMethod: paymentMode === 'FULL' ? paymentMethod : undefined, // Only for FULL
        bankType: paymentMode === 'FULL' && paymentMethod === 'BANK_TRANSFER' && selectedBank ? selectedBank.name as 'Unionbank' | 'BPI' | 'PBCOM' : undefined, // Only for FULL bank transfer
        paymentProofUrl: paymentMode === 'FULL' ? paymentProofUrl : undefined, // Only for FULL
        paymentSplits: paymentMode === 'SPLIT' ? uploadedSplits : undefined, // NEW: Only for SPLIT
        pricingStrategy: pricingType || 'rsp' // Add pricing strategy selection, fallback to RSP (should never be empty due to validation)
      };

      console.log('🛒 Creating order with signature:', newOrder);

      // Save order to database (this will also deduct from agent inventory)
      // Pass the pre-generated order number to addOrder
      const finalOrderNumber = await addOrder(newOrder, generatedOrderNumber);

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
          agentName: user.full_name || user.email || 'Unknown',
          agentEmail: user.email,
          agentPhone: agentPhone,
          leaderName: leaderName,
          paymentMethod: paymentMode === 'FULL' ? paymentMethod : undefined,
          selectedBank: paymentMode === 'FULL' && selectedBank ? selectedBank.name : undefined,
          paymentProofUrl: paymentMode === 'FULL' ? paymentProofUrl : undefined,
          paymentMode: paymentMode,
          paymentSplits: paymentMode === 'SPLIT' ? uploadedSplits : undefined,
          pricingStrategy: pricingType,
          requestSalesInvoice: requestSalesInvoice,
          companyId: user.company_id
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
    <div className="w-full p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Orders</h1>
          <p className="text-sm text-muted-foreground">Manage your client orders</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Order
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
                        placeholder="Search clients by name, shop name, or email..."
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
                  Search by name, shop name, or email to quickly find your client
                </p>
              </div>

              {/* Pricing Strategy Selection */}
              {!loadingPricingConfig && (
                <div className="space-y-3 pt-2 border-t mt-4 bg-muted/30 p-4 rounded-lg">
                  <div>
                    <Label className="text-sm font-medium">Pricing Strategy *</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {allowedPricingStrategies.length === 1 
                        ? 'Auto-configured by your company' 
                        : 'Select the pricing strategy for this order'}
                    </p>
                  </div>
                  
                  {allowedPricingStrategies.length === 1 ? (
                    // Single strategy - show as badge
                    <Badge variant="secondary" className="text-sm font-medium">
                      {pricingType === 'rsp' && 'RSP Pricing'}
                      {pricingType === 'dsp' && 'DSP Pricing'}
                      {pricingType === 'special' && 'Special Pricing'}
                    </Badge>
                  ) : (
                    // Multiple strategies - show radio buttons
                    <RadioGroup 
                      value={pricingType} 
                      onValueChange={(value) => {
                        setPricingType(value as 'rsp' | 'dsp' | 'special');
                        // Reset custom prices when changing strategy
                        if (value !== 'special') {
                          setCustomPrices({});
                        }
                      }}
                      className="gap-3"
                    >
                      {allowedPricingStrategies.includes('rsp_price') && (
                        <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                          <RadioGroupItem value="rsp" id="pricing-rsp" />
                          <Label htmlFor="pricing-rsp" className="flex-1 cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{PRICING_OPTIONS.rsp_price.label}</div>
                                <div className="text-xs text-muted-foreground">{PRICING_OPTIONS.rsp_price.description}</div>
                              </div>
                              <Badge variant="outline">{PRICING_OPTIONS.rsp_price.badge}</Badge>
                            </div>
                          </Label>
                        </div>
                      )}
                      
                      {allowedPricingStrategies.includes('dsp_price') && (
                        <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                          <RadioGroupItem value="dsp" id="pricing-dsp" />
                          <Label htmlFor="pricing-dsp" className="flex-1 cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{PRICING_OPTIONS.dsp_price.label}</div>
                                <div className="text-xs text-muted-foreground">{PRICING_OPTIONS.dsp_price.description}</div>
                              </div>
                              <Badge variant="outline">{PRICING_OPTIONS.dsp_price.badge}</Badge>
                            </div>
                          </Label>
                        </div>
                      )}
                      
                      {allowedPricingStrategies.includes('selling_price') && (
                        <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                          <RadioGroupItem value="special" id="pricing-special" />
                          <Label htmlFor="pricing-special" className="flex-1 cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{PRICING_OPTIONS.selling_price.label}</div>
                                <div className="text-xs text-muted-foreground">{PRICING_OPTIONS.selling_price.description}</div>
                              </div>
                              <Badge variant="outline">{PRICING_OPTIONS.selling_price.badge}</Badge>
                            </div>
                          </Label>
                        </div>
                      )}
                    </RadioGroup>
                  )}
                </div>
              )}



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

                          // Determine price to display based on selected pricing type
                          let displayPrice = (flavor as any).sellingPrice ?? flavor.price;
                          if (pricingType === 'dsp') {
                            displayPrice = (flavor as any).dspPrice ?? displayPrice;
                          } else if (pricingType === 'rsp') {
                            displayPrice = (flavor as any).rspPrice ?? displayPrice;
                          }
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
                                      {pricingType !== 'special' && (
                                        <span className="text-sm font-semibold text-blue-700">₱{displayPrice.toFixed(2)}</span>
                                      )}
                                    </div>
                                    {flavor.stock === 0 && (
                                      <p className="text-xs text-red-600 mt-1">No more stock available</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2 pt-2 border-t border-blue-200">
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs font-medium whitespace-nowrap">Qty:</Label>
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
                                          displayPrice,
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
                                  {pricingType === 'special' && (
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs font-medium whitespace-nowrap">Price:</Label>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={customPrices[flavor.id] || ''}
                                        placeholder={(flavor as any).sellingPrice?.toFixed(2) || '0.00'}
                                        onChange={(e) => handleCustomPriceChange(flavor.id, e.target.value)}
                                        className="w-24 h-9"
                                        disabled={flavor.stock === 0}
                                      />
                                      <span className="text-xs text-muted-foreground">₱</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* Desktop: Row Layout */}
                              <div className="hidden sm:flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                  <span className="font-medium">{flavor.name}</span>
                                  <Badge variant={flavor.status === 'available' ? 'default' : 'secondary'} className="text-xs">
                                    {flavor.stock} in stock
                                  </Badge>
                                  {pricingType !== 'special' && (
                                    <span className="text-sm text-muted-foreground">₱{displayPrice.toFixed(2)}</span>
                                  )}
                                </div>
                                {flavor.stock === 0 ? (
                                  <span className="text-xs text-red-600">No more stock available</span>
                                ) : (
                                  <div className="flex items-center gap-3">
                                    {pricingType === 'special' && (
                                      <div className="flex items-center gap-2">
                                        <Label className="text-xs whitespace-nowrap">Price:</Label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={customPrices[flavor.id] || ''}
                                          placeholder={(flavor as any).sellingPrice?.toFixed(2) || '0.00'}
                                          onChange={(e) => handleCustomPriceChange(flavor.id, e.target.value)}
                                          className="w-24 h-8"
                                        />
                                        <span className="text-xs text-muted-foreground">₱</span>
                                      </div>
                                    )}
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
                                            displayPrice,
                                            flavor.stock,
                                            (flavor as any).sellingPrice,
                                            (flavor as any).dspPrice,
                                            (flavor as any).rspPrice
                                          );
                                        }}
                                        className="w-20 h-8"
                                      />
                                    </div>
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

                          // Determine price to display based on selected pricing type
                          let displayPrice = (battery as any).sellingPrice ?? battery.price;
                          if (pricingType === 'dsp') {
                            displayPrice = (battery as any).dspPrice ?? displayPrice;
                          } else if (pricingType === 'rsp') {
                            displayPrice = (battery as any).rspPrice ?? displayPrice;
                          }

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
                                      {pricingType !== 'special' && (
                                        <span className="text-sm font-semibold text-green-700">₱{displayPrice.toFixed(2)}</span>
                                      )}
                                    </div>
                                    {battery.stock === 0 && (
                                      <p className="text-xs text-red-600 mt-1">No more stock available</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2 pt-2 border-t border-green-200">
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs font-medium whitespace-nowrap">Qty:</Label>
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
                                          displayPrice,
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
                                  {pricingType === 'special' && (
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs font-medium whitespace-nowrap">Price:</Label>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={customPrices[battery.id] || ''}
                                        placeholder={(battery as any).sellingPrice?.toFixed(2) || '0.00'}
                                        onChange={(e) => handleCustomPriceChange(battery.id, e.target.value)}
                                        className="w-24 h-9"
                                        disabled={battery.stock === 0}
                                      />
                                      <span className="text-xs text-muted-foreground">₱</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* Desktop: Row Layout */}
                              <div className="hidden sm:flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                  <span className="font-medium">{battery.name}</span>
                                  <Badge variant={battery.status === 'available' ? 'default' : 'secondary'} className="text-xs">
                                    {battery.stock} in stock
                                  </Badge>
                                  {pricingType !== 'special' && (
                                    <span className="text-sm text-muted-foreground">₱{displayPrice.toFixed(2)}</span>
                                  )}
                                </div>
                                {battery.stock === 0 ? (
                                  <span className="text-xs text-red-600">No more stock available</span>
                                ) : (
                                  <div className="flex items-center gap-3">
                                    {pricingType === 'special' && (
                                      <div className="flex items-center gap-2">
                                        <Label className="text-xs whitespace-nowrap">Price:</Label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={customPrices[battery.id] || ''}
                                          placeholder={(battery as any).sellingPrice?.toFixed(2) || '0.00'}
                                          onChange={(e) => handleCustomPriceChange(battery.id, e.target.value)}
                                          className="w-24 h-8"
                                        />
                                        <span className="text-xs text-muted-foreground">₱</span>
                                      </div>
                                    )}
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
                                            displayPrice,
                                            battery.stock,
                                            (battery as any).sellingPrice,
                                            (battery as any).dspPrice,
                                            (battery as any).rspPrice
                                          );
                                        }}
                                        className="w-20 h-8"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* POSM */}
                  {selectedBrand.posms && selectedBrand.posms.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm text-purple-700 flex items-center gap-2">
                        <Badge variant="secondary" className="bg-purple-100 text-purple-700">POSM</Badge>
                        Available: {selectedBrand.posms.length}
                      </h4>
                      <div className="space-y-2 pl-4">
                        {selectedBrand.posms.map((posm) => {
                          const selectedItem = selectedItems.find(item => item.variantId === posm.id);
                          const currentQuantity = selectedItem?.quantity || 0;

                          // Determine price to display based on selected pricing type
                          let displayPrice = (posm as any).sellingPrice ?? posm.price;
                          if (pricingType === 'dsp') {
                            displayPrice = (posm as any).dspPrice ?? displayPrice;
                          } else if (pricingType === 'rsp') {
                            displayPrice = (posm as any).rspPrice ?? displayPrice;
                          }

                          return (
                            <div key={posm.id} className="p-3 sm:p-4 bg-purple-50/50 rounded-lg border border-purple-100">
                              {/* Mobile: Card Layout */}
                              <div className="block sm:hidden space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{posm.name}</p>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      <Badge variant={posm.status === 'available' ? 'default' : 'secondary'} className="text-xs">
                                        {posm.stock} in stock
                                      </Badge>
                                      {pricingType !== 'special' && (
                                        <span className="text-sm font-semibold text-purple-700">₱{displayPrice.toFixed(2)}</span>
                                      )}
                                    </div>
                                    {posm.stock === 0 && (
                                      <p className="text-xs text-red-600 mt-1">No more stock available</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2 pt-2 border-t border-purple-200">
                                  <div className="flex items-center gap-2">
                                    <Label className="text-xs font-medium whitespace-nowrap">Qty:</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      max={posm.stock}
                                      value={currentQuantity === 0 ? '' : currentQuantity}
                                      placeholder="0"
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        const quantity = value === '' ? 0 : parseInt(value) || 0;
                                        handleQuantityChange(
                                          posm.id,
                                          quantity,
                                          selectedBrand.name,
                                          posm.name,
                                          'posm',
                                          displayPrice,
                                          posm.stock,
                                          (posm as any).sellingPrice,
                                          (posm as any).dspPrice,
                                          (posm as any).rspPrice
                                        );
                                      }}
                                      className="w-24 h-9"
                                      disabled={posm.stock === 0}
                                    />
                                  </div>
                                  {pricingType === 'special' && (
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs font-medium whitespace-nowrap">Price:</Label>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={customPrices[posm.id] || ''}
                                        placeholder={(posm as any).sellingPrice?.toFixed(2) || '0.00'}
                                        onChange={(e) => handleCustomPriceChange(posm.id, e.target.value)}
                                        className="w-24 h-9"
                                        disabled={posm.stock === 0}
                                      />
                                      <span className="text-xs text-muted-foreground">₱</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* Desktop: Row Layout */}
                              <div className="hidden sm:flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                  <span className="font-medium">{posm.name}</span>
                                  <Badge variant={posm.status === 'available' ? 'default' : 'secondary'} className="text-xs">
                                    {posm.stock} in stock
                                  </Badge>
                                  {pricingType !== 'special' && (
                                    <span className="text-sm text-muted-foreground">₱{displayPrice.toFixed(2)}</span>
                                  )}
                                </div>
                                {posm.stock === 0 ? (
                                  <span className="text-xs text-red-600">No more stock available</span>
                                ) : (
                                  <div className="flex items-center gap-3">
                                    {pricingType === 'special' && (
                                      <div className="flex items-center gap-2">
                                        <Label className="text-xs whitespace-nowrap">Price:</Label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={customPrices[posm.id] || ''}
                                          placeholder={(posm as any).sellingPrice?.toFixed(2) || '0.00'}
                                          onChange={(e) => handleCustomPriceChange(posm.id, e.target.value)}
                                          className="w-24 h-8"
                                        />
                                        <span className="text-xs text-muted-foreground">₱</span>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                      <Label className="text-xs">Qty:</Label>
                                      <Input
                                        type="number"
                                        min="0"
                                        max={posm.stock}
                                        value={currentQuantity === 0 ? '' : currentQuantity}
                                        placeholder="0"
                                        onChange={(e) => {
                                          const value = e.target.value;
                                          const quantity = value === '' ? 0 : parseInt(value) || 0;
                                          handleQuantityChange(
                                            posm.id,
                                            quantity,
                                            selectedBrand.name,
                                            posm.name,
                                            'posm',
                                            displayPrice,
                                            posm.stock,
                                            (posm as any).sellingPrice,
                                            (posm as any).dspPrice,
                                            (posm as any).rspPrice
                                          );
                                        }}
                                        className="w-20 h-8"
                                      />
                                    </div>
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
                                className={`mt-1 ${item.variantType === 'flavor' ? 'bg-blue-100 text-blue-700' : item.variantType === 'battery' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}
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
                              <p className="text-xs text-muted-foreground">
                                {pricingType === 'dsp' ? 'DSP Price' : pricingType === 'rsp' ? 'RSP Price' : 'Special Price'}
                              </p>
                              {pricingType === 'special' ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs">₱</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={item.unitPrice === 0 ? '' : item.unitPrice}
                                    onChange={(e) => handlePriceChange(item.variantId, parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="h-7 w-20 text-right px-1"
                                  />
                                </div>
                              ) : (
                                <p className="font-medium">₱{item.unitPrice.toLocaleString()}</p>
                              )}
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
                                className={item.variantType === 'flavor' ? 'bg-blue-100 text-blue-700' : item.variantType === 'battery' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}
                              >
                                {item.variantType}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Quantity</p>
                              <p>{item.quantity} units</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">
                                {pricingType === 'dsp' ? 'DSP Price' : pricingType === 'rsp' ? 'RSP Price' : 'Special Price'}
                              </p>
                              {pricingType === 'special' ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-sm text-muted-foreground">₱</span>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={item.unitPrice === 0 ? '' : item.unitPrice}
                                    onChange={(e) => handlePriceChange(item.variantId, parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className="h-8 w-24 text-right"
                                  />
                                </div>
                              ) : (
                                <p>₱{item.unitPrice.toLocaleString()}</p>
                              )}
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Total</div>
            <div className="text-2xl font-bold mt-1">{myOrders.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Pending</div>
            <div className="text-2xl font-bold mt-1 text-yellow-600">
              {myOrders.filter(o => (o.stage || o.status) === 'agent_pending').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">Approved</div>
            <div className="text-2xl font-bold mt-1 text-green-600">
              {myOrders.filter(o => o.status === 'approved').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders List */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Date Filters */}
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={dateFilterStart}
                onChange={(e) => setDateFilterStart(e.target.value)}
                className="w-full"
                placeholder="From"
              />
              <Input
                type="date"
                value={dateFilterEnd}
                onChange={(e) => setDateFilterEnd(e.target.value)}
                className="w-full"
                min={dateFilterStart}
                placeholder="To"
              />
            </div>

            {/* Results and Actions */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">
                {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
              </span>
              {(dateFilterStart || dateFilterEnd || searchQuery) && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setDateFilterStart('');
                  setDateFilterEnd('');
                  setSearchQuery('');
                }}>
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile List */}
          <div className="md:hidden space-y-2">
            {paginatedOrders.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">No orders</div>
            ) : (
              paginatedOrders.map((order) => (
                  <Card key={order.id}>
                  <div className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-semibold text-sm truncate">{order.orderNumber}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">{order.clientName}</div>
                      </div>
                      <Badge variant={getDisplayStatus(order).variant} className="ml-2 flex-shrink-0 text-xs">
                        {getDisplayStatus(order).text}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs pt-2 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Payment:</span>
                        <span className="font-medium">{formatPaymentSummary(order)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-muted-foreground">{order.items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)} items</span>
                          <span className="text-muted-foreground mx-2">•</span>
                          <span className="text-muted-foreground">{new Date(order.date).toLocaleDateString()}</span>
                        </div>
                        <div className="font-semibold text-sm">₱{order.total.toLocaleString()}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleViewOrder(order)}
                      className="w-full mt-2 pt-2 border-t text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      View Details
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Desktop/Tablet: table */}
          <div className="hidden md:block w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead className="font-semibold whitespace-nowrap align-middle">Order #</TableHead>
                  <TableHead className="font-semibold min-w-[150px] align-middle">Client</TableHead>
                  <TableHead className="font-semibold whitespace-nowrap align-middle">Date</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap align-middle">Qty</TableHead>
                  <TableHead className="text-right font-semibold whitespace-nowrap align-middle">Amount</TableHead>
                  <TableHead className="font-semibold whitespace-nowrap align-middle">Payment</TableHead>
                  <TableHead className="font-semibold whitespace-nowrap align-middle">Status</TableHead>
                  <TableHead className="text-center font-semibold whitespace-nowrap align-middle">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedOrders.map((order) => (
                  <TableRow key={order.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-sm font-medium whitespace-nowrap align-middle">{order.orderNumber}</TableCell>
                    <TableCell className="font-medium align-middle">{order.clientName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap align-middle">{new Date(order.date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-center tabular-nums align-middle">{order.items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap align-middle">
                      ₱{order.total.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap align-middle">
                      {formatPaymentSummary(order)}
                    </TableCell>
                    <TableCell className="align-middle">
                      <Badge variant={getDisplayStatus(order).variant} className="font-normal whitespace-nowrap">
                        {getDisplayStatus(order).text}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center align-middle">
                      <Button variant="ghost" size="icon" onClick={() => handleViewOrder(order)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center pt-4 border-t gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="min-w-[40px]"
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
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

      {/* Payment Mode Selection Dialog */}
      <Dialog open={showPaymentModeDialog} onOpenChange={setShowPaymentModeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Payment Mode</DialogTitle>
            <DialogDescription>
              Choose how you want to handle payment for this order
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            {/* Full Payment Option */}
            <Card 
              className={`cursor-pointer transition-all ${
                paymentMode === 'FULL' 
                  ? 'ring-2 ring-primary bg-primary/5' 
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => setPaymentMode('FULL')}
            >
              <CardContent className="flex flex-col items-center justify-center p-6 space-y-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-semibold">Full Payment</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Single payment method
                  </p>
                </div>
                {paymentMode === 'FULL' && (
                  <CheckCircle className="h-5 w-5 text-primary" />
                )}
              </CardContent>
            </Card>

            {/* Split Payment Option */}
            <Card 
              className={`cursor-pointer transition-all ${
                paymentMode === 'SPLIT' 
                  ? 'ring-2 ring-primary bg-primary/5' 
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => setPaymentMode('SPLIT')}
            >
              <CardContent className="flex flex-col items-center justify-center p-6 space-y-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Split className="h-6 w-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-semibold">Split Payment</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    2-3 payment methods
                  </p>
                </div>
                {paymentMode === 'SPLIT' && (
                  <CheckCircle className="h-5 w-5 text-primary" />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => {
              setShowPaymentModeDialog(false);
              setShowSignatureModal(true);
            }}>
              Back
            </Button>
            <Button onClick={() => {
              setShowPaymentModeDialog(false);
              if (paymentMode === 'FULL') {
                setShowPaymentMethodModal(true);
              } else {
                setShowSplitPaymentDialog(true);
              }
            }}>
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Split Payment Configuration Dialog - Redesigned */}
      <Dialog open={showSplitPaymentDialog} onOpenChange={setShowSplitPaymentDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Payment Methods (up to 3)</DialogTitle>
            <DialogDescription>
              Choose payment methods and enter amounts. Total must equal ₱{calculateTotal().toLocaleString()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Bank Transfer Section */}
            {paymentSettings?.bank_transfer_enabled && bankAccounts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-base font-semibold">Bank Transfer</Label>
                <div className="space-y-2 ml-4">
                  {bankAccounts.map((bank) => {
                    const existingIndex = paymentSplits.findIndex(
                      s => s.method === 'BANK_TRANSFER' && s.bank === bank.name
                    );
                    const isSelected = existingIndex !== -1;
                    
                    return (
                      <Card 
                        key={bank.name} 
                        className={`transition-all ${isSelected ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              disabled={!isSelected && paymentSplits.length >= 3}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setPaymentSplits([...paymentSplits, { 
                                    method: 'BANK_TRANSFER', 
                                    bank: bank.name, 
                                    amount: 0 
                                  }]);
                                } else {
                                  setPaymentSplits(paymentSplits.filter((_, i) => i !== existingIndex));
                                }
                              }}
                              className="mt-1"
                            />
                            <div className="flex-1 space-y-3">
                              <div>
                                <p className="font-medium">{bank.name}</p>
                                <p className="text-sm text-muted-foreground">{bank.account_number}</p>
                              </div>

                              {isSelected && (
                                <div className="space-y-3 pt-2 border-t">
                                  {/* Amount Input */}
                                  <div>
                                    <Label className="text-sm">Amount *</Label>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">₱</span>
                                      <Input
                                        type="number"
                                        value={paymentSplits[existingIndex].amount || ''}
                                        onChange={(e) => {
                                          const newSplits = [...paymentSplits];
                                          newSplits[existingIndex].amount = parseFloat(e.target.value) || 0;
                                          setPaymentSplits(newSplits);
                                        }}
                                        className="pl-7"
                                        placeholder="0.00"
                                        step="0.01"
                                      />
                                    </div>
                                  </div>

                                  {/* Payment Proof */}
                                  <div>
                                    <Label className="text-sm">Payment Proof *</Label>
                                    <Input
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                          const newSplits = [...paymentSplits];
                                          newSplits[existingIndex].proofFile = file;
                                          setPaymentSplits(newSplits);
                                        }
                                      }}
                                    />
                                    {paymentSplits[existingIndex].proofFile && (
                                      <p className="text-xs text-green-600 mt-1">
                                        ✓ {paymentSplits[existingIndex].proofFile!.name}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* GCash Section */}
            {paymentSettings?.gcash_enabled && (
              <div className="space-y-2">
                <Label className="text-base font-semibold">GCash</Label>
                {(() => {
                  const existingIndex = paymentSplits.findIndex(s => s.method === 'GCASH');
                  const isSelected = existingIndex !== -1;
                  
                  return (
                    <Card className={`transition-all ${isSelected ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={isSelected}
                            disabled={!isSelected && paymentSplits.length >= 3}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setPaymentSplits([...paymentSplits, { method: 'GCASH', amount: 0 }]);
                              } else {
                                setPaymentSplits(paymentSplits.filter((_, i) => i !== existingIndex));
                              }
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-3">
                            <div>
                              <p className="font-medium">GCash Payment</p>
                              {paymentSettings.gcash_number && (
                                <p className="text-sm text-muted-foreground">{paymentSettings.gcash_number}</p>
                              )}
                              {paymentSettings.gcash_name && (
                                <p className="text-sm text-muted-foreground">{paymentSettings.gcash_name}</p>
                              )}
                              {paymentSettings.gcash_qr_url && (
                                <img 
                                  src={paymentSettings.gcash_qr_url} 
                                  alt="GCash QR" 
                                  className="w-32 h-32 mt-2 border rounded"
                                />
                              )}
                            </div>

                            {isSelected && (
                              <div className="space-y-3 pt-2 border-t">
                                {/* Amount Input */}
                                <div>
                                  <Label className="text-sm">Amount *</Label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">₱</span>
                                    <Input
                                      type="number"
                                      value={paymentSplits[existingIndex].amount || ''}
                                      onChange={(e) => {
                                        const newSplits = [...paymentSplits];
                                        newSplits[existingIndex].amount = parseFloat(e.target.value) || 0;
                                        setPaymentSplits(newSplits);
                                      }}
                                      className="pl-7"
                                      placeholder="0.00"
                                      step="0.01"
                                    />
                                  </div>
                                </div>

                                {/* Payment Proof */}
                                <div>
                                  <Label className="text-sm">Payment Proof *</Label>
                                  <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const newSplits = [...paymentSplits];
                                        newSplits[existingIndex].proofFile = file;
                                        setPaymentSplits(newSplits);
                                      }
                                    }}
                                  />
                                  {paymentSplits[existingIndex].proofFile && (
                                    <p className="text-xs text-green-600 mt-1">
                                      ✓ {paymentSplits[existingIndex].proofFile!.name}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>
            )}

            {/* Cash Section */}
            {paymentSettings?.cash_enabled && (
              <div className="space-y-2">
                <Label className="text-base font-semibold">Cash</Label>
                {(() => {
                  const existingIndex = paymentSplits.findIndex(s => s.method === 'CASH');
                  const isSelected = existingIndex !== -1;
                  
                  return (
                    <Card className={`transition-all ${isSelected ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={isSelected}
                            disabled={!isSelected && paymentSplits.length >= 3}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setPaymentSplits([...paymentSplits, { method: 'CASH', amount: 0 }]);
                              } else {
                                setPaymentSplits(paymentSplits.filter((_, i) => i !== existingIndex));
                              }
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-3">
                            <p className="font-medium">Cash Payment</p>

                            {isSelected && (
                              <div className="space-y-3 pt-2 border-t">
                                {/* Amount Input */}
                                <div>
                                  <Label className="text-sm">Amount *</Label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">₱</span>
                                    <Input
                                      type="number"
                                      value={paymentSplits[existingIndex].amount || ''}
                                      onChange={(e) => {
                                        const newSplits = [...paymentSplits];
                                        newSplits[existingIndex].amount = parseFloat(e.target.value) || 0;
                                        setPaymentSplits(newSplits);
                                      }}
                                      className="pl-7"
                                      placeholder="0.00"
                                      step="0.01"
                                    />
                                  </div>
                                </div>

                                {/* Payment Proof */}
                                <div>
                                  <Label className="text-sm">Payment Proof *</Label>
                                  <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const newSplits = [...paymentSplits];
                                        newSplits[existingIndex].proofFile = file;
                                        setPaymentSplits(newSplits);
                                      }
                                    }}
                                  />
                                  {paymentSplits[existingIndex].proofFile && (
                                    <p className="text-xs text-green-600 mt-1">
                                      ✓ {paymentSplits[existingIndex].proofFile!.name}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>
            )}

            {/* Cheque Section */}
            {paymentSettings?.cheque_enabled && (
              <div className="space-y-2">
                <Label className="text-base font-semibold">Cheque</Label>
                {(() => {
                  const existingIndex = paymentSplits.findIndex(s => s.method === 'CHEQUE');
                  const isSelected = existingIndex !== -1;
                  
                  return (
                    <Card className={`transition-all ${isSelected ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={isSelected}
                            disabled={!isSelected && paymentSplits.length >= 3}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setPaymentSplits([...paymentSplits, { method: 'CHEQUE', amount: 0 }]);
                              } else {
                                setPaymentSplits(paymentSplits.filter((_, i) => i !== existingIndex));
                              }
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-3">
                            <p className="font-medium">Cheque Payment</p>

                            {isSelected && (
                              <div className="space-y-3 pt-2 border-t">
                                {/* Amount Input */}
                                <div>
                                  <Label className="text-sm">Amount *</Label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">₱</span>
                                    <Input
                                      type="number"
                                      value={paymentSplits[existingIndex].amount || ''}
                                      onChange={(e) => {
                                        const newSplits = [...paymentSplits];
                                        newSplits[existingIndex].amount = parseFloat(e.target.value) || 0;
                                        setPaymentSplits(newSplits);
                                      }}
                                      className="pl-7"
                                      placeholder="0.00"
                                      step="0.01"
                                    />
                                  </div>
                                </div>

                                {/* Payment Proof */}
                                <div>
                                  <Label className="text-sm">Payment Proof *</Label>
                                  <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        const newSplits = [...paymentSplits];
                                        newSplits[existingIndex].proofFile = file;
                                        setPaymentSplits(newSplits);
                                      }
                                    }}
                                  />
                                  {paymentSplits[existingIndex].proofFile && (
                                    <p className="text-xs text-green-600 mt-1">
                                      ✓ {paymentSplits[existingIndex].proofFile!.name}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>
            )}

            {/* Validation Summary */}
            {paymentSplits.length > 0 && (
              <div className={`p-4 rounded-lg ${
                Math.abs(getSplitTotal() - calculateTotal()) < 0.01
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">Split Total: ₱{getSplitTotal().toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Order Total: ₱{calculateTotal().toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {paymentSplits.length} of 3 payment methods selected
                    </p>
                  </div>
                  {Math.abs(getSplitTotal() - calculateTotal()) < 0.01 ? (
                    <Badge className="bg-green-600">✓ Valid</Badge>
                  ) : (
                    <Badge variant="destructive">
                      {getSplitTotal() > calculateTotal() ? 'Over' : 'Under'} by ₱{Math.abs(getSplitTotal() - calculateTotal()).toLocaleString()}
                    </Badge>
                  )}
                </div>
                {splitValidationError && (
                  <p className="text-sm text-destructive mt-2">{splitValidationError}</p>
                )}
              </div>
            )}

            {paymentSplits.length === 0 && (
              <div className="p-4 rounded-lg bg-muted text-center">
                <p className="text-sm text-muted-foreground">Select at least one payment method to continue</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => {
              setShowSplitPaymentDialog(false);
              setShowPaymentModeDialog(true);
            }}>
              Back
            </Button>
            <Button 
              onClick={handleContinueWithSplit}
              disabled={
                paymentSplits.length === 0 ||
                paymentSplits.some(s => !s.method || !s.amount || !s.proofFile) ||
                Math.abs(getSplitTotal() - calculateTotal()) > 0.01
              }
            >
              Continue to Confirmation
            </Button>
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
                Select the payment method (Bank Transfer, Cash, Cheque, or GCash). For Bank Transfer you will then choose which bank. After that, take or upload a photo of the payment proof—it will be saved under this method (and bank, if applicable).
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 gap-2 sm:gap-3">
              {/* Bank Transfer - only show if enabled */}
              {paymentSettings?.bank_transfer_enabled && bankAccounts.length > 0 && (
              <Button
                variant={paymentMethod === 'BANK_TRANSFER' ? 'default' : 'outline'}
                className="h-14 sm:h-16 flex items-center justify-center gap-2 sm:gap-3 min-h-[44px]"
                onClick={() => handlePaymentMethodSelected('BANK_TRANSFER')}
              >
                <CreditCard className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-base sm:text-lg font-semibold">Bank Transfer</span>
              </Button>
              )}

              {/* GCash - only show if enabled */}
              {paymentSettings?.gcash_enabled && (
                <Button
                  variant={paymentMethod === 'GCASH' ? 'default' : 'outline'}
                  className="h-14 sm:h-16 flex items-center justify-center gap-2 sm:gap-3 min-h-[44px]"
                  onClick={() => handlePaymentMethodSelected('GCASH')}
                >
                  <Smartphone className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span className="text-base sm:text-lg font-semibold">GCash</span>
                </Button>
              )}

              {/* Cash - only show if enabled */}
              {paymentSettings?.cash_enabled && (
              <Button
                variant={paymentMethod === 'CASH' ? 'default' : 'outline'}
                className="h-14 sm:h-16 flex items-center justify-center gap-2 sm:gap-3 min-h-[44px]"
                onClick={() => handlePaymentMethodSelected('CASH')}
              >
                <CreditCard className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-base sm:text-lg font-semibold">Cash</span>
              </Button>
              )}

              {/* Cheque - only show if enabled */}
              {paymentSettings?.cheque_enabled && (
              <Button
                variant={paymentMethod === 'CHEQUE' ? 'default' : 'outline'}
                className="h-14 sm:h-16 flex items-center justify-center gap-2 sm:gap-3 min-h-[44px]"
                onClick={() => handlePaymentMethodSelected('CHEQUE')}
              >
                  <FileSignature className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="text-base sm:text-lg font-semibold">Cheque</span>
              </Button>
              )}

              {/* Show message if no payment methods configured */}
              {!paymentSettings?.bank_transfer_enabled && 
               !paymentSettings?.gcash_enabled && 
               !paymentSettings?.cash_enabled && 
               !paymentSettings?.cheque_enabled && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs sm:text-sm">
                    No payment methods are currently enabled. Please contact your administrator.
                  </AlertDescription>
                </Alert>
              )}
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

      {/* Bank Selection Modal */}
      <Dialog open={showBankSelectionModal} onOpenChange={setShowBankSelectionModal}>
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
              Select Bank Account
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 sm:space-y-4 py-1 sm:py-4">
            <Alert className="py-2 sm:py-3">
              <AlertDescription className="text-xs sm:text-sm">
                Select which bank received the transfer. Your payment proof photo will be saved under Bank Transfer → this bank.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 gap-2 sm:gap-3">
              {bankAccounts.map((bank) => (
                <Button
                  key={bank.name}
                  variant={selectedBank?.name === bank.name ? 'default' : 'outline'}
                  className="h-auto p-4 flex flex-col items-start justify-start gap-2 min-h-[80px]"
                  onClick={() => handleBankSelected(bank)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <CreditCard className="h-5 w-5 flex-shrink-0" />
                    <span className="font-semibold text-base">{bank.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground ml-7">{bank.account_number}</span>
                </Button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 sm:pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowBankSelectionModal(false);
                  setShowPaymentMethodModal(true);
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
                Please take a picture or upload a file showing the payment proof for <strong>{paymentMethod === 'GCASH' ? 'GCash' : paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : paymentMethod === 'CHEQUE' ? 'Cheque' : 'Cash'}</strong> payment.
              </AlertDescription>
            </Alert>

            {/* Bank Account Display (for Bank Transfer) */}
            {paymentMethod === 'BANK_TRANSFER' && selectedBank && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-blue-700" />
                  <Label className="font-semibold text-blue-900 text-sm sm:text-base">Selected Bank Account</Label>
                </div>
                
                {/* QR Code Display (if available) */}
                {selectedBank.qr_code_url && (
                  <div className="flex justify-center py-2">
                    <div className="bg-white p-3 rounded-lg border-2 border-blue-300">
                      <img 
                        src={selectedBank.qr_code_url} 
                        alt={`${selectedBank.name} QR Code`}
                        className="w-48 h-48 object-contain"
                      />
                      <p className="text-xs text-center text-blue-700 mt-2">Scan to pay</p>
                    </div>
                  </div>
                )}
                
                {/* Bank Details */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-blue-700 font-medium">Bank:</span>
                    <span className="text-xs sm:text-sm font-semibold text-blue-900">{selectedBank.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-blue-700 font-medium">Account Number:</span>
                    <span className="text-xs sm:text-sm font-mono font-semibold text-blue-900">{selectedBank.account_number}</span>
                  </div>
                </div>
              </div>
            )}

            {/* GCash Account Display (for GCash) */}
            {paymentMethod === 'GCASH' && paymentSettings && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="h-4 w-4 sm:h-5 sm:w-5 text-green-700" />
                  <Label className="font-semibold text-green-900 text-sm sm:text-base">GCash Payment</Label>
                </div>
                
                {/* QR Code Display (if available) */}
                {paymentSettings.gcash_qr_url && (
                  <div className="flex justify-center py-2">
                    <div className="bg-white p-3 rounded-lg border-2 border-green-300">
                      <img 
                        src={paymentSettings.gcash_qr_url} 
                        alt="GCash QR Code"
                        className="w-48 h-48 object-contain"
                      />
                      <p className="text-xs text-center text-green-700 mt-2">Scan to pay via GCash</p>
                    </div>
                  </div>
                )}
                
                {/* GCash Details */}
                <div className="space-y-1">
                  {paymentSettings.gcash_name && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm text-green-700 font-medium">Account Name:</span>
                      <span className="text-xs sm:text-sm font-semibold text-green-900">{paymentSettings.gcash_name}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-green-700 font-medium">GCash Number:</span>
                    <span className="text-xs sm:text-sm font-mono font-semibold text-green-900">{paymentSettings.gcash_number}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Method Display (for non-bank transfer) */}
            {paymentMethod && paymentMethod !== 'BANK_TRANSFER' && (
              <div className="flex items-center justify-center">
                <Badge className={`text-base px-4 py-2 ${paymentMethod === 'CHEQUE' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}>
                  {paymentMethod === 'GCASH' ? 'GCash' : paymentMethod === 'CHEQUE' ? 'Cheque' : 'Cash'}
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
                <input
                  ref={paymentProofInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePaymentProofFileSelect}
                />
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => startCamera()}
                    className="min-h-[44px]"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Take Photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => paymentProofInputRef.current?.click()}
                    className="min-h-[44px]"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Photo
                  </Button>
                </div>
                {paymentProofFile && (
                  <p className="text-sm text-muted-foreground text-center">
                    {paymentProofFile.name} ({(paymentProofFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
                {!paymentProofFile && !showCamera && (
                  <p className="text-sm text-muted-foreground text-center">
                    Take a photo or upload an image showing the payment receipt/proof. It will be saved under this payment method (e.g. Bank Transfer → selected bank).
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
                  if (paymentMethod === 'BANK_TRANSFER') {
                    setShowBankSelectionModal(true);
                  } else {
                  setShowPaymentMethodModal(true);
                  }
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
                    <span className="text-muted-foreground">Shop Name:</span>
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
                <div className="space-y-2">
                <Badge className={`text-base px-3 py-1 ${paymentMethod === 'CHEQUE' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}>
                  {paymentMethod === 'GCASH' ? 'GCash' : paymentMethod === 'BANK_TRANSFER' ? 'Bank Transfer' : paymentMethod === 'CHEQUE' ? 'Cheque' : 'Cash'}
                </Badge>
                  {paymentMethod === 'BANK_TRANSFER' && selectedBank && (
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Bank:</span>
                        <span className="font-semibold">{selectedBank.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Account Number:</span>
                        <span className="font-mono font-semibold">{selectedBank.account_number}</span>
                      </div>
                    </div>
                  )}
                </div>
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
                  <h4 className="text-muted-foreground text-sm flex items-center gap-1">
                    Client Name
                  </h4>
                  <p className="font-medium">{orderToView.clientName}</p>
                </div>
                <div>
                  <h4 className="text-muted-foreground text-sm flex items-center gap-1">
                    Pricing Strategy
                  </h4>
                  <Badge variant="outline" className="capitalize font-semibold bg-primary/5">
                    {orderToView.pricingStrategy === 'special' ? 'Special Pricing (Allocated)' :
                      orderToView.pricingStrategy === 'dsp' ? 'DSP Pricing' : 'RSP Pricing'}
                  </Badge>
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
                {orderToView.items && orderToView.items.length > 0 ? (
                  (() => {
                    // Group items by brand
                    const itemsByBrand = orderToView.items.reduce((acc: any, item: any) => {
                      const brand = item.brandName || 'Unknown Brand';
                      if (!acc[brand]) {
                        acc[brand] = [];
                      }
                      acc[brand].push(item);
                      return acc;
                    }, {});

                    const brands = Object.keys(itemsByBrand).sort();

                    return (
                      <>
                        {/* Mobile: card list grouped by brand */}
                        <div className="md:hidden space-y-4">
                          {brands.map((brand) => (
                            <div key={brand} className="space-y-2">
                              <div className="flex items-center gap-2 pb-2 border-b">
                                <h5 className="font-semibold text-base text-primary">{brand}</h5>
                                <Badge variant="outline" className="text-xs">
                                  {itemsByBrand[brand].length} item{itemsByBrand[brand].length > 1 ? 's' : ''}
                                </Badge>
                              </div>
                              {itemsByBrand[brand].map((item: any) => (
                                <div key={item.id} className="rounded-lg border bg-background p-3 ml-2">
                                  <div className="flex items-center justify-between">
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold truncate">{item.variantName}</div>
                                    </div>
                                    <Badge variant={item.variantType === 'flavor' ? 'default' : item.variantType === 'battery' ? 'secondary' : 'outline'}>
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
                              ))}
                              {/* Brand subtotal */}
                              <div className="ml-2 flex justify-end pr-3">
                                <div className="text-sm font-semibold text-muted-foreground">
                                  Brand Total: ₱{itemsByBrand[brand].reduce((sum: number, item: any) => sum + item.total, 0).toFixed(2)}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Desktop/Tablet: table grouped by brand */}
                        <div className="hidden md:block space-y-4">
                          {brands.map((brand) => (
                            <div key={brand} className="border rounded-lg overflow-hidden">
                              <div className="bg-muted/50 px-4 py-2 border-b">
                                <div className="flex items-center justify-between">
                                  <h5 className="font-semibold text-base text-primary">{brand}</h5>
                                  <div className="flex items-center gap-4">
                                    <span className="text-sm text-muted-foreground">
                                      {itemsByBrand[brand].length} item{itemsByBrand[brand].length > 1 ? 's' : ''}
                                    </span>
                                    <span className="text-sm font-semibold">
                                      Brand Total: ₱{itemsByBrand[brand].reduce((sum: number, item: any) => sum + item.total, 0).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="w-full overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Item</TableHead>
                                      <TableHead>Type</TableHead>
                                      <TableHead className="text-right">Quantity</TableHead>
                                      <TableHead className="text-right">Unit Price</TableHead>
                                      <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {itemsByBrand[brand].map((item: any) => (
                                      <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.variantName}</TableCell>
                                        <TableCell>
                                          <Badge variant={item.variantType === 'flavor' ? 'default' : item.variantType === 'battery' ? 'secondary' : 'outline'}>
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
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()
                ) : (
                  <div className="rounded-lg border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                    No items found for this order
                  </div>
                )}
              </div>

              {/* Payment Information */}
              {(orderToView.paymentMethod || (orderToView.paymentMode === 'SPLIT' && orderToView.paymentSplits && orderToView.paymentSplits.length > 0)) && (
                <div className="space-y-3 border-t pt-4">
                  <h4 className="font-semibold text-lg flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Payment Information
                  </h4>
                  
                  {/* Split Payment Breakdown */}
                  {orderToView.paymentMode === 'SPLIT' && Array.isArray(orderToView.paymentSplits) && orderToView.paymentSplits.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-base px-3 py-1">
                          <Split className="h-4 w-4 mr-1 inline" />
                          Split Payment
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {orderToView.paymentSplits.length} payment method{orderToView.paymentSplits.length > 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        {orderToView.paymentSplits.map((split: any, index: number) => (
                          <Card key={index} className="p-4 bg-muted/30">
                            <div className="flex justify-between items-start mb-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary">
                                    {split.method === 'BANK_TRANSFER' ? 'Bank Transfer' :
                                     split.method === 'GCASH' ? 'GCash' :
                                     split.method === 'CASH' ? 'Cash' :
                                     split.method === 'CHEQUE' ? 'Cheque' : split.method}
                                  </Badge>
                                  {split.bank && (
                                    <span className="text-sm font-medium">{split.bank}</span>
                                  )}
                                </div>
                                <p className="text-lg font-semibold text-primary">
                                  ₱{split.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                                </p>
                              </div>
                            </div>
                            {split.proofUrl && (
                              <div className="mt-3 pt-3 border-t">
                                <Label className="text-sm text-muted-foreground mb-2 block">Payment Proof</Label>
                                <div className="border rounded-lg overflow-hidden bg-white">
                                  <img
                                    src={split.proofUrl}
                                    alt={`Payment Proof - ${split.method}`}
                                    className="w-full h-auto max-h-64 object-contain cursor-pointer"
                                    onClick={() => window.open(split.proofUrl, '_blank')}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2YjcyODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
                                    }}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Click image to view full size</p>
                              </div>
                            )}
                          </Card>
                        ))}
                      </div>
                      
                      {/* Split Payment Total */}
                      <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-4">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-lg">Total Payment:</span>
                          <span className="font-bold text-xl text-primary">
                            ₱{orderToView.paymentSplits.reduce((sum: number, split: any) => sum + (split.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Full Payment Display */
                    <div className="space-y-2">
                      <div>
                        <Label className="text-muted-foreground">Payment Method</Label>
                        <p className="font-medium">
                          {orderToView.paymentMethod === 'GCASH' ? 'GCash' :
                            orderToView.paymentMethod === 'BANK_TRANSFER' ? (
                              <>
                                Bank Transfer
                                {orderToView.bankType && (
                                  <span className="ml-2 text-sm text-muted-foreground">({orderToView.bankType})</span>
                                )}
                              </>
                            ) : orderToView.paymentMethod === 'CHEQUE' ? (
                              'Cheque'
                            ) :
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
                              className="w-full h-auto max-h-96 object-contain cursor-pointer"
                              onClick={() => window.open(orderToView.paymentProofUrl, '_blank')}
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2YzZjRmNiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2YjcyODAiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Click image to view full size</p>
                        </div>
                      )}
                    </div>
                  )}
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
