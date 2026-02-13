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
import type { ReturnItem } from '../types';
import { format } from 'date-fns';

interface ReturnInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leaderId?: string | null;
  leaderName?: string | null;
}

export function ReturnInventoryDialog({ 
  open, 
  onOpenChange,
  leaderId,
  leaderName
}: ReturnInventoryDialogProps) {
  const { user } = useAuth();
  const { agentBrands } = useAgentInventory();
  const { toast } = useToast();

  // Form states
  const [returnMode, setReturnMode] = useState<'full' | 'partial'>('full');
  const [returnReason, setReturnReason] = useState('');
  const [reasonNotes, setReasonNotes] = useState('');
  const [selectedItems, setSelectedItems] = useState<ReturnItem[]>([]);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // UI states
  const [expandedBrands, setExpandedBrands] = useState<string[]>([]);

  const returnReasons = [
    { value: 'resignation', label: 'Resignation' },
    { value: 'leave', label: 'Extended Leave' },
    { value: 'termination', label: 'Termination' },
    { value: 'recall', label: 'Inventory Recall' },
    { value: 'transfer', label: 'Role Transfer' },
    { value: 'other', label: 'Other' }
  ];

  // Auto-populate all items for "full" return mode
  useEffect(() => {
    if (returnMode === 'full') {
      const allItems: ReturnItem[] = [];
      agentBrands.forEach(brand => {
        brand.flavors.forEach(flavor => {
          if (flavor.stock > 0) {
            allItems.push({
              variant_id: flavor.id,
              variantName: flavor.name,
              brandName: brand.name,
              variantType: 'flavor',
              quantity: flavor.stock,
              maxQuantity: flavor.stock
            });
          }
        });
        brand.batteries.forEach(battery => {
          if (battery.stock > 0) {
            allItems.push({
              variant_id: battery.id,
              variantName: battery.name,
              brandName: brand.name,
              variantType: 'battery',
              quantity: battery.stock,
              maxQuantity: battery.stock
            });
          }
        });
        brand.posms.forEach(posm => {
          if (posm.stock > 0) {
            allItems.push({
              variant_id: posm.id,
              variantName: posm.name,
              brandName: brand.name,
              variantType: 'posm',
              quantity: posm.stock,
              maxQuantity: posm.stock
            });
          }
        });
      });
      setSelectedItems(allItems);
      // Expand all brands in full mode
      setExpandedBrands(agentBrands.map(b => b.id));
    } else {
      setSelectedItems([]);
      setExpandedBrands([]);
    }
  }, [returnMode, agentBrands]);

  // Calculate totals
  const totalItems = useMemo(() => selectedItems.length, [selectedItems]);
  const totalQuantity = useMemo(() => 
    selectedItems.reduce((sum, item) => sum + item.quantity, 0), 
    [selectedItems]
  );

  // Validation
  const canSubmit = useMemo(() => {
    return (
      returnReason &&
      selectedItems.length > 0 &&
      selectedItems.every(item => item.quantity > 0 && item.quantity <= item.maxQuantity) &&
      signatureDataUrl &&
      leaderId
    );
  }, [returnReason, selectedItems, signatureDataUrl, leaderId]);

  const toggleBrand = (brandId: string) => {
    setExpandedBrands(prev => 
      prev.includes(brandId) 
        ? prev.filter(id => id !== brandId)
        : [...prev, brandId]
    );
  };

  const handleItemToggle = (variant: any, brandName: string, variantType: 'flavor' | 'battery' | 'posm') => {
    const variantId = variant.id;
    const existing = selectedItems.find(item => item.variant_id === variantId);
    
    if (existing) {
      setSelectedItems(prev => prev.filter(item => item.variant_id !== variantId));
    } else {
      setSelectedItems(prev => [...prev, {
        variant_id: variantId,
        variantName: variant.name,
        brandName,
        variantType,
        quantity: variant.stock,
        maxQuantity: variant.stock
      }]);
    }
  };

  const handleQuantityChange = (variantId: string, quantity: number) => {
    setSelectedItems(prev => 
      prev.map(item => 
        item.variant_id === variantId 
          ? { ...item, quantity: Math.min(Math.max(1, quantity), item.maxQuantity) }
          : item
      )
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

      const dateFolder = format(new Date(), 'yyyy-MM-dd');
      const userName = user.full_name || 'unknown-user';
      const sanitizedUserName = userName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const timestamp = Date.now();
      const filename = `returns/${dateFolder}/${sanitizedUserName}/${timestamp}.png`;

      const { data, error } = await supabase.storage
        .from('remittance-signatures')
        .upload(filename, blob, {
          contentType: 'image/png',
          upsert: false
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
        variant: 'destructive'
      });
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast({
        title: 'Validation Error',
        description: 'Please complete all required fields',
        variant: 'destructive'
      });
      return;
    }

    if (!leaderId) {
      toast({
        title: 'Error',
        description: 'No leader assigned. Please contact your administrator.',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);
    try {
      // Upload signature
      const signatureData = await uploadSignature();
      if (!signatureData) {
        throw new Error('Failed to upload signature');
      }

      // Prepare items array for database
      const itemsForDb = selectedItems.map(item => ({
        variant_id: item.variant_id,
        quantity: item.quantity
      }));

      // Call return inventory function
      const { data, error } = await supabase.rpc('return_inventory_to_leader', {
        p_agent_id: user!.id,
        p_receiver_id: leaderId,
        p_return_type: returnMode,
        p_return_reason: returnReason,
        p_reason_notes: reasonNotes || null,
        p_items: itemsForDb,
        p_signature_url: signatureData.url,
        p_signature_path: signatureData.path
      });

      if (error) {
        console.error('RPC error:', error);
        throw error;
      }

      if (data && !data.success) {
        throw new Error(data.message || 'Failed to return inventory');
      }

      toast({
        title: 'Success!',
        description: `Successfully returned ${data.total_quantity} units (${data.items_returned} items) to ${leaderName || 'your leader'}.`,
        variant: 'default'
      });

      // Close dialog and refresh
      onOpenChange(false);
      
      // Reset form
      setReturnMode('full');
      setReturnReason('');
      setReasonNotes('');
      setSelectedItems([]);
      setSignatureDataUrl(null);

      // Refresh page to update inventory
      setTimeout(() => window.location.reload(), 1000);
    } catch (error: any) {
      console.error('Error returning inventory:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to return inventory',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageMinus className="h-5 w-5" />
              Return Inventory
            </DialogTitle>
            <DialogDescription>
              Return inventory items back to {leaderName || 'your leader'}. This action will transfer the selected items immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Return Mode Selection */}
            <div className="space-y-3">
              <Label>Return Mode *</Label>
              <RadioGroup value={returnMode} onValueChange={(value: 'full' | 'partial') => setReturnMode(value)}>
                <div className="flex items-center space-x-2 border rounded-md p-3 hover:bg-accent cursor-pointer">
                  <RadioGroupItem value="full" id="full" />
                  <Label htmlFor="full" className="flex-1 cursor-pointer">
                    <div className="font-medium">Return All Inventory</div>
                    <div className="text-sm text-muted-foreground">Return all items currently in your inventory</div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-md p-3 hover:bg-accent cursor-pointer">
                  <RadioGroupItem value="partial" id="partial" />
                  <Label htmlFor="partial" className="flex-1 cursor-pointer">
                    <div className="font-medium">Select Specific Items</div>
                    <div className="text-sm text-muted-foreground">Choose which items and quantities to return</div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Return Reason */}
            <div className="space-y-2">
              <Label htmlFor="return-reason">Return Reason *</Label>
              <Select value={returnReason} onValueChange={setReturnReason}>
                <SelectTrigger id="return-reason">
                  <SelectValue placeholder="Select reason for return" />
                </SelectTrigger>
                <SelectContent>
                  {returnReasons.map(reason => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Additional Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Additional Notes</Label>
              <Textarea
                id="notes"
                placeholder="Provide additional details about this return..."
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Items Selection (only for partial mode) */}
            {returnMode === 'partial' && (
              <div className="space-y-2">
                <Label>Select Items to Return *</Label>
                <div className="border rounded-md p-4 max-h-96 overflow-y-auto space-y-2">
                  {agentBrands.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No inventory available</p>
                  ) : (
                    agentBrands.map(brand => {
                      const hasStock = brand.flavors.some(f => f.stock > 0) || 
                                      brand.batteries.some(b => b.stock > 0) || 
                                      brand.posms.some(p => p.stock > 0);
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
                              {[...brand.flavors, ...brand.batteries, ...brand.posms].map(variant => {
                                if (variant.stock <= 0) return null;
                                
                                const variantType = brand.flavors.includes(variant) ? 'flavor' :
                                                  brand.batteries.includes(variant) ? 'battery' : 'posm';
                                const isSelected = selectedItems.some(item => item.variant_id === variant.id);
                                const selectedItem = selectedItems.find(item => item.variant_id === variant.id);

                                return (
                                  <div key={variant.id} className="flex items-center gap-3 p-2 border rounded">
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => handleItemToggle(variant, brand.name, variantType)}
                                    />
                                    <div className="flex-1">
                                      <div className="font-medium text-sm">{variant.name}</div>
                                      <div className="text-xs text-muted-foreground">
                                        Available: {variant.stock} units
                                      </div>
                                    </div>
                                    {isSelected && (
                                      <div className="flex items-center gap-2">
                                        <Label htmlFor={`qty-${variant.id}`} className="text-sm">Qty:</Label>
                                        <Input
                                          id={`qty-${variant.id}`}
                                          type="number"
                                          min="1"
                                          max={variant.stock}
                                          value={selectedItem?.quantity || 0}
                                          onChange={(e) => handleQuantityChange(variant.id, parseInt(e.target.value) || 1)}
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

            {/* Summary */}
            {selectedItems.length > 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <strong>Summary:</strong> {totalItems} item(s) selected, {totalQuantity} total units to be returned.
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
                <strong>Warning:</strong> This action will immediately transfer the selected inventory to {leaderName || 'your leader'}. This cannot be undone.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
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
                'Return Inventory'
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
              Sign below to confirm the inventory return
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

