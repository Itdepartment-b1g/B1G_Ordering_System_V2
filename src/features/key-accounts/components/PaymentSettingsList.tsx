import { useState, useEffect, useRef, useCallback } from 'react';
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
  Building2,
  Smartphone,
  Wallet,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
  AlertCircle,
  Pencil,
  Check,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks';
import { useKeyAccountPaymentSettings } from '@/features/key-accounts/hooks/useKeyAccountPaymentSettings';
import type { BankAccount } from '@/types/database.types';

type DraftSettings = {
  bankAccounts: BankAccount[];
  gcashEnabled: boolean;
  gcashNumber: string;
  gcashName: string;
  gcashQrUrl: string;
  cashEnabled: boolean;
  chequeEnabled: boolean;
  bankTransferEnabled: boolean;
};

function isDraftValid(draft: DraftSettings): boolean {
  if (!draft.cashEnabled && !draft.chequeEnabled && !draft.gcashEnabled && !draft.bankTransferEnabled) {
    return false;
  }
  if (draft.bankTransferEnabled && draft.bankAccounts.length === 0) {
    return false;
  }
  if (draft.gcashEnabled && !draft.gcashNumber.trim()) {
    return false;
  }
  return true;
}

export default function PaymentSettingsList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings, createdByName, loading: loadingSettings, refetch } = useKeyAccountPaymentSettings();
  const canEdit = user?.role === 'sales_head';

  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [uploading, setUploading] = useState(false);
  const skipAutoSaveRef = useRef(true);
  const settingsIdRef = useRef<string | null>(null);
  const saveGenerationRef = useRef(0);
  const lastSavedSnapshotRef = useRef<string | null>(null);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [showAddBankDialog, setShowAddBankDialog] = useState(false);
  const [showEditBankDialog, setShowEditBankDialog] = useState(false);
  const [editingBankIndex, setEditingBankIndex] = useState<number | null>(null);
  const [newBank, setNewBank] = useState({ name: '', account_number: '' });
  const [editBank, setEditBank] = useState({ name: '', account_number: '' });

  const [gcashEnabled, setGcashEnabled] = useState(false);
  const [gcashNumber, setGcashNumber] = useState('');
  const [gcashName, setGcashName] = useState('');
  const [gcashQrUrl, setGcashQrUrl] = useState('');

  const [cashEnabled, setCashEnabled] = useState(true);
  const [chequeEnabled, setChequeEnabled] = useState(true);
  const [bankTransferEnabled, setBankTransferEnabled] = useState(false);

  useEffect(() => {
    settingsIdRef.current = settings?.id ?? null;
  }, [settings?.id]);

  useEffect(() => {
    skipAutoSaveRef.current = true;
    if (settings) {
      const nextBanks = settings.bank_accounts || [];
      setBankAccounts(nextBanks);
      setGcashEnabled(settings.gcash_enabled);
      setGcashNumber(settings.gcash_number || '');
      setGcashName(settings.gcash_name || '');
      setGcashQrUrl(settings.gcash_qr_url || '');
      setCashEnabled(settings.cash_enabled);
      setChequeEnabled(settings.cheque_enabled);
      setBankTransferEnabled(settings.bank_transfer_enabled);
      lastSavedSnapshotRef.current = JSON.stringify({
        bankAccounts: nextBanks,
        gcashEnabled: settings.gcash_enabled,
        gcashNumber: settings.gcash_number || '',
        gcashName: settings.gcash_name || '',
        gcashQrUrl: settings.gcash_qr_url || '',
        cashEnabled: settings.cash_enabled,
        chequeEnabled: settings.cheque_enabled,
        bankTransferEnabled: settings.bank_transfer_enabled,
      });
    } else {
      const emptyDraft: DraftSettings = {
        bankAccounts: [],
        gcashEnabled: false,
        gcashNumber: '',
        gcashName: '',
        gcashQrUrl: '',
        cashEnabled: true,
        chequeEnabled: true,
        bankTransferEnabled: false,
      };
      setBankAccounts(emptyDraft.bankAccounts);
      setGcashEnabled(emptyDraft.gcashEnabled);
      setGcashNumber(emptyDraft.gcashNumber);
      setGcashName(emptyDraft.gcashName);
      setGcashQrUrl(emptyDraft.gcashQrUrl);
      setCashEnabled(emptyDraft.cashEnabled);
      setChequeEnabled(emptyDraft.chequeEnabled);
      setBankTransferEnabled(emptyDraft.bankTransferEnabled);
      // Treat defaults as already "saved" so opening an empty page doesn't create a row until the user edits
      lastSavedSnapshotRef.current = JSON.stringify(emptyDraft);
    }
    // Allow auto-save after hydration settles
    const t = window.setTimeout(() => {
      skipAutoSaveRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [settings]);

  const snapshotDraft = (draft: DraftSettings) => JSON.stringify(draft);

  const persistDraft = useCallback(
    async (draft: DraftSettings) => {
      if (!canEdit || !user?.company_id || !user?.id) return;
      if (!isDraftValid(draft)) return;

      const snapshot = snapshotDraft(draft);
      if (snapshot === lastSavedSnapshotRef.current) return;

      const generation = ++saveGenerationRef.current;
      try {
        setSaving(true);

        const payload = {
          company_id: user.company_id,
          bank_accounts: draft.bankAccounts,
          gcash_number: draft.gcashNumber.trim() || null,
          gcash_name: draft.gcashName.trim() || null,
          gcash_qr_url: draft.gcashQrUrl || null,
          cash_enabled: draft.cashEnabled,
          cheque_enabled: draft.chequeEnabled,
          gcash_enabled: draft.gcashEnabled,
          bank_transfer_enabled: draft.bankTransferEnabled,
        };

        const existingId = settingsIdRef.current;
        const wasInsert = !existingId;
        if (existingId) {
          const { error } = await supabase
            .from('key_account_payment_settings')
            .update(payload)
            .eq('id', existingId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase
            .from('key_account_payment_settings')
            .insert({
              ...payload,
              created_by: user.id,
            })
            .select('id')
            .single();
          if (error) throw error;
          if (data?.id) settingsIdRef.current = data.id;
        }

        if (generation !== saveGenerationRef.current) return;

        lastSavedSnapshotRef.current = snapshot;
        setLastSavedAt(new Date());
        // Only refetch after first create (for created_by label); updates skip to avoid loops
        if (wasInsert) {
          skipAutoSaveRef.current = true;
          await refetch();
        }
      } catch (error) {
        console.error('Error saving key account payment settings:', error);
        toast({
          title: 'Save Failed',
          description: error instanceof Error ? error.message : 'Failed to save settings',
          variant: 'destructive',
        });
      } finally {
        if (generation === saveGenerationRef.current) {
          setSaving(false);
        }
      }
    },
    [canEdit, user?.company_id, user?.id, refetch, toast]
  );

  const currentDraft = useCallback(
    (): DraftSettings => ({
      bankAccounts,
      gcashEnabled,
      gcashNumber,
      gcashName,
      gcashQrUrl,
      cashEnabled,
      chequeEnabled,
      bankTransferEnabled,
    }),
    [
      bankAccounts,
      gcashEnabled,
      gcashNumber,
      gcashName,
      gcashQrUrl,
      cashEnabled,
      chequeEnabled,
      bankTransferEnabled,
    ]
  );

  // Debounced auto-save whenever draft changes (after hydration)
  useEffect(() => {
    if (!canEdit || loadingSettings || skipAutoSaveRef.current) return;

    const draft = currentDraft();
    if (!isDraftValid(draft)) return;

    const timer = window.setTimeout(() => {
      void persistDraft(draft);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [
    canEdit,
    loadingSettings,
    bankAccounts,
    gcashEnabled,
    gcashNumber,
    gcashName,
    gcashQrUrl,
    cashEnabled,
    chequeEnabled,
    bankTransferEnabled,
    currentDraft,
    persistDraft,
  ]);

  const handleAddBank = () => {
    if (!canEdit) return;
    if (!newBank.name || !newBank.account_number) {
      toast({
        title: 'Validation Error',
        description: 'Please enter both bank name and account number',
        variant: 'destructive',
      });
      return;
    }

    setBankAccounts([
      ...bankAccounts,
      {
        name: newBank.name,
        account_number: newBank.account_number,
        enabled: true,
        qr_code_url: undefined,
      },
    ]);

    setNewBank({ name: '', account_number: '' });
    setShowAddBankDialog(false);
  };

  const handleRemoveBank = (index: number) => {
    if (!canEdit) return;
    setBankAccounts(bankAccounts.filter((_, i) => i !== index));
  };

  const handleOpenEditBank = (index: number) => {
    if (!canEdit) return;
    const bank = bankAccounts[index];
    setEditingBankIndex(index);
    setEditBank({ name: bank.name, account_number: bank.account_number });
    setShowEditBankDialog(true);
  };

  const handleEditBankSave = () => {
    if (!canEdit) return;
    if (!editBank.name || !editBank.account_number) {
      toast({
        title: 'Validation Error',
        description: 'Please enter both bank name and account number',
        variant: 'destructive',
      });
      return;
    }

    if (editingBankIndex === null) return;

    const updatedBanks = [...bankAccounts];
    updatedBanks[editingBankIndex] = {
      ...updatedBanks[editingBankIndex],
      name: editBank.name,
      account_number: editBank.account_number,
    };
    setBankAccounts(updatedBanks);

    setEditBank({ name: '', account_number: '' });
    setEditingBankIndex(null);
    setShowEditBankDialog(false);
  };

  const handleToggleBankEnabled = (index: number) => {
    if (!canEdit) return;
    const updatedBanks = [...bankAccounts];
    updatedBanks[index] = { ...updatedBanks[index], enabled: !updatedBanks[index].enabled };
    setBankAccounts(updatedBanks);
  };

  const handleUploadQr = async (index: number, file: File) => {
    if (!canEdit || !user?.company_id) return;

    try {
      setUploading(true);

      if (!file.type.startsWith('image/')) {
        throw new Error('Please upload an image file');
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image must be less than 5MB');
      }

      const timestamp = Date.now();
      const fileName = `${user.company_id}/ka/bank_${index}_${timestamp}.${file.name.split('.').pop()}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('payment-qr-codes')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('payment-qr-codes').getPublicUrl(uploadData.path);

      const updatedBanks = [...bankAccounts];
      updatedBanks[index] = { ...updatedBanks[index], qr_code_url: urlData.publicUrl };
      setBankAccounts(updatedBanks);
    } catch (error) {
      console.error('Error uploading QR code:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload QR code',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveQr = (index: number) => {
    if (!canEdit) return;
    const updatedBanks = [...bankAccounts];
    updatedBanks[index] = { ...updatedBanks[index], qr_code_url: undefined };
    setBankAccounts(updatedBanks);
  };

  const handleUploadGcashQr = async (file: File) => {
    if (!canEdit || !user?.company_id) return;

    try {
      setUploading(true);

      if (!file.type.startsWith('image/')) {
        throw new Error('Please upload an image file');
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image must be less than 5MB');
      }

      const timestamp = Date.now();
      const fileName = `${user.company_id}/ka/gcash_${timestamp}.${file.name.split('.').pop()}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('payment-qr-codes')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('payment-qr-codes').getPublicUrl(uploadData.path);
      setGcashQrUrl(urlData.publicUrl);
    } catch (error) {
      console.error('Error uploading GCash QR code:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload QR code',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
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
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Payment Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure Key Account payment methods and bank accounts
            {canEdit ? ' — changes save automatically' : ''}
          </p>
          {createdByName ? (
            <p className="text-xs text-muted-foreground mt-1">Created by {createdByName}</p>
          ) : !settings && !canEdit ? (
            <p className="text-xs text-muted-foreground mt-1">
              No settings yet. Ask a Sales Head to create them.
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : lastSavedAt ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" />
                Saved
              </>
            ) : null}
          </div>
        ) : (
          <Badge variant="secondary">View only</Badge>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <CardTitle>Bank Accounts</CardTitle>
            </div>
            {canEdit && (
              <Button onClick={() => setShowAddBankDialog(true)} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Bank
              </Button>
            )}
          </div>
          <CardDescription>Manage bank accounts for bank transfer payments</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>Bank Transfer Payment</Label>
                <p className="text-sm text-muted-foreground">
                  Allow Key Account orders to pay via bank transfer
                </p>
              </div>
            </div>
            <Switch
              checked={bankTransferEnabled}
              onCheckedChange={setBankTransferEnabled}
              disabled={!canEdit}
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
                <div key={`${bank.name}-${bank.account_number}-${index}`} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{bank.name}</h3>
                        <Badge variant={bank.enabled ? 'default' : 'secondary'}>
                          {bank.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground font-mono mt-1">{bank.account_number}</p>
                    </div>
                    {canEdit && (
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
                    )}
                  </div>

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
                          {canEdit && (
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute -top-2 -right-2 h-6 w-6"
                              onClick={() => handleRemoveQr(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : canEdit ? (
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
                          id={`ka-bank-qr-${index}`}
                        />
                        <Label htmlFor={`ka-bank-qr-${index}`}>
                          <div className="flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-muted/40 transition-colors">
                            <Upload className="h-4 w-4" />
                            <span className="text-sm">Upload QR Code</span>
                          </div>
                        </Label>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No QR code uploaded</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <CardTitle>GCash Payment</CardTitle>
          </div>
          <CardDescription>Configure GCash payment method</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>Enable GCash</Label>
                <p className="text-sm text-muted-foreground">Accept payments via GCash</p>
              </div>
            </div>
            <Switch checked={gcashEnabled} onCheckedChange={setGcashEnabled} disabled={!canEdit} />
          </div>

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
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-2">
              <Label>Account Name (Optional)</Label>
              <Input
                placeholder="Account holder name"
                value={gcashName}
                onChange={(e) => setGcashName(e.target.value)}
                disabled={!canEdit}
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
                    {canEdit && (
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6"
                        onClick={() => setGcashQrUrl('')}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ) : canEdit ? (
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
                    id="ka-gcash-qr"
                  />
                  <Label htmlFor="ka-gcash-qr">
                    <div className="flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-muted/40 transition-colors">
                      <Upload className="h-4 w-4" />
                      <span className="text-sm">Upload GCash QR Code</span>
                    </div>
                  </Label>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No QR code uploaded</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <CardTitle>Other Payment Methods</CardTitle>
          </div>
          <CardDescription>Enable or disable cash and cheque payments</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border">
            <div className="flex items-center gap-3">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>Cash Payment</Label>
                <p className="text-sm text-muted-foreground">Accept cash on delivery</p>
              </div>
            </div>
            <Switch checked={cashEnabled} onCheckedChange={setCashEnabled} disabled={!canEdit} />
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <Label>Cheque Payment</Label>
                <p className="text-sm text-muted-foreground">Accept payments via cheque</p>
              </div>
            </div>
            <Switch checked={chequeEnabled} onCheckedChange={setChequeEnabled} disabled={!canEdit} />
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAddBankDialog} onOpenChange={setShowAddBankDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bank Account</DialogTitle>
            <DialogDescription>Enter the bank name and account number</DialogDescription>
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

      <Dialog open={showEditBankDialog} onOpenChange={setShowEditBankDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bank Account</DialogTitle>
            <DialogDescription>Update the bank name and account number</DialogDescription>
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
              <Check className="mr-2 h-4 w-4" />
              Update Bank
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
