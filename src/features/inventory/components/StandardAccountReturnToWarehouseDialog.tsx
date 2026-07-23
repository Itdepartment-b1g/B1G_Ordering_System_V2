import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, PenTool, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import {
  uploadStandardAccountReturnProof,
  uploadStandardAccountReturnSignature,
} from '../utils/uploadStandardAccountReturnEvidence';
import { exportStandardAccountReturnPdf } from '../utils/exportStandardAccountReturnPdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type InventoryReturnRow = {
  variant_id: string;
  brandName: string;
  variantName: string;
  variantType: string;
  available: number;
};

type LinkedWarehouseLocation = {
  id: string;
  name: string;
  is_main: boolean;
};

const ACCEPTED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_PROOF_IMAGE_BYTES = 5 * 1024 * 1024;

function normalizeTypeLabel(typeKey: string): string {
  const t = typeKey.toLowerCase();
  if (t === 'flavor') return 'PODS';
  if (t === 'battery') return 'DEVICE';
  if (t === 'posm') return 'POSM';
  return typeKey.toUpperCase();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export interface StandardAccountReturnToWarehouseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  userId: string | null;
  userFullName?: string | null;
  onSuccess?: () => void | Promise<void>;
}

export function StandardAccountReturnToWarehouseDialog({
  open,
  onOpenChange,
  companyId,
  userId,
  userFullName,
  onSuccess,
}: StandardAccountReturnToWarehouseDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState('');
  const [notes, setNotes] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [proofImageDataUrl, setProofImageDataUrl] = useState('');
  const [proofImageName, setProofImageName] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuantities({});
      setFilter('');
      setNotes('');
      setDestinationLocationId('');
      setProofImageDataUrl('');
      setProofImageName('');
      setSignatureDataUrl('');
      setSignatureOpen(false);
      setFormError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  const { data: locations = [], isLoading: loadingLocations } = useQuery({
    queryKey: ['sa-return-linked-warehouse-locations', companyId],
    enabled: open && !!companyId,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<LinkedWarehouseLocation[]> => {
      const { data, error } = await supabase.rpc('get_linked_warehouse_locations', {});
      if (error) throw error;
      return ((data as LinkedWarehouseLocation[]) ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        is_main: !!r.is_main,
      }));
    },
  });

  useEffect(() => {
    if (!open || destinationLocationId || locations.length === 0) return;
    const main = locations.find((l) => l.is_main);
    setDestinationLocationId(main?.id || locations[0].id);
  }, [open, locations, destinationLocationId]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['sa-return-available-inventory', companyId],
    enabled: open && !!companyId,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<InventoryReturnRow[]> => {
      const { data, error } = await supabase
        .from('main_inventory')
        .select(
          `
          variant_id,
          stock,
          allocated_stock,
          variant:variants (
            name,
            variant_type,
            brand:brands ( name )
          )
        `
        )
        .eq('company_id', companyId!)
        .gt('stock', 0);
      if (error) throw error;

      return (data ?? [])
        .map((row) => {
          const r = row as Record<string, unknown>;
          const variant = Array.isArray(r.variant) ? r.variant[0] : r.variant;
          const brand = variant && (Array.isArray(variant.brand) ? variant.brand[0] : variant.brand);
          const stock = Number(r.stock) || 0;
          const allocated = Number(r.allocated_stock) || 0;
          const available = Math.max(0, stock - allocated);
          if (available <= 0) return null;
          return {
            variant_id: r.variant_id as string,
            brandName: (brand as { name?: string })?.name ?? 'Unknown Brand',
            variantName: (variant as { name?: string })?.name ?? String(r.variant_id),
            variantType: (variant as { variant_type?: string })?.variant_type ?? 'unknown',
            available,
          } satisfies InventoryReturnRow;
        })
        .filter(Boolean) as InventoryReturnRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.brandName.toLowerCase().includes(q) ||
        r.variantName.toLowerCase().includes(q) ||
        r.variantType.toLowerCase().includes(q)
    );
  }, [rows, filter]);

  const byBrand = useMemo(() => {
    const m = new Map<string, InventoryReturnRow[]>();
    for (const row of filtered) {
      const list = m.get(row.brandName) || [];
      list.push(row);
      m.set(row.brandName, list);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const summary = useMemo(() => {
    const lines = Object.entries(quantities).filter(([, q]) => (q ?? 0) > 0);
    const totalQty = lines.reduce((s, [, q]) => s + (q ?? 0), 0);
    return { lineCount: lines.length, totalQty };
  }, [quantities]);

  const handleProofFileChange = async (file: File | null) => {
    setFormError(null);
    if (!file) return;
    if (!ACCEPTED_PROOF_TYPES.includes(file.type)) {
      setFormError('Proof photo must be JPG, PNG, WEBP, or GIF.');
      return;
    }
    if (file.size > MAX_PROOF_IMAGE_BYTES) {
      setFormError('Proof photo must be 5MB or smaller.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setProofImageDataUrl(dataUrl);
      setProofImageName(file.name);
    } catch {
      setFormError('Could not read the selected image.');
    }
  };

  const clearProofImage = () => {
    setProofImageDataUrl('');
    setProofImageName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    setFormError(null);
  };

  const handleSubmit = async () => {
    setFormError(null);

    if (!destinationLocationId) {
      setFormError('Choose main warehouse or a sub-warehouse for this return.');
      return;
    }
    if (!proofImageDataUrl) {
      setFormError('Upload a return proof photo.');
      return;
    }
    if (!signatureDataUrl) {
      setFormError('Add your signature to confirm this return.');
      return;
    }
    if (!companyId) {
      setFormError('Missing company context.');
      return;
    }

    const items = Object.entries(quantities)
      .filter(([, q]) => (q ?? 0) > 0)
      .map(([client_variant_id, quantity]) => ({ client_variant_id, quantity }));

    if (items.length === 0) {
      setFormError('Enter a quantity for at least one product.');
      return;
    }

    for (const item of items) {
      const row = rows.find((r) => r.variant_id === item.client_variant_id);
      if (!row || item.quantity > row.available) {
        setFormError(`${row?.variantName ?? 'Product'}: exceeds available stock.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const [proof, signature] = await Promise.all([
        uploadStandardAccountReturnProof({
          proofImageDataUrl,
          companyId,
          fileName: proofImageName,
        }),
        uploadStandardAccountReturnSignature({
          signatureDataUrl,
          companyId,
        }),
      ]);

      const { data, error } = await supabase.rpc('create_standard_account_stock_return_request', {
        p_items: items,
        p_notes: notes.trim() || null,
        p_created_by: userId,
        p_destination_location_id: destinationLocationId,
        p_signature_url: signature.url,
        p_signature_path: signature.path,
        p_proof_image_url: proof.url,
        p_proof_image_path: proof.path,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; request_number?: string };
      if (!result?.success) throw new Error(result?.error ?? 'Failed to create return');

      const dest = locations.find((l) => l.id === destinationLocationId);
      const destName = dest?.name ?? 'warehouse';

      const { data: companyRow } = await supabase
        .from('companies')
        .select('company_name')
        .eq('id', companyId)
        .maybeSingle();

      void exportStandardAccountReturnPdf({
        requestNumber: result.request_number ?? 'RT',
        status: 'pending_receive',
        createdAt: new Date().toISOString(),
        notes: notes.trim() || null,
        clientCompanyName: companyRow?.company_name ?? null,
        destinationLocationName: dest?.name ?? null,
        destinationIsMain: dest?.is_main ?? null,
        createdByName: userFullName ?? null,
        signatureUrl: signatureDataUrl || signature.url,
        lines: items.map((item) => {
          const row = rows.find((r) => r.variant_id === item.client_variant_id);
          return {
            brandName: row?.brandName ?? null,
            variantName: row?.variantName ?? null,
            returnQuantity: item.quantity,
          };
        }),
      }).catch(() => {
        toast({
          variant: 'destructive',
          title: 'PDF export failed',
          description: 'Return was saved, but the PDF window could not be opened.',
        });
      });

      toast({
        title: 'Return submitted',
        description: `${result.request_number} sent to ${destName} for inspection. PDF opened for print/save.`,
      });
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ['sa-stock-returns'] });
      await queryClient.invalidateQueries({ queryKey: ['sa-client-stock-returns'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      await queryClient.invalidateQueries({ queryKey: ['sa-return-available-inventory'] });
      await onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create return';
      setFormError(message);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Return stock to warehouse</DialogTitle>
            <DialogDescription>
              Choose main or a sub-warehouse, select products, attach a proof photo, and sign.
              Stock is held when submitted; the warehouse inspects good vs damaged and picks the
              batch lot.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 flex-1 overflow-y-auto min-h-0 pr-1">
            <div className="space-y-1.5">
              <Label>Return to location</Label>
              <Select
                value={destinationLocationId}
                onValueChange={setDestinationLocationId}
                disabled={loadingLocations || locations.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingLocations ? 'Loading locations…' : 'Select warehouse location'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                      {loc.is_main ? ' (Main)' : ' (Sub)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Filter brand or product…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="flex-1"
              />
              <Badge variant="secondary">
                {summary.lineCount} lines · {summary.totalQty} units
              </Badge>
            </div>

            <div className="border rounded-md p-2 min-h-[200px] max-h-[280px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading inventory…
                </div>
              ) : byBrand.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No available stock to return.
                </div>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {byBrand.map(([brand, brandRows]) => (
                    <AccordionItem key={brand} value={brand}>
                      <AccordionTrigger className="text-sm font-medium px-2">
                        {brand}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({brandRows.length})
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2 px-2 pb-3">
                        {brandRows.map((row) => (
                          <div
                            key={row.variant_id}
                            className="flex items-center gap-3 rounded border px-3 py-2"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{row.variantName}</div>
                              <div className="text-xs text-muted-foreground">
                                {normalizeTypeLabel(row.variantType)} · available {row.available}
                              </div>
                            </div>
                            <Input
                              type="number"
                              min={0}
                              max={row.available}
                              className="w-24"
                              value={quantities[row.variant_id] ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                  setQuantities((prev) => {
                                    const next = { ...prev };
                                    delete next[row.variant_id];
                                    return next;
                                  });
                                  return;
                                }
                                const n = Math.max(
                                  0,
                                  Math.min(row.available, Math.floor(Number(raw) || 0))
                                );
                                setQuantities((prev) => ({ ...prev, [row.variant_id]: n }));
                              }}
                            />
                          </div>
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>

            <div className="space-y-2">
              <Label>Return proof photo (required)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => void handleProofFileChange(e.target.files?.[0] ?? null)}
              />
              {!proofImageDataUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4 mr-2" />
                  Upload proof photo
                </Button>
              ) : (
                <div className="rounded-md border p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-muted-foreground truncate">
                      {proofImageName || 'Proof image'}
                    </p>
                    <Button type="button" variant="ghost" size="sm" onClick={clearProofImage}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                  <img
                    src={proofImageDataUrl}
                    alt="Return proof"
                    className="max-h-48 mx-auto rounded-md object-contain"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Signature (required)</Label>
              {!signatureDataUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setSignatureOpen(true)}
                >
                  <PenTool className="h-4 w-4 mr-2" />
                  Add signature
                </Button>
              ) : (
                <div className="rounded-md border p-3 space-y-3 bg-muted/20">
                  <img
                    src={signatureDataUrl}
                    alt="Return signature"
                    className="max-h-28 mx-auto bg-white rounded-md"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSignatureOpen(true)}
                    >
                      Re-sign
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSignatureDataUrl('')}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sa-return-notes">Notes (optional)</Label>
              <Textarea
                id="sa-return-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason for return…"
                rows={2}
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={
                submitting ||
                summary.lineCount === 0 ||
                !destinationLocationId ||
                !proofImageDataUrl ||
                !signatureDataUrl
              }
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Submit return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sign to confirm return</DialogTitle>
          </DialogHeader>
          <SignatureCanvas
            title="Return signature"
            description="Draw your signature to confirm this return to warehouse"
            onSave={(dataUrl) => {
              setSignatureDataUrl(dataUrl);
              setSignatureOpen(false);
              setFormError(null);
            }}
            onCancel={() => setSignatureOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
