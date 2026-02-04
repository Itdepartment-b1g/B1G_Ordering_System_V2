import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { format } from 'date-fns';
import { canViewCashDeposits } from '@/lib/roleUtils';
import { sendNotificationToCompanyRoles } from '@/features/shared/lib/notification.helpers';
import {
  BanknoteIcon,
  AlertCircle,
  Loader2,
  UploadCloud,
  CheckCircle2,
  Filter,
  Camera,
  X,
  Eye,
  CreditCard
} from 'lucide-react';

// Interfaces
interface CashDeposit {
  id: string;
  depositDate: string;
  amount: number;
  bankAccount: string;
  referenceNumber: string;
  status: string;
  agentName: string;
  depositSlipUrl?: string;
  depositType?: 'CASH' | 'CHEQUE';
}

const BANK_OPTIONS = [
  "Unionbank - 00-218-002553-7",
  "BPI - 1761-011118",
  "PBCOM - 238101006138"
];

export default function LeaderCashDepositsPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // State
  const [loading, setLoading] = useState(false);
  const [pendingDeposits, setPendingDeposits] = useState<CashDeposit[]>([]);
  const [depositHistory, setDepositHistory] = useState<CashDeposit[]>([]);

  // Deposit Modal State
  const [depositTypeSelectionOpen, setDepositTypeSelectionOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [selectedPendingDeposit, setSelectedPendingDeposit] = useState<CashDeposit | null>(null);
  const [depositType, setDepositType] = useState<'CASH' | 'CHEQUE'>('CASH');
  const [bankAccount, setBankAccount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [depositSlipFile, setDepositSlipFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // View Details Modal State
  const [viewDepositDialogOpen, setViewDepositDialogOpen] = useState(false);
  const [selectedDepositToView, setSelectedDepositToView] = useState<CashDeposit | null>(null);

  // Camera State
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);


  // Initial Fetch & Realtime
  useEffect(() => {
    if (!user?.id || !['team_leader', 'super_admin', 'system_administrator', 'finance', 'manager', 'admin'].includes(user.role)) return;

    // Initial fetch
    fetchData();

    // Debounce timer for smooth real-time updates
    let updateTimer: NodeJS.Timeout | null = null;
    const debouncedRefresh = () => {
      if (updateTimer) clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        console.log('🔄 Real-time update: Refreshing cash deposits...');
        fetchData(false); // Skip loading state for real-time updates
      }, 300);
    };

    // Subscribe to cash_deposits changes
    const depositsChannel = supabase
      .channel(`cash-deposits-changes-${user.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'cash_deposits',
        },
        (payload) => {
          console.log('🔔 Cash deposit change detected:', payload.eventType, payload);
          debouncedRefresh();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active for cash_deposits');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error for cash_deposits');
        }
      });

    return () => {
      if (updateTimer) clearTimeout(updateTimer);
      supabase.removeChannel(depositsChannel);
    };
  }, [user?.id, user?.role]);

  const fetchData = async (showLoading = true) => {
    if (!user?.id) return;
    if (showLoading) setLoading(true);
    try {
      await fetchDepositHistory();
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      if (showLoading) setLoading(false);
    }
  };


  const fetchDepositHistory = async () => {
    try {
      let query = supabase
        .from('cash_deposits')
        .select(`
          id, deposit_date, amount, bank_account, reference_number, status, deposit_slip_url, agent_id, deposit_type,
          agent:profiles!cash_deposits_agent_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      // Apply Team Filtering for Managers and Team Leaders
      if (['manager', 'team_leader'].includes(user?.role || '')) {
        if (!user?.company_id) return;

        // Fetch Team Hierarchy
        const { data: relationships, error: relError } = await supabase
          .from('leader_teams')
          .select('agent_id, leader_id')
          .eq('company_id', user.company_id);

        if (relError) throw relError;

        // Determine Team Members (Direct + Indirect for Managers)
        const directReports = (relationships || [])
          .filter(r => r.leader_id === user?.id)
          .map(r => r.agent_id);

        let allTeamIds = directReports;

        if (user?.role === 'manager') {
          const secondLevelReports = (relationships || [])
            .filter(r => directReports.includes(r.leader_id))
            .map(r => r.agent_id);
          allTeamIds = Array.from(new Set([...directReports, ...secondLevelReports]));
        }

        // If no team members, return empty or handle gracefully
        if (allTeamIds.length > 0) {
          query = query.in('agent_id', allTeamIds);
        } else {
          // If no team, filter to empty list (impossible ID)
          // Or just let it return their own if they have any, but 'agent_id' usually refers to the depositor.
          // A safe way to return nothing is .in('id', []) but clearer is to just set empty.
          setPendingDeposits([]);
          setDepositHistory([]);
          return;
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const deposits = (data || []).map((d: any) => ({
        id: d.id,
        depositDate: d.deposit_date,
        amount: d.amount,
        bankAccount: d.bank_account,
        referenceNumber: d.reference_number,
        status: d.status,
        agentName: d.agent?.full_name || 'Unknown',
        depositSlipUrl: d.deposit_slip_url,
        depositType: d.deposit_type || 'CASH'
      }));

      // Separate pending and verified deposits
      setPendingDeposits(deposits.filter(d => d.status === 'pending_verification'));
      setDepositHistory(deposits.filter(d => d.status === 'verified'));

    } catch (error) {
      console.error('Error fetching history', error);
      toast({
        title: 'Error',
        description: 'Failed to load deposit history',
        variant: 'destructive'
      });
    }
  };


  const handleOpenDepositModal = (pendingDeposit: CashDeposit) => {
    setSelectedPendingDeposit(pendingDeposit);
    setBankAccount('');
    setReferenceNumber('');
    setDepositSlipFile(null);
    setShowCamera(false);

    // If type is already known (from recent remittance update), skip selection
    if (pendingDeposit.depositType === 'CASH' || pendingDeposit.depositType === 'CHEQUE') {
      setDepositType(pendingDeposit.depositType);
      setDepositDialogOpen(true);
    } else {
      // Fallback for old records or unspecified types
      setDepositTypeSelectionOpen(true);
    }
  };

  const handleSelectDepositType = (type: 'CASH' | 'CHEQUE') => {
    setDepositType(type);
    setDepositTypeSelectionOpen(false);
    setDepositDialogOpen(true);
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(mediaStream);
      setShowCamera(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: 'Camera Error',
        description: 'Unable to access camera',
        variant: 'destructive'
      });
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    const video = document.getElementById('camera-video') as HTMLVideoElement;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `deposit-slip-${Date.now()}.jpg`, { type: 'image/jpeg' });
          setDepositSlipFile(file);
          stopCamera();
          toast({ title: 'Photo Captured', description: 'Deposit slip photo captured successfully!' });
        }
      }, 'image/jpeg', 0.95);
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

  const handleSubmitDeposit = async () => {
    if (!bankAccount || !depositSlipFile || !selectedPendingDeposit) {
      toast({ title: "Incomplete", description: "Please fill all fields and upload slip.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      // 1. Upload Slip
      const timestamp = Date.now();
      const filePath = `${user?.id}/deposits/${timestamp}_${depositSlipFile.name}`;

      const { error: uploadError } = await supabase.storage
        .from('cash-deposits')
        .upload(filePath, depositSlipFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('cash-deposits')
        .getPublicUrl(filePath);

      // 2. Update existing pending deposit with bank details (keep status as pending_verification)
      const { error: updateError } = await supabase
        .from('cash_deposits')
        .update({
          bank_account: bankAccount,
          reference_number: referenceNumber,
          deposit_slip_url: publicUrl,
          updated_at: new Date().toISOString(),
          deposit_type: depositType // Save the selected deposit type
          // Note: status remains 'pending_verification' - requires super admin/manager verification
        })
        .eq('id', selectedPendingDeposit.id);

      if (updateError) throw updateError;

      toast({ title: "Success", description: `${depositType === 'CASH' ? 'Cash' : 'Cheque'} deposit details recorded successfully! Awaiting verification.` });

      // Notify finance/admin roles that a new deposit is ready for verification (non-blocking)
      if (user?.company_id) {
        try {
          await sendNotificationToCompanyRoles({
            companyId: user.company_id,
            roles: ['admin', 'finance', 'super_admin', 'system_administrator'],
            type: 'system_message',
            title: 'New Cash/Cheque Deposit Pending Verification',
            message: `${user.full_name || 'A team leader'} recorded a ${depositType === 'CASH' ? 'cash' : 'cheque'} deposit for ${selectedPendingDeposit.agentName}.`,
            referenceType: 'cash_deposit',
            referenceId: selectedPendingDeposit.id,
          });
        } catch (e) {
          console.warn('Cash deposit notification failed (non-blocking):', e);
        }
      }
      setDepositDialogOpen(false);
      stopCamera(); // Clean up camera if it's still running
      fetchData();

    } catch (error: any) {
      console.error("Deposit Error:", error);
      toast({ title: "Error", description: error.message || "Failed to record deposit", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };


  if (!canViewCashDeposits(user?.role)) {
    return (
      <div className="p-8 space-y-6">
        <Card>
          <CardContent className="p-12">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
              <p className="text-muted-foreground">
                Only team leaders, managers, and admins can access this page.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6 md:space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Team Cash Deposits</h1>
          <p className="text-sm md:text-base text-muted-foreground">Record cash deposits from remittances</p>
        </div>
        <Button variant="outline" size="icon" className="h-9 w-9 md:h-10 md:w-10" onClick={() => fetchData()} title="Refresh">
          {loading ? <Loader2 className="h-3 w-3 md:h-4 md:w-4 animate-spin" /> : <Filter className="h-3 w-3 md:h-4 md:w-4" />}
        </Button>
      </div>

      {/* Pending Deposits Section - Cash received from remittance that needs to be deposited to bank */}
      {pendingDeposits.length > 0 && (
        <Card className="border-l-4 border-l-orange-500 shadow-sm">
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-xl">
              <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-orange-600" />
              Pending Deposits ({pendingDeposits.length})
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Cash deposits awaiting verification
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6">
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {pendingDeposits.map((deposit) => (
                <div key={deposit.id} className="border rounded-lg p-3 space-y-2 bg-orange-50/30">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{deposit.agentName}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(deposit.depositDate), 'MMM dd, yyyy')}</p>
                    </div>
                    <p className="text-sm font-bold">₱{deposit.amount.toLocaleString()}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Type:</span>
                      <Badge variant="outline" className={`ml-1 ${deposit.depositType === 'CHEQUE' ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                        {deposit.depositType === 'CHEQUE' ? 'CHEQUE' : 'CASH'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Source:</span>
                      <p className="font-medium text-[10px] truncate">{deposit.bankAccount}</p>
                    </div>
                    {deposit.referenceNumber && !deposit.referenceNumber.startsWith('REMIT-') && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Ref:</span>
                        <p className="font-mono text-[10px]">{deposit.referenceNumber}</p>
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className="pt-2 border-t">
                    {['finance', 'super_admin', 'admin'].includes(user?.role || '') ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => {
                          setSelectedDepositToView(deposit);
                          setViewDepositDialogOpen(true);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    ) : ['manager'].includes(user?.role || '') ? (
                      <div className="text-center py-1">
                        <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200 text-xs">
                          View Only
                        </Badge>
                      </div>
                    ) : !deposit.referenceNumber || deposit.referenceNumber.startsWith('REMIT-') ? (
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handleOpenDepositModal(deposit)}
                      >
                        <BanknoteIcon className="h-3 w-3 mr-1" />
                        Record Deposit
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => {
                          setSelectedDepositToView(deposit);
                          setViewDepositDialogOpen(true);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Remittance Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Ref Number</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingDeposits.map((deposit) => (
                  <TableRow key={deposit.id} className="bg-orange-50/30">
                    <TableCell>{format(new Date(deposit.depositDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={deposit.depositType === 'CHEQUE' ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-green-50 text-green-700 border-green-200"}>
                        {deposit.depositType === 'CHEQUE' ? (
                          <CreditCard className="h-3 w-3 mr-1" />
                        ) : (
                          <BanknoteIcon className="h-3 w-3 mr-1" />
                        )}
                        {deposit.depositType || 'CASH'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{deposit.agentName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        {deposit.bankAccount}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{deposit.referenceNumber || '-'}</TableCell>
                    <TableCell className="text-right font-bold text-lg">₱{deposit.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      {['finance', 'super_admin', 'admin'].includes(user?.role || '') ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedDepositToView(deposit);
                            setViewDepositDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Details
                        </Button>
                      ) : ['manager'].includes(user?.role || '') ? (
                        <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200">
                          View Only
                        </Badge>
                      ) : !deposit.referenceNumber || deposit.referenceNumber.startsWith('REMIT-') ? (
                        <Button
                          size="sm"
                          onClick={() => handleOpenDepositModal(deposit)}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          <BanknoteIcon className="h-4 w-4 mr-1" />
                          Record Deposit
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 justify-end">
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Awaiting Verification
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedDepositToView(deposit);
                              setViewDepositDialogOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deposit History Section */}
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Verified Deposit History</CardTitle>
          <CardDescription className="text-xs md:text-sm">Confirmed bank deposits recorded in the system</CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {depositHistory.length === 0 ? (
            <p className="text-muted-foreground text-xs md:text-sm">No verified deposits yet.</p>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-3">
                {depositHistory.map((deposit) => (
                  <div key={deposit.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">{deposit.agentName}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(deposit.depositDate), 'MMM dd, yyyy')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">₱{deposit.amount.toLocaleString()}</p>
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 h-5 text-[10px]">
                          <CheckCircle2 className="h-2 w-2 mr-1" /> Verified
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <Badge variant="outline" className={`ml-1 ${deposit.depositType === 'CHEQUE' ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                          {deposit.depositType === 'CHEQUE' ? 'CHEQUE' : 'CASH'}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Bank:</span>
                        <p className="font-medium text-[10px] truncate">{deposit.bankAccount}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Ref:</span>
                        <p className="font-mono text-[10px]">{deposit.referenceNumber || '-'}</p>
                      </div>
                    </div>

                    <div className="pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => {
                          setSelectedDepositToView(deposit);
                          setViewDepositDialogOpen(true);
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block">
                <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Ref Number</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {depositHistory.map((deposit) => (
                  <TableRow key={deposit.id}>
                    <TableCell>{format(new Date(deposit.depositDate), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={deposit.depositType === 'CHEQUE' ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-green-50 text-green-700 border-green-200"}>
                        {deposit.depositType === 'CHEQUE' ? (
                          <CreditCard className="h-3 w-3 mr-1" />
                        ) : (
                          <BanknoteIcon className="h-3 w-3 mr-1" />
                        )}
                        {deposit.depositType || 'CASH'}
                      </Badge>
                    </TableCell>
                    <TableCell>{deposit.agentName}</TableCell>
                    <TableCell>{deposit.bankAccount}</TableCell>
                    <TableCell className="font-mono text-xs">{deposit.referenceNumber || '-'}</TableCell>
                    <TableCell className="text-right font-medium">₱{deposit.amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Verified
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedDepositToView(deposit);
                          setViewDepositDialogOpen(true);
                        }}
                      >
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Deposit Type Selection Modal */}
      <Dialog open={depositTypeSelectionOpen} onOpenChange={setDepositTypeSelectionOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Select Deposit Type</DialogTitle>
            <DialogDescription>
              Is this a Cash Deposit or a Cheque Deposit?
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-6">
            <Button
              variant="outline"
              className="h-32 flex flex-col items-center justify-center gap-4 hover:bg-emerald-50 hover:border-emerald-200 transition-all group"
              onClick={() => handleSelectDepositType('CASH')}
            >
              <div className="p-3 rounded-full bg-emerald-100 group-hover:bg-emerald-200 transition-colors">
                <BanknoteIcon className="h-8 w-8 text-emerald-700" />
              </div>
              <span className="font-semibold text-lg text-emerald-900">Cash Deposit</span>
            </Button>

            <Button
              variant="outline"
              className="h-32 flex flex-col items-center justify-center gap-4 hover:bg-purple-50 hover:border-purple-200 transition-all group"
              onClick={() => handleSelectDepositType('CHEQUE')}
            >
              <div className="p-3 rounded-full bg-purple-100 group-hover:bg-purple-200 transition-colors">
                <CreditCard className="h-8 w-8 text-purple-700" />
              </div>
              <span className="font-semibold text-lg text-purple-900">Cheque Deposit</span>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDepositTypeSelectionOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Record Deposit Modal */}
      {isMobile ? (
        <Sheet open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
          <SheetContent side="bottom" className="h-[90vh] p-0">
            <ScrollArea className="h-full">
              <div className="p-6 space-y-4">
                <SheetHeader>
                  <SheetTitle className="text-base">Record {depositType === 'CHEQUE' ? 'Cheque' : 'Cash'} Deposit</SheetTitle>
                  <SheetDescription className="text-xs">
                    Enter deposit details for {selectedPendingDeposit?.agentName}
                  </SheetDescription>
                </SheetHeader>
                {/* Form Content */}
                <div className="space-y-4">
                  <div className={`p-3 rounded-lg flex justify-between items-center border ${depositType === 'CHEQUE' ? 'bg-purple-50 border-purple-100' : 'bg-emerald-50 border-emerald-100'}`}>
                    <span className={`${depositType === 'CHEQUE' ? 'text-purple-800' : 'text-emerald-800'} text-xs font-medium`}>Amount:</span>
                    <span className={`text-lg font-bold ${depositType === 'CHEQUE' ? 'text-purple-700' : 'text-emerald-700'}`}>
                      ₱{(selectedPendingDeposit?.amount || 0).toLocaleString()}
                    </span>
                  </div>

                  {selectedPendingDeposit && (
                    <div className="border rounded-md p-3 bg-orange-50/30 border-orange-200 space-y-2 text-xs">
                      <p className="font-semibold uppercase text-muted-foreground text-[10px]">Remittance Details</p>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Agent:</span>
                        <span className="font-medium">{selectedPendingDeposit.agentName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date:</span>
                        <span className="font-medium">{format(new Date(selectedPendingDeposit.depositDate), 'MMM dd, yyyy')}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-medium">Bank Account</label>
                    <Select value={bankAccount} onValueChange={setBankAccount}>
                      <SelectTrigger className="h-10 text-xs">
                        <SelectValue placeholder="Select bank" />
                      </SelectTrigger>
                      <SelectContent>
                        {BANK_OPTIONS.map((bank) => (
                          <SelectItem key={bank} value={bank} className="text-xs">{bank}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">Reference Number</label>
                    <Input
                      placeholder="TR-123456789"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="h-10 text-xs"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium">Deposit Slip Photo</label>
                    {showCamera ? (
                      <div className="space-y-2">
                        <div className="relative bg-black rounded-lg overflow-hidden">
                          <video
                            id="camera-video"
                            autoPlay
                            playsInline
                            ref={(video) => {
                              if (video && stream) {
                                video.srcObject = stream;
                              }
                            }}
                            className="w-full h-48 object-cover"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button type="button" onClick={capturePhoto} size="sm" className="text-xs">
                            <Camera className="h-3 w-3 mr-1" />
                            Capture
                          </Button>
                          <Button type="button" variant="outline" onClick={stopCamera} size="sm" className="text-xs">
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : depositSlipFile ? (
                      <div className="space-y-2">
                        <div className={`border-2 rounded-lg p-3 ${depositType === 'CHEQUE' ? 'border-purple-200 bg-purple-50' : 'border-emerald-200 bg-emerald-50'}`}>
                          <div className={`text-xs font-medium flex items-center justify-center gap-2 ${depositType === 'CHEQUE' ? 'text-purple-700' : 'text-emerald-700'}`}>
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Photo: {depositSlipFile.name}</span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDepositSlipFile(null)}
                          size="sm"
                          className="w-full text-xs"
                        >
                          <X className="h-3 w-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={startCamera}
                          size="sm"
                          className="w-full text-xs"
                        >
                          <Camera className="h-3 w-3 mr-1" />
                          Take Photo
                        </Button>
                        <div className="relative">
                          <div className="border-2 border-dashed rounded-lg p-4 text-center hover:bg-muted/50 transition-colors cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              onChange={(e) => setDepositSlipFile(e.target.files?.[0] || null)}
                            />
                            <div className="space-y-1 pointer-events-none">
                              <UploadCloud className="h-6 w-6 mx-auto text-muted-foreground" />
                              <p className="text-[10px] text-muted-foreground">Or upload from device</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sticky buttons for mobile */}
                <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t space-y-2">
                  <Button
                    onClick={handleSubmitDeposit}
                    disabled={submitting || !bankAccount || !depositSlipFile}
                    className={`w-full h-10 text-xs ${depositType === 'CHEQUE' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                  >
                    {submitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Confirm Deposit
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDepositDialogOpen(false);
                      stopCamera();
                    }}
                    disabled={submitting}
                    className="w-full h-10 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record {depositType === 'CHEQUE' ? 'Cheque' : 'Cash'} Deposit</DialogTitle>
              <DialogDescription>
                Enter {depositType?.toLowerCase()} deposit details for remittance from <strong>{selectedPendingDeposit?.agentName}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className={`p-4 rounded-lg flex justify-between items-center border ${depositType === 'CHEQUE' ? 'bg-purple-50 border-purple-100' : 'bg-emerald-50 border-emerald-100'}`}>
                <span className={`${depositType === 'CHEQUE' ? 'text-purple-800' : 'text-emerald-800'} font-medium`}>Amount to Deposit:</span>
                <span className={`text-2xl font-bold ${depositType === 'CHEQUE' ? 'text-purple-700' : 'text-emerald-700'}`}>
                  ₱{(selectedPendingDeposit?.amount || 0).toLocaleString()}
                </span>
              </div>

              {selectedPendingDeposit && (
                <div className="border rounded-md p-3 bg-orange-50/30 border-orange-200">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Remittance Details</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Agent:</span>
                      <span className="font-medium">{selectedPendingDeposit.agentName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Remittance Date:</span>
                      <span className="font-medium">{format(new Date(selectedPendingDeposit.depositDate), 'MMM dd, yyyy')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reference:</span>
                      <span className="font-mono text-xs">{selectedPendingDeposit.referenceNumber}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Bank Account</label>
                <Select value={bankAccount} onValueChange={setBankAccount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a bank account" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_OPTIONS.map((bank) => (
                      <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Deposit Reference Number</label>
                <Input
                  placeholder="e.g. TR-123456789"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Deposit Slip Photo</label>
                {showCamera ? (
                  <div className="space-y-3">
                    <div className="relative bg-black rounded-lg overflow-hidden">
                      <video
                        id="camera-video"
                        autoPlay
                        playsInline
                        ref={(video) => {
                          if (video && stream) {
                            video.srcObject = stream;
                          }
                        }}
                        className="w-full h-64 object-cover"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" onClick={capturePhoto} className="flex-1">
                        <Camera className="h-4 w-4 mr-2" />
                        Capture Photo
                      </Button>
                      <Button type="button" variant="outline" onClick={stopCamera}>
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : depositSlipFile ? (
                  <div className="space-y-3">
                    <div className={`border-2 rounded-lg p-4 ${depositType === 'CHEQUE' ? 'border-purple-200 bg-purple-50' : 'border-emerald-200 bg-emerald-50'}`}>
                      <div className={`text-sm font-medium flex items-center justify-center gap-2 ${depositType === 'CHEQUE' ? 'text-purple-700' : 'text-emerald-700'}`}>
                        <CheckCircle2 className="h-5 w-5" />
                        <span>Photo Captured: {depositSlipFile.name}</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDepositSlipFile(null)}
                      className="w-full"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Remove Photo
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={startCamera}
                      className="w-full"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Take Photo
                    </Button>
                    <div className="relative">
                      <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onChange={(e) => setDepositSlipFile(e.target.files?.[0] || null)}
                        />
                        <div className="space-y-2 pointer-events-none">
                          <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Or click to upload from device</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDepositDialogOpen(false);
                  stopCamera();
                }}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitDeposit}
                disabled={submitting || !bankAccount || !depositSlipFile}
                className={`${depositType === 'CHEQUE' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Deposit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* View Deposit Details Modal */}
      {isMobile ? (
        <Sheet open={viewDepositDialogOpen} onOpenChange={setViewDepositDialogOpen}>
          <SheetContent side="bottom" className="h-[85vh] p-0">
            <ScrollArea className="h-full">
              <div className="p-6 space-y-4">
                <SheetHeader>
                  <SheetTitle className="text-base">Deposit Details</SheetTitle>
                  <SheetDescription className="text-xs">Verified deposit information</SheetDescription>
                </SheetHeader>

                {selectedDepositToView && (
                  <>
                    {/* Amount Card */}
                    <div className="p-3 bg-gray-50 rounded-lg flex justify-between items-center border border-gray-100">
                      <span className="text-gray-600 text-xs font-medium">Amount:</span>
                      <span className="text-lg font-bold text-gray-900">
                        ₱{selectedDepositToView.amount.toLocaleString()}
                      </span>
                    </div>

                    {/* Details Cards */}
                    <div className="space-y-3">
                      {/* Status */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Status</span>
                          <div className="flex items-center gap-2">
                            {selectedDepositToView.status === 'verified' ? (
                              <>
                                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                <span className="text-xs font-medium text-emerald-700">Verified</span>
                              </>
                            ) : selectedDepositToView.status === 'pending_verification' ? (
                              <>
                                <AlertCircle className="h-3 w-3 text-amber-600" />
                                <span className="text-xs font-medium text-amber-700">Pending</span>
                              </>
                            ) : (
                              <span className="text-xs font-medium text-muted-foreground capitalize">
                                {selectedDepositToView.status.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Type */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Type</span>
                          <Badge variant="outline" className={selectedDepositToView.depositType === 'CHEQUE' ? "bg-purple-50 text-purple-700 border-purple-200 h-5" : "bg-green-50 text-green-700 border-green-200 h-5"}>
                            {selectedDepositToView.depositType === 'CHEQUE' ? (
                              <CreditCard className="h-2 w-2 mr-1" />
                            ) : (
                              <BanknoteIcon className="h-2 w-2 mr-1" />
                            )}
                            <span className="text-[10px]">{selectedDepositToView.depositType || 'CASH'}</span>
                          </Badge>
                        </div>
                      </div>

                      {/* Date */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Date</span>
                          <span className="text-xs font-medium">
                            {format(new Date(selectedDepositToView.depositDate), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      </div>

                      {/* Agent */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Agent</span>
                          <span className="text-xs font-medium">{selectedDepositToView.agentName}</span>
                        </div>
                      </div>

                      {/* Bank */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Bank</span>
                          <span className="text-xs font-medium truncate ml-2">{selectedDepositToView.bankAccount}</span>
                        </div>
                      </div>

                      {/* Reference */}
                      <div className="border rounded-lg p-3 bg-background">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground text-xs">Reference</span>
                          <span className="text-[10px] font-mono">{selectedDepositToView.referenceNumber}</span>
                        </div>
                      </div>
                    </div>

                    {/* Deposit Slip Image */}
                    {selectedDepositToView.depositSlipUrl && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-medium">Deposit Slip</h4>
                        <div className="border rounded-lg overflow-hidden bg-gray-50">
                          <img
                            src={selectedDepositToView.depositSlipUrl}
                            alt="Deposit Slip"
                            className="w-full h-auto object-contain max-h-[250px]"
                          />
                        </div>
                        <div className="text-center">
                          <a
                            href={selectedDepositToView.depositSlipUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-blue-600 hover:underline"
                          >
                            View Full Image
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Close Button */}
                    <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t">
                      <Button variant="outline" onClick={() => setViewDepositDialogOpen(false)} className="w-full h-10 text-xs">
                        Close
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={viewDepositDialogOpen} onOpenChange={setViewDepositDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Deposit Details</DialogTitle>
              <DialogDescription>
                Verified deposit information.
              </DialogDescription>
            </DialogHeader>

            {selectedDepositToView && (
              <div className="space-y-4 py-4">
                <div className="p-4 bg-gray-50 rounded-lg flex justify-between items-center border border-gray-100">
                  <span className="text-gray-600 font-medium">Amount:</span>
                  <span className="text-2xl font-bold text-gray-900">
                    ₱{selectedDepositToView.amount.toLocaleString()}
                  </span>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Status</span>
                    <span className="col-span-2 flex items-center gap-2">
                      {selectedDepositToView.status === 'verified' ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="font-medium text-emerald-700">Verified</span>
                        </>
                      ) : selectedDepositToView.status === 'pending_verification' ? (
                        <>
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                          <span className="font-medium text-amber-700">Pending Verification</span>
                        </>
                      ) : (
                        <span className="font-medium text-muted-foreground capitalize">
                          {selectedDepositToView.status.replace('_', ' ')}
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Type</span>
                    <span className="col-span-2 flex items-center gap-2">
                      <Badge variant="outline" className={selectedDepositToView.depositType === 'CHEQUE' ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-green-50 text-green-700 border-green-200"}>
                        {selectedDepositToView.depositType === 'CHEQUE' ? (
                          <CreditCard className="h-3 w-3 mr-1" />
                        ) : (
                          <BanknoteIcon className="h-3 w-3 mr-1" />
                        )}
                        {selectedDepositToView.depositType || 'CASH'}
                      </Badge>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Date</span>
                    <span className="col-span-2 font-medium">
                      {format(new Date(selectedDepositToView.depositDate), 'MMMM dd, yyyy')}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Agent</span>
                    <span className="col-span-2 font-medium">{selectedDepositToView.agentName}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="col-span-2 font-medium">{selectedDepositToView.bankAccount}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-2 border-b">
                    <span className="text-muted-foreground">Ref Number</span>
                    <span className="col-span-2 font-mono">{selectedDepositToView.referenceNumber}</span>
                  </div>
                </div>

                {selectedDepositToView.depositSlipUrl && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">Deposit Slip</h4>
                    <div className="border rounded-lg overflow-hidden bg-gray-50">
                      <img
                        src={selectedDepositToView.depositSlipUrl}
                        alt="Deposit Slip"
                        className="w-full h-auto object-contain max-h-[300px]"
                      />
                    </div>
                    <div className="mt-2 text-center">
                      <a
                        href={selectedDepositToView.depositSlipUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                        title="Open full image in new tab"
                      >
                        View Full Image
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setViewDepositDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div >
  );
}
