import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import { useAuth } from '@/features/auth';
import { useAgentInventory } from '../hooks';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, PackageMinus, ChevronDown, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface ReturnItem {
  variant_id: string;
  variantName: string;
  brandName: string;
  variantType: string;
  quantity: number;
  maxQuantity: number;
}

interface ReturnToMainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReturnToMainDialog({ open, onOpenChange }: ReturnToMainDialogProps) {
  const { user } = useAuth();
  const { agentBrands } = useAgentInventory();
  const { toast } = useToast();

  const [returnMode, setReturnMode] = useState<'full' | 'partial'>('full');
  const [returnReason, setReturnReason] = useState('');
  const [reasonNotes, setReasonNotes] = useState('');
  const [selectedItems, setSelectedItems] = useState<ReturnItem[]>([]);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedBrands, setExpandedBrands] = useState<string[]>([]);

  const returnReasons = [
    { value: 'recall', label: 'Inventory Recall' },
    { value: 'excess', label: 'Excess Stock' },
    { value: 'resignation', label: 'Resignation' },
    { value: 'leave', label: 'Extended Leave' },
    { value: 'termination', label: 'Termination' },
    { value: 'transfer', label: 'Role Transfer' },
    { value: 'other', label: 'Other' },
  ];

  useEffect(() => {
    if (returnMode === 'full') {
      const allItems: ReturnItem[] = [];
      agentBrands.forEach(brand => {
        (brand.allVariants || []).forEach(variant => {
          if (variant.stock > 0) {
            allItems.push({
              variant_id: variant.id,
              variantName: variant.name,
              brandName: brand.name,
              variantType: variant.variantType || 'flavor',
              quantity: variant.stock,
              maxQuantity: variant.stock,
            });
          }
        });
      });
      setSelectedItems(allItems);
      setExpandedBrands(agentBrands.map(b => b.id));
    } else {
      setSelectedItems([]);
      setExpandedBrands([]);
    }
  }, [returnMode, agentBrands]);

  const totalItems = useMemo(() => selectedItems.length, [selectedItems]);
  const totalQuantity = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.quantity, 0),
    [selectedItems],
  );

  const canSubmit = useMemo(
    () =>
      returnReason &&
      selectedItems.length > 0 &&
      selectedItems.every(item => item.quantity > 0 && item.quantity <= item.maxQuantity) &&
      !!signatureDataUrl,
    [returnReason, selectedItems, signatureDataUrl],
  );

  const toggleBrand = (brandId: string) => {
    setExpandedBrands(prev =>
      prev.includes(brandId) ? prev.filter(id => id !== brandId) : [...prev, brandId],
    );
  };

  const handleItemToggle = (variant: any, brandName: string, variantType: string) => {
    const variantId = variant.id;
    const existing = selectedItems.find(item => item.variant_id === variantId);
    if (existing) {
      setSelectedItems(prev => prev.filter(item => item.variant_id !== variantId));
    } else {
      setSelectedItems(prev => [
        ...prev,
        {
          variant_id: variantId,
          variantName: variant.name,
          brandName,
          variantType,
          quantity: variant.stock,
          maxQuantity: variant.stock,
        },
      ]);
    }
  };

  const handleQuantityChange = (variantId: string, quantity: number) => {
    setSelectedItems(prev =>
      prev.map(item =>
        item.variant_id === variantId
          ? { ...item, quantity: Math.min(Math.max(1, quantity), item.maxQuantity) }
          : item,
      ),
    );
  };

  const uploadSignature = async (): Promise<{ url: string; path: string } | null> => {
    if (!signatureDataUrl || !user?.id) return null;

    try {
      const base64Data = signatureDataUrl.split(',')[1];
      if (!base64Data) throw new Error('Invalid signature data');

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'image/png' });

      const timestamp = Date.now();
      const dateFolder = format(new Date(), 'yyyy-MM-dd');
      const sanitizedUserName = (user.full_name || user.id).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `return-to-main/${dateFolder}/${sanitizedUserName}/${timestamp}.png`;

      const { data, error } = await supabase.storage
        .from('remittance-signatures')
        .upload(filename, blob, {
          contentType: 'image/png',
          upsert: false,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('remittance-signatures')
        .getPublicUrl(filename);

      return { url: publicUrl, path: filename };
    } catch (error: any) {
      console.error('Error uploading signature:', error);
      toast({
        title: 'Signature Upload Failed',
        description: error.message || 'Failed to upload signature',
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !user?.id) return;

    setSubmitting(true);
    try {
      const signatureData = await uploadSignature();
      if (!signatureData) {
        throw new Error('Failed to upload signature');
      }

      const items = selectedItems.map(item => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
      }));

      const reasonLabel = returnReasons.find(r => r.value === returnReason)?.label || returnReason;
      const reason = reasonNotes
        ? `${reasonLabel}: ${reasonNotes}`
        : reasonLabel;

      const { data, error } = await supabase.rpc('return_inventory_to_main', {
        p_leader_id: user.id,
        p_items: items,
        p_performed_by: user.id,
        p_reason: reason,
        p_signature_url: signatureData.url,
        p_signature_path: signatureData.path,
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.message || 'Return failed');

      toast({
        title: 'Success!',
        description: `Returned ${(data as any).total_quantity} units (${(data as any).items_returned} items) to main inventory.`,
      });

      onOpenChange(false);
      setReturnMode('full');
      setReturnReason('');
      setReasonNotes('');
      setSelectedItems([]);
      setSignatureDataUrl(null);

      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      console.error('Error returning inventory to main:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to return inventory',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
  <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageMinus className="h-5 w-5" />
            Return to Main Inventory
          </DialogTitle>
          <DialogDescription>
            Return stock back to the company&apos;s main inventory. Allocated stock will decrease and available stock will increase accordingly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Return Mode */}
          <div className="space-y-3">
            <Label>Return Mode *</Label>
            <RadioGroup value={returnMode} onValueChange={(v: 'full' | 'partial') => setReturnMode(v)}>
              <div className="flex items-center space-x-2 border rounded-md p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="full" id="rtm-full" />
                <Label htmlFor="rtm-full" className="flex-1 cursor-pointer">
                  <div className="font-medium">Return All Inventory</div>
                  <div className="text-sm text-muted-foreground">Return all items currently in your inventory</div>
                </Label>
              </div>
              <div className="flex items-center space-x-2 border rounded-md p-3 hover:bg-accent cursor-pointer">
                <RadioGroupItem value="partial" id="rtm-partial" />
                <Label htmlFor="rtm-partial" className="flex-1 cursor-pointer">
                  <div className="font-medium">Select Specific Items</div>
                  <div className="text-sm text-muted-foreground">Choose which items and quantities to return</div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="rtm-reason">Return Reason *</Label>
            <Select value={returnReason} onValueChange={setReturnReason}>
              <SelectTrigger id="rtm-reason">
                <SelectValue placeholder="Select reason for return" />
              </SelectTrigger>
              <SelectContent>
                {returnReasons.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="rtm-notes">Additional Notes</Label>
            <Textarea
              id="rtm-notes"
              placeholder="Provide additional details about this return..."
              value={reasonNotes}
              onChange={e => setReasonNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Items for partial mode */}
          {returnMode === 'partial' && (
            <div className="space-y-2">
              <Label>Select Items to Return *</Label>
              <div className="border rounded-md p-4 max-h-96 overflow-y-auto space-y-2">
                {agentBrands.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No inventory available</p>
                ) : (
                  agentBrands.map(brand => {
                    const hasStock = (brand.allVariants || []).some(v => v.stock > 0);
                    if (!hasStock) return null;
                    const isExpanded = expandedBrands.includes(brand.id);
                    return (
                      <div key={brand.id} className="border rounded-md">
                        <div
                          className="flex items-center gap-2 p-3 cursor-pointer hover:bg-accent"
                          onClick={() => toggleBrand(brand.id)}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <span className="font-medium">{brand.name}</span>
                        </div>
                        {isExpanded && (
                          <div className="p-3 pt-0 space-y-2">
                            {(brand.allVariants || []).map(variant => {
                              if (variant.stock <= 0) return null;
                              const variantType = variant.variantType || 'flavor';
                              const isSelected = selectedItems.some(item => item.variant_id === variant.id);
                              const selectedItem = selectedItems.find(item => item.variant_id === variant.id);
                              return (
                                <div key={variant.id} className="flex flex-wrap items-center gap-3 p-2 border rounded">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleItemToggle(variant, brand.name, variantType)}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate">{variant.name}</div>
                                    <div className="text-xs text-muted-foreground">Available: {variant.stock} units</div>
                                  </div>
                                  {isSelected && (
                                    <div className="flex items-center gap-2">
                                      <Label htmlFor={`rtm-qty-${variant.id}`} className="text-sm">Qty:</Label>
                                      <Input
                                        id={`rtm-qty-${variant.id}`}
                                        type="number"
                                        min="1"
                                        max={variant.stock}
                                        value={selectedItem?.quantity || 0}
                                        onChange={e => handleQuantityChange(variant.id, parseInt(e.target.value) || 1)}
                                        className="w-20"
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Summary (full mode) */}
          {returnMode === 'full' && selectedItems.length > 0 && (
            <div className="space-y-2">
              <Label>Items to Return</Label>
              <div className="border rounded-md p-4 max-h-60 overflow-y-auto space-y-1">
                {selectedItems.map(item => (
                  <div key={item.variant_id} className="flex items-center justify-between text-sm py-1 border-b last:border-b-0">
                    <span className="truncate">{item.brandName} &mdash; {item.variantName}</span>
                    <span className="font-medium shrink-0 ml-2">{item.quantity} units</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Total */}
          {selectedItems.length > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <strong>Summary:</strong> {totalItems} item(s) selected, {totalQuantity} total units to be returned to main inventory.
              </AlertDescription>
            </Alert>
          )}

          {/* Signature */}
          <div className="space-y-2">
            <Label>Signature *</Label>
            <div className="space-y-2">
              {signatureDataUrl ? (
                <div className="border rounded-md p-4">
                  <img src={signatureDataUrl} alt="Signature" className="max-h-32 mx-auto" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSignatureModal(true)}
                    className="w-full mt-2"
                  >
                    Change Signature
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setShowSignatureModal(true)}
                  className="w-full"
                >
                  Add Signature
                </Button>
              )}
            </div>
          </div>

          {/* Warning */}
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> This action will immediately return the selected inventory to main inventory (allocated stock will decrease). This cannot be undone.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Returning...
              </>
            ) : (
              `Return ${totalQuantity} Units to Main`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Signature Modal */}
    <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Your Signature</DialogTitle>
          <DialogDescription>
            Sign below to confirm the inventory return to main
          </DialogDescription>
        </DialogHeader>
        <SignatureCanvas
          onSave={(dataUrl) => {
            setSignatureDataUrl(dataUrl);
            setShowSignatureModal(false);
          }}
          onCancel={() => setShowSignatureModal(false)}
        />
      </DialogContent>
    </Dialog>
  </>
  );
}
