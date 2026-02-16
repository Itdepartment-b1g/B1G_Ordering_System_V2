import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CreditCard,
  Building2,
  Smartphone,
  Wallet,
  FileText,
  Save,
  Loader2,
  CheckCircle,
  Plus,
  Trash2,
  Upload,
  X,
  ImageIcon,
  AlertCircle,
  Pencil
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks';
import { usePaymentSettings } from '@/features/finance/hooks/usePaymentSettings';
import type { BankAccount, CompanyPaymentSettings } from '@/types/database.types';

export default function PaymentSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings, loading: loadingSettings, refetch } = usePaymentSettings();

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [showAddBankDialog, setShowAddBankDialog] = useState(false);
  const [showEditBankDialog, setShowEditBankDialog] = useState(false);
  const [editingBankIndex, setEditingBankIndex] = useState<number | null>(null);
  const [newBank, setNewBank] = useState({ name: '', account_number: '' });
  const [editBank, setEditBank] = useState({ name: '', account_number: '' });

  // GCash state
  const [gcashEnabled, setGcashEnabled] = useState(false);
  const [gcashNumber, setGcashNumber] = useState('');
  const [gcashName, setGcashName] = useState('');
  const [gcashQrUrl, setGcashQrUrl] = useState('');

  // Payment method toggles
  const [cashEnabled, setCashEnabled] = useState(true);
  const [chequeEnabled, setChequeEnabled] = useState(true);
  const [bankTransferEnabled, setBankTransferEnabled] = useState(false);

  // Load settings into state
  useEffect(() => {
    if (settings) {
      setBankAccounts(settings.bank_accounts || []);
      setGcashEnabled(settings.gcash_enabled);
      setGcashNumber(settings.gcash_number || '');
      setGcashName(settings.gcash_name || '');
      setGcashQrUrl(settings.gcash_qr_url || '');
      setCashEnabled(settings.cash_enabled);
      setChequeEnabled(settings.cheque_enabled);
      setBankTransferEnabled(settings.bank_transfer_enabled);
    }
  }, [settings]);

  const handleAddBank = () => {
    if (!newBank.name || !newBank.account_number) {
      toast({
        title: 'Validation Error',
        description: 'Please enter both bank name and account number',
        variant: 'destructive'
      });
      return;
    }

    setBankAccounts([
      ...bankAccounts,
      {
        name: newBank.name,
        account_number: newBank.account_number,
        enabled: true,
        qr_code_url: undefined
      }
    ]);

    setNewBank({ name: '', account_number: '' });
    setShowAddBankDialog(false);

    toast({
      title: 'Bank Added',
      description: 'Remember to save changes'
    });
  };

  const handleRemoveBank = (index: number) => {
    const updatedBanks = bankAccounts.filter((_, i) => i !== index);
    setBankAccounts(updatedBanks);
  };

  const handleOpenEditBank = (index: number) => {
    const bank = bankAccounts[index];
    setEditingBankIndex(index);
    setEditBank({ name: bank.name, account_number: bank.account_number });
    setShowEditBankDialog(true);
  };

  const handleEditBankSave = () => {
    if (!editBank.name || !editBank.account_number) {
      toast({
        title: 'Validation Error',
        description: 'Please enter both bank name and account number',
        variant: 'destructive'
      });
      return;
    }

    if (editingBankIndex === null) return;

    const updatedBanks = [...bankAccounts];
    updatedBanks[editingBankIndex] = {
      ...updatedBanks[editingBankIndex],
      name: editBank.name,
      account_number: editBank.account_number
    };
    setBankAccounts(updatedBanks);

    setEditBank({ name: '', account_number: '' });
    setEditingBankIndex(null);
    setShowEditBankDialog(false);

    toast({
      title: 'Bank Updated',
      description: 'Remember to save changes'
    });
  };

  const handleToggleBankEnabled = (index: number) => {
    const updatedBanks = [...bankAccounts];
    updatedBanks[index].enabled = !updatedBanks[index].enabled;
    setBankAccounts(updatedBanks);
  };

  const handleUploadQr = async (index: number, file: File) => {
    if (!user?.company_id) return;

    try {
      setUploading(true);

      // Validate file type
      if (!file.type.startsWith('image/')) {
        throw new Error('Please upload an image file');
      }

      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image must be less than 5MB');
      }

      // Generate unique file name
      const timestamp = Date.now();
      const fileName = `${user.company_id}/bank_${index}_${timestamp}.${file.name.split('.').pop()}`;

      // Upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('payment-qr-codes')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('payment-qr-codes')
        .getPublicUrl(uploadData.path);

      // Update bank account with QR URL
      const updatedBanks = [...bankAccounts];
      updatedBanks[index].qr_code_url = urlData.publicUrl;
      setBankAccounts(updatedBanks);

      toast({
        title: 'QR Code Uploaded',
        description: 'Remember to save changes to apply'
      });
    } catch (error) {
      console.error('Error uploading QR code:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload QR code',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveQr = (index: number) => {
    const updatedBanks = [...bankAccounts];
    updatedBanks[index].qr_code_url = undefined;
    setBankAccounts(updatedBanks);
  };

  const handleUploadGcashQr = async (file: File) => {
    if (!user?.company_id) return;

    try {
      setUploading(true);

      if (!file.type.startsWith('image/')) {
        throw new Error('Please upload an image file');
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image must be less than 5MB');
      }

      const timestamp = Date.now();
      const fileName = `${user.company_id}/gcash_${timestamp}.${file.name.split('.').pop()}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('payment-qr-codes')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('payment-qr-codes')
        .getPublicUrl(uploadData.path);

      setGcashQrUrl(urlData.publicUrl);

      toast({
        title: 'GCash QR Code Uploaded',
        description: 'Remember to save changes to apply'
      });
    } catch (error) {
      console.error('Error uploading GCash QR code:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload QR code',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const validateSettings = (): boolean => {
    // At least one payment method must be enabled
    if (!cashEnabled && !chequeEnabled && !gcashEnabled && !bankTransferEnabled) {
      toast({
        title: 'Validation Error',
        description: 'At least one payment method must be enabled',
        variant: 'destructive'
      });
      return false;
    }

    // If bank transfer enabled, need at least one bank
    if (bankTransferEnabled && bankAccounts.length === 0) {
      toast({
        title: 'Validation Error',
        description: 'Please add at least one bank account for bank transfer',
        variant: 'destructive'
      });
      return false;
    }

    // If GCash enabled, need GCash number
    if (gcashEnabled && !gcashNumber) {
      toast({
        title: 'Validation Error',
        description: 'Please enter GCash number to enable GCash payment',
        variant: 'destructive'
      });
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!user?.company_id) return;
    if (!validateSettings()) return;

    try {
      setSaving(true);

      const paymentSettings: Partial<CompanyPaymentSettings> = {
        company_id: user.company_id,
        bank_accounts: bankAccounts,
        // Always save GCash data even when disabled, so it can be re-enabled later
        gcash_number: gcashNumber || null,
        gcash_name: gcashName || null,
        gcash_qr_url: gcashQrUrl || null,
        cash_enabled: cashEnabled,
        cheque_enabled: chequeEnabled,
        gcash_enabled: gcashEnabled,
        bank_transfer_enabled: bankTransferEnabled
      };

      const { error } = await supabase
        .from('company_payment_settings')
        .upsert(paymentSettings, {
          onConflict: 'company_id'
        });

      if (error) throw error;

      await refetch();

      toast({
        title: 'Settings Saved',
        description: 'Payment settings have been updated successfully'
      });
    } catch (error) {
      console.error('Error saving payment settings:', error);
      toast({
        title: 'Save Failed',
        description: error instanceof Error ? error.message : 'Failed to save settings',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Payment Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure payment methods and bank accounts for your company
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      {/* Bank Accounts Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle>Bank Accounts</CardTitle>
            </div>
            <Button onClick={() => setShowAddBankDialog(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Bank
            </Button>
          </div>
          <CardDescription>
            Manage bank accounts for bank transfer payments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Bank Transfer Toggle */}
          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>Bank Transfer Payment</Label>
                <p className="text-sm text-muted-foreground">
                  Enable bank transfer as a payment option
                </p>
              </div>
            </div>
            <Switch
              checked={bankTransferEnabled}
              onCheckedChange={setBankTransferEnabled}
            />
          </div>

          {bankAccounts.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No bank accounts configured. Add a bank account to enable bank transfer payments.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {bankAccounts.map((bank, index) => (
                <div
                  key={index}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{bank.name}</h3>
                        <Badge variant={bank.enabled ? 'default' : 'secondary'}>
                          {bank.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground font-mono mt-1">
                        {bank.account_number}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={bank.enabled}
                        onCheckedChange={() => handleToggleBankEnabled(index)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditBank(index)}
                        title="Edit bank details"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveBank(index)}
                        title="Delete bank"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  {/* QR Code Section */}
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm">QR Code (Optional)</Label>
                    {bank.qr_code_url ? (
                      <div className="space-y-2">
                        <div className="relative inline-block">
                          <img
                            src={bank.qr_code_url}
                            alt={`${bank.name} QR Code`}
                            className="h-32 w-32 object-contain border rounded"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute -top-2 -right-2 h-6 w-6"
                            onClick={() => handleRemoveQr(index)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadQr(index, file);
                          }}
                          disabled={uploading}
                          className="hidden"
                          id={`bank-qr-${index}`}
                        />
                        <Label htmlFor={`bank-qr-${index}`}>
                          <div className="flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-muted/40 transition-colors">
                            <Upload className="h-4 w-4" />
                            <span className="text-sm">Upload QR Code</span>
                          </div>
                        </Label>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* GCash Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <CardTitle>GCash Payment</CardTitle>
          </div>
          <CardDescription>
            Configure GCash payment method
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* GCash Toggle */}
          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>Enable GCash</Label>
                <p className="text-sm text-muted-foreground">
                  Accept payments via GCash
                </p>
              </div>
            </div>
            <Switch
              checked={gcashEnabled}
              onCheckedChange={setGcashEnabled}
            />
          </div>

          {/* GCash Configuration - Always visible (like bank accounts) */}
          <div className="space-y-4">
            {!gcashEnabled && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  GCash payment is currently disabled. Enable it above to accept GCash payments.
                </AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label>GCash Number *</Label>
              <Input
                placeholder="09XX XXX XXXX"
                value={gcashNumber}
                onChange={(e) => setGcashNumber(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Account Name (Optional)</Label>
              <Input
                placeholder="Account holder name"
                value={gcashName}
                onChange={(e) => setGcashName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>GCash QR Code (Optional)</Label>
              {gcashQrUrl ? (
                <div className="space-y-2">
                  <div className="relative inline-block">
                    <img
                      src={gcashQrUrl}
                      alt="GCash QR Code"
                      className="h-32 w-32 object-contain border rounded"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={() => setGcashQrUrl('')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadGcashQr(file);
                    }}
                    disabled={uploading}
                    className="hidden"
                    id="gcash-qr"
                  />
                  <Label htmlFor="gcash-qr">
                    <div className="flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-muted/40 transition-colors">
                      <Upload className="h-4 w-4" />
                      <span className="text-sm">Upload GCash QR Code</span>
                    </div>
                  </Label>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cash & Cheque Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <CardTitle>Other Payment Methods</CardTitle>
          </div>
          <CardDescription>
            Enable or disable cash and cheque payments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cash Payment */}
          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>Cash Payment</Label>
                <p className="text-sm text-muted-foreground">
                  Accept cash on delivery
                </p>
              </div>
            </div>
            <Switch
              checked={cashEnabled}
              onCheckedChange={setCashEnabled}
            />
          </div>

          {/* Cheque Payment */}
          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>Cheque Payment</Label>
                <p className="text-sm text-muted-foreground">
                  Accept payments via cheque
                </p>
              </div>
            </div>
            <Switch
              checked={chequeEnabled}
              onCheckedChange={setChequeEnabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Add Bank Dialog */}
      <Dialog open={showAddBankDialog} onOpenChange={setShowAddBankDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
            <DialogDescription>
              Enter the bank name and account number
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Bank Name *</Label>
              <Input
                placeholder="e.g., BDO, BPI, Metrobank"
                value={newBank.name}
                onChange={(e) => setNewBank({ ...newBank, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Account Number *</Label>
              <Input
                placeholder="e.g., 1234-5678-9012"
                value={newBank.account_number}
                onChange={(e) => setNewBank({ ...newBank, account_number: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddBankDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddBank}>
              <Plus className="mr-2 h-4 w-4" />
              Add Bank
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Bank Dialog */}
      <Dialog open={showEditBankDialog} onOpenChange={setShowEditBankDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bank Account</DialogTitle>
            <DialogDescription>
              Update the bank name and account number
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Bank Name *</Label>
              <Input
                placeholder="e.g., BDO, BPI, Metrobank"
                value={editBank.name}
                onChange={(e) => setEditBank({ ...editBank, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Account Number *</Label>
              <Input
                placeholder="e.g., 1234-5678-9012"
                value={editBank.account_number}
                onChange={(e) => setEditBank({ ...editBank, account_number: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditBankDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditBankSave}>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
