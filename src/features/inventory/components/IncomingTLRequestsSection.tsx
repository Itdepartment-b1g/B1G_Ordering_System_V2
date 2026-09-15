import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Package,
  Printer,
  ThumbsDown,
  Truck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import { SortableTableHead } from '@/features/shared/components/SortableTableHead';
import {
  getTableSortDisplayDirection,
  resolveTableSortDirection,
  type TableSortCycleState,
} from '@/features/shared/utils/tableSortCycle';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SignatureCanvas } from '@/components/ui/signature-canvas';
import {
  MultiProofPhotoField,
  revokePackageProofPreviews,
  type PackageProofPhotoItem,
} from '@/features/shared/components/MultiProofPhotoField';
import { uploadPackageProofPhotos } from '@/features/orders/utils/uploadPackageProofPhotos';
import type { TLDispatchShortfallReason, TLRequestWithDetails } from '@/types/tlStockRequests.types';
import {
  TL_DISPATCH_SHORTFALL_LABELS,
  TL_DISPATCH_SHORTFALL_OPTIONS,
  TL_REQUEST_SELECT,
  groupTlRequests,
  invalidateTlTransferQueries,
  mapTlTransferRows,
  tlRemainingToDispatch,
  type TLRequestGroup,
} from '../tl-stock-transfer/tlStockTransferShared';
import { exportTlTdrPdf, printTlStockTransferRequest, tlTdrPdfFromDispatch } from '../tl-stock-transfer/exportTlTransferPdfs';
import {
  DEFAULT_TL_TRANSFER_SORT_DIRECTION,
  DEFAULT_TL_TRANSFER_SORT_KEY,
  filterTlTransferGroups,
  sortTlTransferGroups,
  type TlTransferDateRange,
  type TlTransferListSortKey,
} from '../tl-stock-transfer/tlStockTransferListHelpers';

type DispatchLine = TLRequestWithDetails & { available: number };

export type IncomingTlListControls = {
  searchQuery: string;
  dateRange: TlTransferDateRange;
  page: number;
  pageSize: PageSize;
  sortState: TableSortCycleState<TlTransferListSortKey>;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  onSort: (key: TlTransferListSortKey) => void;
};

type Props = {
  embedded?: boolean;
  listControls?: IncomingTlListControls;
};

