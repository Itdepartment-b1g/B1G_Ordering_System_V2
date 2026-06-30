import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ClipboardCheck, Loader2, Plus, RefreshCw } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { getDateRangeFromPreset, isDateInRange } from '@/lib/dateRangePresets';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import {
  DateRangeFilterPopover,
  type DateRangeFilterValue,
} from '@/features/shared/components/DateRangeFilterPopover';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { useWarehouseLocationMembership } from '@/features/inventory/useWarehouseLocationMembership';
import { useWarehouseLocations } from '@/features/inventory/batch-view/hooks/useWarehouseLocations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { PhysicalCountLineTable } from './physical-count/components/PhysicalCountLineTable';
import {
  PhysicalCountHistoryDetailDialog,
  PhysicalCountReviewDialog,
} from './physical-count/components/PhysicalCountReviewDialog';
import { PhysicalCountSignatureDialog } from './physical-count/components/PhysicalCountSignatureDialog';
import { usePhysicalCountBatches } from './physical-count/hooks/usePhysicalCountBatches';
import { usePhysicalCountBatchCatalog } from './physical-count/hooks/usePhysicalCountBatchCatalog';
import { usePhysicalCountBatchLots } from './physical-count/hooks/usePhysicalCountBatchLots';
import {
  usePhysicalCountHistory,
  usePhysicalCountSessionDetail,
} from './physical-count/hooks/usePhysicalCountHistory';
import type { PhysicalCountLine, PhysicalCountLotOption, PhysicalCountSubmitLine } from './physical-count/types';
import { uploadPhysicalCountSignature } from './physical-count/utils/uploadPhysicalCountSignature';

