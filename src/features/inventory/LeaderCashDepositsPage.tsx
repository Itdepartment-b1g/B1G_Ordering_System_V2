import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { format } from 'date-fns';
import { canViewCashDeposits } from '@/lib/roleUtils';
import {
  BanknoteIcon,
  AlertCircle,
  Loader2,
  UploadCloud,
  CheckCircle2,
  Filter,
  Camera,
  X,
  Eye
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
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [selectedPendingDeposit, setSelectedPendingDeposit] = useState<CashDeposit | null>(null);
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
          id, deposit_date, amount, bank_account, reference_number, status, deposit_slip_url, agent_id,
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
        depositSlipUrl: d.deposit_slip_url
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
          updated_at: new Date().toISOString()
          // Note: status remains 'pending_verification' - requires super admin/manager verification
        })
        .eq('id', selectedPendingDeposit.id);

      if (updateError) throw updateError;

      toast({ title: "Success", description: "Cash deposit details recorded successfully! Awaiting verification." });
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
    <div className="container mx-auto p-4 md:p-8 space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Cash Deposits</h1>
          <p className="text-muted-foreground">Record cash deposits from agent remittances.</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => fetchData()} title="Refresh">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
        </Button>
      </div>

      {/* Pending Deposits Section - Cash received from remittance that needs to be deposited to bank */}
      {pendingDeposits.length > 0 && (
        <Card className="border-l-4 border-l-orange-500 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Pending Deposits ({pendingDeposits.length})
            </CardTitle>
            <CardDescription>
              Cash deposits awaiting verification. Record deposit details or verify existing deposits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Remittance Date</TableHead>
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
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Awaiting Verification
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Deposit History Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Verified Deposit History</CardTitle>
          <CardDescription>Confirmed bank deposits recorded in the system.</CardDescription>
        </CardHeader>
        <CardContent>
          {depositHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">No verified deposits yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
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
          )}
        </CardContent>
      </Card>

      {/* Record Deposit Modal */}
      <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record Cash Deposit</DialogTitle>
            <DialogDescription>
              Enter bank deposit details for cash received from <strong>{selectedPendingDeposit?.agentName}</strong> during remittance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-emerald-50 rounded-lg flex justify-between items-center border border-emerald-100">
              <span className="text-emerald-800 font-medium">Amount to Deposit:</span>
              <span className="text-2xl font-bold text-emerald-700">
                ₱{(selectedPendingDeposit?.amount || 0).toLocaleString()}
              </span>
            </div>

            {/* Show remittance info for pending deposits */}
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

              {/* Show camera feed or photo options */}
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
                    <Button
                      type="button"
                      onClick={capturePhoto}
                      className="flex-1"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Capture Photo
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={stopCamera}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : depositSlipFile ? (
                <div className="space-y-3">
                  <div className="border-2 border-emerald-200 bg-emerald-50 rounded-lg p-4">
                    <div className="text-sm text-emerald-700 font-medium flex items-center justify-center gap-2">
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
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Deposit Details Modal */}
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
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="font-medium text-emerald-700">Verified</span>
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
    </div>
  );
}