export default function IncomingTLRequestsSection({ embedded = false, listControls }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<TLRequestGroup | null>(null);
  const [dispatchLines, setDispatchLines] = useState<DispatchLine[]>([]);
  const [qtyById, setQtyById] = useState<Record<string, number>>({});
  const [reasonById, setReasonById] = useState<Record<string, TLDispatchShortfallReason | ''>>({});
  const [sourceNotes, setSourceNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [packagePhotos, setPackagePhotos] = useState<PackageProofPhotoItem[]>([]);
  const [packagePhotoError, setPackagePhotoError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const { data: incomingRequests = [], isLoading } = useQuery({
    queryKey: ['incoming-tl-requests', user?.id],
    enabled: !!user?.id && user?.role === 'team_leader',
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tl_stock_requests')
        .select(TL_REQUEST_SELECT)
        .eq('source_leader_id', user!.id)
        .in('status', ['pending_source_tl', 'admin_approved'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return mapTlTransferRows(data || []).filter(
        (row) => row.status === 'pending_source_tl' || row.status === 'admin_approved'
      );
    },
  });

  const incomingGroups = useMemo(() => groupTlRequests(incomingRequests), [incomingRequests]);

  const filteredIncomingGroups = useMemo(() => {
    if (!listControls) return incomingGroups;
    return filterTlTransferGroups(
      incomingGroups,
      listControls.searchQuery,
      listControls.dateRange
    );
  }, [incomingGroups, listControls]);

  const sortedIncomingGroups = useMemo(() => {
    if (!listControls) return filteredIncomingGroups;
    const { key, direction } = resolveTableSortDirection(
      listControls.sortState,
      DEFAULT_TL_TRANSFER_SORT_KEY,
      DEFAULT_TL_TRANSFER_SORT_DIRECTION
    );
    return sortTlTransferGroups(filteredIncomingGroups, key, direction);
  }, [filteredIncomingGroups, listControls]);

  const incomingPagination = useMemo(() => {
    if (!listControls) {
      return {
        pageCount: 1,
        safePage: 0,
        pagedItems: sortedIncomingGroups,
      };
    }
    return getListPaginationSlice(
      sortedIncomingGroups,
      listControls.page,
      listControls.pageSize
    );
  }, [listControls, sortedIncomingGroups]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('incoming_tl_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tl_stock_requests',
          filter: `source_leader_id=eq.${user.id}`,
        },
        () => {
          invalidateTlTransferQueries(queryClient);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const resetDispatchForm = () => {
    setQtyById({});
    setReasonById({});
    setSourceNotes('');
    setSignatureDataUrl('');
    setPackagePhotoError(null);
    setPackagePhotos((prev) => {
      revokePackageProofPreviews(prev);
      return [];
    });
  };

  const openDispatch = async (group: TLRequestGroup) => {
    const variantIds = [...new Set(group.items.map((item) => item.variant_id).filter(Boolean))];
    let stockRows: { variant_id: string; stock: number }[] = [];
    if (user?.id && variantIds.length > 0) {
      const { data } = await supabase
        .from('agent_inventory')
        .select('variant_id, stock')
        .eq('agent_id', user.id)
        .in('variant_id', variantIds);
      stockRows = (data || []) as { variant_id: string; stock: number }[];
    }
    const stockByVariant = new Map(stockRows.map((row) => [row.variant_id, Number(row.stock || 0)]));
    const lines: DispatchLine[] = group.items.map((item) => ({
      ...item,
      available: stockByVariant.get(item.variant_id) || 0,
    }));
    setSelectedGroup(group);
    setDispatchLines(lines);
    setQtyById(
      Object.fromEntries(
        lines.map((line) => {
          const remaining = tlRemainingToDispatch(line);
          return [line.id, Math.max(0, Math.min(line.available, remaining))];
        })
      )
    );
    setReasonById({});
    setSourceNotes('');
    setSignatureDataUrl('');
    setPackagePhotos((prev) => {
      revokePackageProofPreviews(prev);
      return [];
    });
    setPackagePhotoError(null);
    setDispatchOpen(true);
  };

  const linesToDispatch = useMemo(
    () =>
      dispatchLines
        .map((line) => {
          const remaining = tlRemainingToDispatch(line);
          const qty = Number(qtyById[line.id] || 0);
          return { line, remaining, qty, short: qty > 0 && qty < remaining };
        })
        .filter((row) => row.qty > 0),
    [dispatchLines, qtyById]
  );

  const totalDispatchQty = linesToDispatch.reduce((sum, row) => sum + row.qty, 0);
  const missingReasons = linesToDispatch.filter((row) => row.short && !reasonById[row.line.id]);

  const validateDispatch = () => {
    if (!selectedGroup) return false;
    if (packagePhotos.length < 1) {
      setPackagePhotoError('At least one package photo is required.');
      toast({
        title: 'Package photo required',
        description: 'Upload a photo of the stock you are dispatching.',
        variant: 'destructive',
      });
      return false;
    }
    if (!signatureDataUrl) {
      toast({
        title: 'Signature required',
        description: 'Sign to confirm dispatch. Photos alone are not enough.',
        variant: 'destructive',
      });
      return false;
    }
    if (linesToDispatch.length === 0) {
      toast({
        title: 'No quantities',
        description: 'Enter a dispatch quantity for at least one item.',
        variant: 'destructive',
      });
      return false;
    }
    for (const row of linesToDispatch) {
      if (row.qty > row.remaining || row.qty > row.line.available) {
        toast({
          title: 'Invalid quantity',
          description: `${row.line.variant.brand_name} ${row.line.variant.name} cannot exceed remaining qty or your stock.`,
          variant: 'destructive',
        });
        return false;
      }
      if (row.short && !reasonById[row.line.id]) {
        toast({
          title: 'Reason required',
          description: `Say why you are sending less than remaining for ${row.line.variant.name}.`,
          variant: 'destructive',
        });
        return false;
      }
    }
    return true;
  };

  const openConfirmDispatch = () => {
    if (!validateDispatch()) return;
    setConfirmOpen(true);
  };

  const handleDispatch = async () => {
    if (!selectedGroup || !validateDispatch()) return;

    setProcessing(true);
    try {
      const companyId = selectedGroup.items[0]?.company_id || user?.company_id;
      const storageBase = `${companyId}/tl-transfer/${selectedGroup.request_number}`;
      const packageUpload = await uploadPackageProofPhotos({
        photos: packagePhotos,
        bucket: 'tl-stock-request-signatures',
        pathPrefix: storageBase,
        fileStem: `dispatch_${selectedGroup.request_number}`,
      });

      const base64Data = signatureDataUrl.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/png' });
      const fileName = `${storageBase}/dispatch_signature_${Date.now()}.png`;

      const { error: uploadError } = await supabase.storage
        .from('tl-stock-request-signatures')
        .upload(fileName, blob, { contentType: 'image/png', upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData, error: urlError } = await supabase.storage
        .from('tl-stock-request-signatures')
        .createSignedUrl(fileName, 31536000);
      if (urlError || !urlData?.signedUrl) throw new Error('Failed to generate signed URL');

      let tdrNumber: string | null = null;
      let reuseRedispatchTdr: string | null = null;
      for (const row of linesToDispatch) {
        const isRedispatch = row.line.received_quantity != null;
        const { data: result, error: rpcError } = await supabase.rpc('source_tl_dispatch_stock', {
          p_request_id: row.line.id,
          p_dispatched_quantity: row.qty,
          p_signature_url: urlData.signedUrl,
          p_signature_path: fileName,
          p_shortfall_reason: row.short ? reasonById[row.line.id] : null,
          p_notes: sourceNotes || null,
          p_proof_urls: packageUpload.urls,
          p_reuse_tdr: isRedispatch ? reuseRedispatchTdr : null,
        });
        if (rpcError) throw rpcError;
        if (!result?.success) throw new Error(result?.error || 'Failed to dispatch');
        tdrNumber = result.tdr_number ?? tdrNumber;
        if (isRedispatch && result.tdr_number) reuseRedispatchTdr = result.tdr_number;
      }

      const skipped = dispatchLines.length - linesToDispatch.length;
      const isRedispatch = linesToDispatch.some((row) => row.line.received_quantity != null);
      toast({
        title: 'Stock dispatched',
        description:
          `${totalDispatchQty} units across ${linesToDispatch.length} item(s) left your inventory.` +
          (tdrNumber ? ` TDR ${tdrNumber}.` : '') +
          (skipped > 0 ? ` ${skipped} item(s) with 0 qty were left pending.` : ''),
      });
      if (tdrNumber && selectedGroup) {
        try {
          await exportTlTdrPdf(
            tlTdrPdfFromDispatch({
              tdrNumber,
              kind: isRedispatch ? 'redeliver' : 'dispatch',
              requestNumber: selectedGroup.request_number,
              requesterName: selectedGroup.requester.full_name,
              sourceName: selectedGroup.source.full_name,
              lines: linesToDispatch.map((row) => ({
                label: `${row.line.variant.brand_name} · ${row.line.variant.name}`,
                quantity: row.qty,
              })),
            })
          );
        } catch (printError: any) {
          toast({
            title: 'Dispatched, print failed',
            description: printError?.message || 'Open Transfer details to print this TDR.',
            variant: 'destructive',
          });
        }
      }
      resetDispatchForm();
      setConfirmOpen(false);
      setDispatchOpen(false);
      setSelectedGroup(null);
      setDispatchLines([]);
      invalidateTlTransferQueries(queryClient);
    } catch (error: any) {
      toast({
        title: 'Could not dispatch',
        description: error.message || 'Failed to dispatch stock',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedGroup || !rejectionReason.trim()) {
      toast({
        title: 'Rejection reason required',
        variant: 'destructive',
      });
      return;
    }
    setProcessing(true);
    try {
      for (const item of selectedGroup.items) {
        const { data: result, error } = await supabase.rpc('source_tl_reject_request', {
          p_request_id: item.id,
          p_reason: rejectionReason,
        });
        if (error) throw error;
        if (!result?.success) throw new Error(result?.error || 'Failed to reject request');
      }
      toast({ title: 'Request rejected' });
      setRejectOpen(false);
      setSelectedGroup(null);
      invalidateTlTransferQueries(queryClient);
    } catch (error: any) {
      toast({
        title: 'Could not reject',
        description: error.message || 'Failed to reject request',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (user?.role !== 'team_leader') return null;

  const listBody = isLoading ? (
    <div className="flex items-center justify-center py-8 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />
      Loading...
    </div>
  ) : incomingGroups.length === 0 ? (
    <div className="text-center py-8 text-muted-foreground">
      <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
      <p>No transfers waiting to dispatch</p>
    </div>
  ) : sortedIncomingGroups.length === 0 ? (
    <div className="text-center py-8 text-muted-foreground">
      <p>No incoming transfers match this search or date range.</p>
    </div>
  ) : (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {listControls ? (
                <>
                  <SortableTableHead
                    label="Transfer #"
                    sortKey="request_number"
                    sortDirection={getTableSortDisplayDirection(listControls.sortState, 'request_number')}
                    onSort={listControls.onSort}
                  />
                  <SortableTableHead
                    label="Requester"
                    sortKey="counterpart"
                    sortDirection={getTableSortDisplayDirection(listControls.sortState, 'counterpart')}
                    onSort={listControls.onSort}
                  />
                  <SortableTableHead
                    label="Items"
                    sortKey="item"
                    sortDirection={getTableSortDisplayDirection(listControls.sortState, 'item')}
                    onSort={listControls.onSort}
                  />
                  <SortableTableHead
                    label="To dispatch"
                    sortKey="to_dispatch"
                    sortDirection={getTableSortDisplayDirection(listControls.sortState, 'to_dispatch')}
                    onSort={listControls.onSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Date"
                    sortKey="created_at"
                    sortDirection={getTableSortDisplayDirection(listControls.sortState, 'created_at')}
                    onSort={listControls.onSort}
                  />
                </>
              ) : (
                <>
                  <TableHead>Transfer #</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">To dispatch</TableHead>
                  <TableHead>Date</TableHead>
                </>
              )}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {incomingPagination.pagedItems.map((group) => {
              const remainingTotal = group.items.reduce(
                (sum, item) => sum + tlRemainingToDispatch(item),
                0
              );
              const canReject = group.items.every((item) => item.received_quantity == null);
              return (
                <TableRow key={group.request_number}>
                  <TableCell className="font-medium">{group.request_number}</TableCell>
                  <TableCell>
                    <p className="font-medium">{group.requester.full_name}</p>
                    {group.requester.region ? (
                      <p className="text-sm text-muted-foreground">{group.requester.region}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">
                      {group.items[0]?.variant.brand_name} · {group.items[0]?.variant.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {group.items.length === 1
                        ? group.items[0]?.variant.type
                        : `${group.items.length} items`}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="secondary" className="text-base font-semibold">
                      {remainingTotal}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(group.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          void printTlStockTransferRequest(group.items).catch((error: any) => {
                            toast({
                              title: 'Could not print transfer',
                              description: error?.message || 'Failed to open the print view.',
                              variant: 'destructive',
                            });
                          });
                        }}
                      >
                        <Printer className="h-4 w-4 mr-1" />
                        Print
                      </Button>
                      <Button size="sm" onClick={() => openDispatch(group)}>
                        <Truck className="h-4 w-4 mr-1" />
                        Dispatch
                      </Button>
                      {canReject ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setSelectedGroup(group);
                            setRejectionReason('');
                            setRejectOpen(true);
                          }}
                        >
                          <ThumbsDown className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {listControls && sortedIncomingGroups.length > 0 ? (
        <ListPagination
          pageSize={listControls.pageSize}
          safePage={incomingPagination.safePage}
          pageCount={incomingPagination.pageCount}
          onPageSizeChange={listControls.onPageSizeChange}
          onPrevious={() => listControls.onPageChange(Math.max(0, incomingPagination.safePage - 1))}
          onNext={() =>
            listControls.onPageChange(
              Math.min(incomingPagination.pageCount - 1, incomingPagination.safePage + 1)
            )
          }
        />
      ) : null}
    </div>
  );

  return (
    <>
      {embedded ? (
        listBody
      ) : (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Incoming stock transfers
          </CardTitle>
          <CardDescription>
            Super Admin already approved these. Dispatch from your stock — you can send less than
            remaining if you give a reason. After a Found shortage, the missing units are back in
            your inventory here. Missing arrivals are investigated on{' '}
            <Link
              to="/inventory/tl-transfer-shortages"
              className="text-primary underline-offset-4 hover:underline"
            >
              Transfer shortages
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listBody}
        </CardContent>
      </Card>
      )}

      <Dialog
        open={dispatchOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetDispatchForm();
            setDispatchLines([]);
          }
          setDispatchOpen(open);
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 space-y-1 border-b px-6 py-5 pr-12 text-left">
            <DialogTitle>Dispatch stock</DialogTitle>
            <DialogDescription>
              Set a quantity for each item. What you dispatch is deducted from your inventory
              immediately. Package photos and your signature are required once for this transfer.
            </DialogDescription>
          </DialogHeader>
          {selectedGroup ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted-foreground">Transfer #</p>
                  <p className="font-medium font-mono">{selectedGroup.request_number}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Requester</p>
                  <p className="font-medium">{selectedGroup.requester.full_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Items</p>
                  <p className="font-medium">
                    {dispatchLines.length} · {totalDispatchQty} units to dispatch
                  </p>
                </div>
                {selectedGroup.requester_notes ? (
                  <div className="col-span-2 sm:col-span-3">
                    <p className="text-muted-foreground">Notes</p>
                    <p className="whitespace-pre-wrap font-medium">{selectedGroup.requester_notes}</p>
                  </div>
                ) : null}
              </div>

              <div className="max-h-[40vh] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[200px] bg-muted/40">Item</TableHead>
                      <TableHead className="bg-muted/40 text-right">To dispatch</TableHead>
                      <TableHead className="bg-muted/40 text-right">Your stock</TableHead>
                      <TableHead className="w-28 bg-muted/40">Dispatch qty</TableHead>
                      <TableHead className="min-w-[200px] bg-muted/40">If sending less</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispatchLines.map((line) => {
                      const remaining = tlRemainingToDispatch(line);
                      const qty = Number(qtyById[line.id] || 0);
                      const maxQty = Math.max(0, Math.min(remaining, line.available));
                      const short = qty > 0 && qty < remaining;
                      const enough = line.available >= remaining;
                      return (
                        <TableRow key={line.id}>
                          <TableCell>
                            <p className="font-medium">
                              {line.variant.brand_name} · {line.variant.name}
                            </p>
                            <p className="text-xs text-muted-foreground">{line.variant.type}</p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {remaining}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums font-medium ${
                              enough ? 'text-green-700' : 'text-red-700'
                            }`}
                          >
                            {line.available}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={maxQty}
                              className="h-8"
                              value={qtyById[line.id] ?? ''}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const next = Math.max(
                                  0,
                                  Math.min(maxQty, Math.floor(Number(raw) || 0))
                                );
                                setQtyById((prev) => ({ ...prev, [line.id]: next }));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {short ? (
                              <Select
                                value={reasonById[line.id] || ''}
                                onValueChange={(value) =>
                                  setReasonById((prev) => ({
                                    ...prev,
                                    [line.id]: value as TLDispatchShortfallReason,
                                  }))
                                }
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="Reason" />
                                </SelectTrigger>
                                <SelectContent>
                                  {TL_DISPATCH_SHORTFALL_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : enough ? (
                              <p className="flex items-center gap-1 text-xs text-green-700">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Full qty available
                              </p>
                            ) : (
                              <p className="flex items-center gap-1 text-xs text-amber-700">
                                <AlertCircle className="h-3.5 w-3.5" />
                                Short stock
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  rows={2}
                  value={sourceNotes}
                  onChange={(e) => setSourceNotes(e.target.value)}
                  placeholder="Notes for the requester..."
                />
              </div>

              <MultiProofPhotoField
                label="Package photos"
                value={packagePhotos}
                onChange={(next) => {
                  setPackagePhotoError(null);
                  setPackagePhotos(next);
                }}
                error={packagePhotoError}
                emptyTitle="Upload package photo"
                recommendedHint="Required"
                disabled={processing}
              />

              <div className="space-y-2">
                <Label>Dispatcher e-signature</Label>
                {signatureDataUrl ? (
                  <div className="border rounded-md p-3 bg-muted/30 space-y-2">
                    <img src={signatureDataUrl} alt="Dispatcher signature" className="max-h-20 mx-auto" />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSignatureModal(true)}
                      >
                        Change signature
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-md p-3 bg-muted/30 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      Draw your signature. Photos alone are not enough.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setShowSignatureModal(true)}
                      disabled={totalDispatchQty < 1}
                    >
                      Add signature
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDispatchOpen(false)}
                  disabled={processing}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={openConfirmDispatch}
                  disabled={
                    processing ||
                    !signatureDataUrl ||
                    packagePhotos.length < 1 ||
                    totalDispatchQty < 1 ||
                    missingReasons.length > 0
                  }
                >
                  {`Dispatch ${totalDispatchQty} units · ${linesToDispatch.length} item(s)`}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to dispatch this?</AlertDialogTitle>
            <AlertDialogDescription>
              Stock will leave your inventory immediately and move in transit to{' '}
              {selectedGroup?.requester.full_name || 'the requester'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm">
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-muted-foreground">Transfer</p>
              <p className="font-medium font-mono">{selectedGroup?.request_number}</p>
            </div>
            <div className="max-h-56 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">To dispatch</TableHead>
                    <TableHead className="text-right">Dispatch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linesToDispatch.map((row) => (
                    <TableRow key={row.line.id}>
                      <TableCell>
                        <p className="font-medium">
                          {row.line.variant.brand_name} · {row.line.variant.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {row.short && reasonById[row.line.id]
                            ? TL_DISPATCH_SHORTFALL_LABELS[reasonById[row.line.id] as TLDispatchShortfallReason]
                            : row.line.variant.type}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.remaining}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{row.qty}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-muted-foreground">
              {linesToDispatch.length} item{linesToDispatch.length === 1 ? '' : 's'} · {totalDispatchQty}{' '}
              units total
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDispatch();
              }}
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Dispatching...
                </>
              ) : (
                'Yes, dispatch stock'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject transfer</AlertDialogTitle>
            <AlertDialogDescription>
              All items on this transfer will be rejected. The requester and admin will be notified.
              Stock is not deducted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Rejection reason</Label>
            <Textarea
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={processing || !rejectionReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sign dispatch</DialogTitle>
            <DialogDescription>Sign to confirm you are releasing this stock.</DialogDescription>
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