export default function PhysicalCountPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isWarehouse = user?.role === 'warehouse';
  const { membership } = useWarehouseLocationMembership({ userId: user?.id, isWarehouse });
  const isMainWarehouseUser = membership.isMain;

  const [locationId, setLocationId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PhysicalCountLine[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [historyDateRangeFilter, setHistoryDateRangeFilter] = useState<DateRangeFilterValue>({
    preset: 'all',
  });
  const [historyPage, setHistoryPage] = useState(0);
  const [historyPageSize, setHistoryPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  const { data: locations = [] } = useWarehouseLocations(
    user?.company_id,
    isWarehouse && isMainWarehouseUser
  );

  useEffect(() => {
    if (!isMainWarehouseUser && membership.locationId) {
      setLocationId(membership.locationId);
      return;
    }
    if (isMainWarehouseUser && locations.length > 0 && !locationId) {
      const mainLoc = locations.find((l) => l.is_main) ?? locations[0];
      setLocationId(mainLoc.id);
    }
  }, [isMainWarehouseUser, membership.locationId, locations, locationId]);

  useEffect(() => {
    setBatchId('');
    setLines([]);
    setBrandId('');
    setVariantId('');
  }, [locationId]);

  useEffect(() => {
    setLines([]);
    setBrandId('');
    setVariantId('');
  }, [batchId]);

  const activeLocationId = isMainWarehouseUser ? locationId : membership.locationId ?? '';

  const locationName = useMemo(() => {
    if (!activeLocationId) return 'Selected location';
    const loc = locations.find((l) => l.id === activeLocationId);
    if (loc) return loc.is_main ? `${loc.name} (main)` : loc.name;
    if (!isMainWarehouseUser) return 'Your sub-warehouse';
    return 'Selected location';
  }, [activeLocationId, locations, isMainWarehouseUser]);

  const { data: batches = [], isLoading: batchesLoading } = usePhysicalCountBatches({
    companyId: user?.company_id,
    locationId: activeLocationId,
    enabled: isWarehouse && !!activeLocationId,
  });

  const selectedBatch = useMemo(
    () => batches.find((b) => b.batchId === batchId) ?? null,
    [batches, batchId]
  );

  const {
    brands,
    getVariantsForBrand,
    isLoading: catalogLoading,
  } = usePhysicalCountBatchCatalog({
    companyId: user?.company_id,
    locationId: activeLocationId,
    batchId,
    enabled: isWarehouse && !!batchId && !!activeLocationId,
  });

  const variants = useMemo(
    () => (brandId ? getVariantsForBrand(brandId) : []),
    [brandId, getVariantsForBrand]
  );

  const { data: variantLots = [] } = useQuery({
    queryKey: ['physical-count-variant-lots', batchId, variantId, activeLocationId],
    enabled: !!batchId && !!variantId && !!activeLocationId,
    queryFn: async (): Promise<PhysicalCountLotOption[]> => {
      const { data, error } = await supabase
        .from('inventory_batch_lots')
        .select('id, quantity_remaining, expiration_date')
        .eq('batch_id', batchId)
        .eq('variant_id', variantId)
        .eq('warehouse_location_id', activeLocationId)
        .order('expiration_date', { ascending: true, nullsFirst: false });

      if (error) throw error;

      return (data ?? []).map((row) => ({
        lotId: row.id as string,
        quantityRemaining: Number(row.quantity_remaining) || 0,
        expirationDate: (row.expiration_date as string | null) ?? null,
      }));
    },
  });

  const { refetch: refetchBatchLots, isFetching: loadingAllLots } = usePhysicalCountBatchLots({
    companyId: user?.company_id,
    locationId: activeLocationId,
    batchId,
    enabled: false,
  });

  const { data: history = [], isLoading: historyLoading } = usePhysicalCountHistory({
    companyId: user?.company_id,
    locationId: membership.locationId,
    isMainWarehouseUser,
    enabled: isWarehouse && !!user?.company_id,
  });

  const { data: historyDetail } = usePhysicalCountSessionDetail(
    selectedHistoryId,
    historyDetailOpen && !!selectedHistoryId
  );

  const historyDateRange = useMemo(
    () =>
      getDateRangeFromPreset(
        historyDateRangeFilter.preset,
        historyDateRangeFilter.customStart,
        historyDateRangeFilter.customEnd
      ),
    [historyDateRangeFilter]
  );

  const filteredHistory = useMemo(() => {
    const { start, end } = historyDateRange;
    return history.filter((row) => isDateInRange(new Date(row.counted_at), start, end));
  }, [history, historyDateRange]);

  useEffect(() => {
    setHistoryPage(0);
  }, [historyDateRangeFilter, historyPageSize]);

  const {
    pageCount: historyPageCount,
    safePage: historySafePage,
    pagedItems: paginatedHistory,
  } = getListPaginationSlice(filteredHistory, historyPage, historyPageSize);

  const handleAddLine = () => {
    if (!brandId || !variantId || !batchId || !activeLocationId) {
      toast({
        title: 'Select brand and variant',
        description: 'Choose a brand and variant before adding a line.',
        variant: 'destructive',
      });
      return;
    }

    const brand = brands.find((b) => b.id === brandId);
    const variant = variants.find((v) => v.id === variantId);
    if (!brand || !variant) return;

    if (variantLots.length === 0) {
      toast({
        title: 'No lots in this batch',
        description: 'No lots for this variant in the selected batch.',
        variant: 'destructive',
      });
      return;
    }

    const existingLotIds = new Set(lines.map((l) => l.lotId).filter(Boolean) as string[]);
    const lotsToAdd = variantLots.filter((lot) => !existingLotIds.has(lot.lotId));

    if (lotsToAdd.length === 0) {
      toast({
        title: 'Already added',
        description: 'All lots for this variant are already in the count list.',
        variant: 'destructive',
      });
      return;
    }

    setLines((prev) => [
      ...prev,
      ...lotsToAdd.map((lot) => ({
        id: crypto.randomUUID(),
        lotId: lot.lotId,
        brandId,
        brandName: brand.name,
        variantId,
        variantName: variant.name,
        expirationDate: lot.expirationDate,
        systemQty: lot.quantityRemaining,
        physicalQty: '',
      })),
    ]);
    setVariantId('');
  };

  const handleAddAllVariants = async () => {
    if (!batchId || !activeLocationId) return;
    const { data: fetched = [], error } = await refetchBatchLots();
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (fetched.length === 0) {
      toast({
        title: 'No lots in batch',
        description: 'This batch has no lots at the selected location.',
        variant: 'destructive',
      });
      return;
    }

    setLines((prev) => {
      const existingLotIds = new Set(prev.map((l) => l.lotId).filter(Boolean) as string[]);
      const merged = [...prev];
      for (const lot of fetched) {
        if (lot.lotId && !existingLotIds.has(lot.lotId)) {
          merged.push(lot);
          existingLotIds.add(lot.lotId);
        }
      }
      return merged;
    });
  };

  const parsedSubmitLines = useMemo((): PhysicalCountSubmitLine[] | null => {
    const result: PhysicalCountSubmitLine[] = [];
    for (const line of lines) {
      const physical = Number(line.physicalQty);
      if (line.physicalQty.trim() === '' || !Number.isFinite(physical) || physical < 0) {
        return null;
      }
      result.push({
        variant_id: line.variantId,
        lot_id: line.lotId,
        physical_qty: physical,
        system_qty_snapshot: line.systemQty,
        brand_name: line.brandName,
        variant_name: line.variantName,
        expiration_date: line.expirationDate,
      });
    }
    return result;
  }, [lines]);

  const handleOpenReview = () => {
    if (!batchId || !activeLocationId) {
      toast({
        title: 'Select batch',
        description: 'Choose a batch and location before submitting.',
        variant: 'destructive',
      });
      return;
    }
    if (!parsedSubmitLines || parsedSubmitLines.length === 0) {
      toast({
        title: 'Enter physical quantities',
        description: 'Add at least one line with a valid physical quantity.',
        variant: 'destructive',
      });
      return;
    }
    setReviewOpen(true);
  };

  const handleSubmitWithSignature = async (signatureDataUrl: string) => {
    if (!user?.company_id || !parsedSubmitLines || !selectedBatch) return;

    setSubmitting(true);
    try {
      const { url, path } = await uploadPhysicalCountSignature({
        signatureDataUrl,
        companyId: user.company_id,
        batchNumber: selectedBatch.batchNumber,
      });

      const { data, error } = await supabase.rpc('submit_physical_count', {
        p_warehouse_location_id: activeLocationId,
        p_batch_id: batchId,
        p_lines: parsedSubmitLines,
        p_signature_url: url,
        p_signature_path: path,
        p_notes: notes.trim() || null,
        p_performed_by: user.id,
      });

      if (error) throw error;
      const result = data as {
        success?: boolean;
        error?: string;
        session_id?: string;
      };
      if (!result?.success) {
        throw new Error(result?.error ?? 'Physical count submission failed');
      }

      toast({
        title: 'Physical count submitted',
        description: 'Count recorded. System stock was not changed.',
      });

      setReviewOpen(false);
      setSignatureOpen(false);
      setLines([]);
      setNotes('');
      setBatchId('');
      setBrandId('');
      setVariantId('');

      await queryClient.invalidateQueries({ queryKey: ['physical-count-history'] });
      await queryClient.invalidateQueries({ queryKey: ['physical-count-batches'] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submission failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openHistoryDetail = (sessionId: string) => {
    setSelectedHistoryId(sessionId);
    setHistoryDetailOpen(true);
  };

  if (!isWarehouse) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Warehouse access only.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7" />
          Physical Count
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Count on-hand stock by batch and lot. Select the batch that contains the lots you are
          counting. Compare physical qty to system qty and sign to confirm. Variances are recorded
          for audit; system stock is not changed automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New count</CardTitle>
          <CardDescription>
            Select the batch that contains the lots you are counting at {locationName}, add
            variants, enter physical quantities, then submit with your signature.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {isMainWarehouseUser ? (
              <div className="space-y-2">
                <Label>Warehouse location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.is_main ? `${loc.name} (main)` : loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Location</Label>
                <Input value={locationName} readOnly disabled className="bg-muted" />
              </div>
            )}

            <div className="space-y-2">
              <Label>Batch</Label>
              <Select
                value={batchId}
                onValueChange={setBatchId}
                disabled={!activeLocationId || batchesLoading}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={batchesLoading ? 'Loading batches…' : 'Select batch'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((batch) => (
                    <SelectItem key={batch.batchId} value={batch.batchId}>
                      {batch.batchNumber} · {batch.lotCount} lot
                      {batch.lotCount === 1 ? '' : 's'} · {batch.totalUnits} units
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedBatch && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="secondary">{selectedBatch.batchNumber}</Badge>
                <Badge variant="outline">
                  Received {format(new Date(selectedBatch.receivedAt), 'MMM d, yyyy')}
                </Badge>
                <Badge variant="outline">
                  {selectedBatch.lotCount} lot{selectedBatch.lotCount === 1 ? '' : 's'}
                </Badge>
                <Badge variant="outline">{selectedBatch.skuCount} SKU(s)</Badge>
                <Badge variant="outline">{selectedBatch.totalUnits} system units</Badge>
              </div>
              {selectedBatch.lotCount > selectedBatch.skuCount && (
                <p className="text-sm text-muted-foreground">
                  This batch has multiple expiry lots for some variants. Adding a variant will
                  include all of its lots in this batch.
                </p>
              )}
            </div>
          )}

          {batchId && (
            <div className="space-y-4 rounded-lg border p-4">
              {catalogLoading && (
                <p className="text-sm text-muted-foreground">Loading variants in batch…</p>
              )}

              {!catalogLoading && brands.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No variants in this batch at this location.
                </p>
              )}

              {!catalogLoading && brands.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <Label>Brand</Label>
                    <Select
                      value={brandId}
                      onValueChange={(v) => {
                        setBrandId(v);
                        setVariantId('');
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {brandId && variants.length > 0 && (
                    <div className="flex-1 space-y-2">
                      <Label>Variant</Label>
                      <Select value={variantId} onValueChange={setVariantId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select variant" />
                        </SelectTrigger>
                        <SelectContent>
                          {variants.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddLine}
                    disabled={!variantId}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add line
                  </Button>
                </div>
              )}

              {(selectedBatch?.lotCount ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddAllVariants}
                    disabled={loadingAllLots}
                  >
                    {loadingAllLots ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Add all lots in batch
                  </Button>
                </div>
              )}
            </div>
          )}

          <PhysicalCountLineTable
            lines={lines}
            onPhysicalQtyChange={(lineId, value) =>
              setLines((prev) =>
                prev.map((l) => (l.id === lineId ? { ...l, physicalQty: value } : l))
              )
            }
            onRemoveLine={(lineId) => setLines((prev) => prev.filter((l) => l.id !== lineId))}
          />

          <div className="space-y-2">
            <Label htmlFor="physical-count-notes">Notes (optional)</Label>
            <Textarea
              id="physical-count-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this count session…"
              rows={2}
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleOpenReview}
              disabled={!batchId || lines.length === 0 || submitting}
            >
              Review &amp; submit
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Count history</CardTitle>
              <CardDescription>Previously submitted physical counts with signatures.</CardDescription>
            </div>
            <DateRangeFilterPopover
              value={historyDateRangeFilter}
              onChange={setHistoryDateRangeFilter}
              triggerClassName="w-full sm:w-[220px] justify-between h-10 shrink-0"
              align="end"
            />
          </div>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading history…
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No physical counts submitted yet.
            </p>
          ) : filteredHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No physical counts match the selected date range.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Counted by</TableHead>
                      <TableHead className="text-right">Lines</TableHead>
                      <TableHead className="text-right">Net variance</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedHistory.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(row.counted_at), 'MMM d, yyyy h:mm a')}
                        </TableCell>
                        <TableCell>{row.batch?.batch_number ?? '—'}</TableCell>
                        <TableCell>{row.warehouse_location?.name ?? '—'}</TableCell>
                        <TableCell>{row.performed_by_user?.full_name ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.line_count}</TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${
                            row.total_variance > 0
                              ? 'text-green-600'
                              : row.total_variance < 0
                                ? 'text-destructive'
                                : ''
                          }`}
                        >
                          {row.total_variance > 0 ? '+' : ''}
                          {row.total_variance}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openHistoryDetail(row.id)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ListPagination
                pageSize={historyPageSize}
                safePage={historySafePage}
                pageCount={historyPageCount}
                onPageSizeChange={setHistoryPageSize}
                onPrevious={() => setHistoryPage((p) => Math.max(0, p - 1))}
                onNext={() => setHistoryPage((p) => Math.min(historyPageCount - 1, p + 1))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <PhysicalCountReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        batchNumber={selectedBatch?.batchNumber ?? ''}
        locationName={locationName}
        lines={lines}
        onConfirm={() => {
          setReviewOpen(false);
          setSignatureOpen(true);
        }}
      />

      <PhysicalCountSignatureDialog
        open={signatureOpen}
        onOpenChange={setSignatureOpen}
        submitting={submitting}
        onSubmitWithSignature={handleSubmitWithSignature}
      />

      <PhysicalCountHistoryDetailDialog
        open={historyDetailOpen}
        onOpenChange={setHistoryDetailOpen}
        session={historyDetail ?? null}
      />
    </div>
  );
}
