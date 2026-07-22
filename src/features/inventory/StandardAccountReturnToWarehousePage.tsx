import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Eye, FileText, Loader2, MoreHorizontal, RotateCcw, Search, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { StandardAccountReturnToWarehouseDialog } from './components/StandardAccountReturnToWarehouseDialog';
import { getStandardAccountReturnEvidenceSignedUrl } from './utils/uploadStandardAccountReturnEvidence';
import { exportStandardAccountReturnPdfFromSource } from './utils/exportStandardAccountReturnPdf';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

type ReturnStatus =
  | 'pending_receive'
  | 'partially_received'
  | 'fully_received'
  | 'cancelled';

type SaReturnRow = {
  id: string;
  request_number: string;
  status: ReturnStatus;
  notes: string | null;
  created_at: string;
  signature_url: string | null;
  signature_path: string | null;
  proof_image_url: string | null;
  proof_image_path: string | null;
  destination_location: { name: string; is_main: boolean | null } | null;
  created_by_user: { full_name: string } | null;
  items: Array<{
    id: string;
    return_quantity: number;
    inspected_quantity: number;
    variant: { name: string; brand: { name: string } | null } | null;
  }>;
};

const STATUS_LABELS: Record<ReturnStatus, string> = {
  pending_receive: 'Pending inspect',
  partially_received: 'Partially inspected',
  fully_received: 'Fully inspected',
  cancelled: 'Cancelled',
};

const STATUS_VARIANT: Record<
  ReturnStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending_receive: 'secondary',
  partially_received: 'default',
  fully_received: 'outline',
  cancelled: 'destructive',
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function mapRow(raw: Record<string, unknown>): SaReturnRow {
  const createdBy = firstRelation(
    raw.created_by_user as SaReturnRow['created_by_user'] | SaReturnRow['created_by_user'][]
  );
  const destinationLocation = firstRelation(
    raw.destination_location as
      | SaReturnRow['destination_location']
      | SaReturnRow['destination_location'][]
  );
  const items = ((raw.items as unknown[]) ?? []).map((item) => {
    const row = item as Record<string, unknown>;
    const variant = firstRelation(
      row.client_variant as SaReturnRow['items'][0]['variant'] | SaReturnRow['items'][0]['variant'][]
    );
    const brand = variant?.brand
      ? firstRelation(variant.brand as { name: string } | { name: string }[])
      : null;
    return {
      id: row.id as string,
      return_quantity: row.return_quantity as number,
      inspected_quantity: row.inspected_quantity as number,
      variant: variant
        ? { name: variant.name, brand: brand ? { name: brand.name } : null }
        : null,
    };
  });

  return {
    id: raw.id as string,
    request_number: raw.request_number as string,
    status: raw.status as ReturnStatus,
    notes: (raw.notes as string | null) ?? null,
    created_at: raw.created_at as string,
    signature_url: (raw.signature_url as string | null) ?? null,
    signature_path: (raw.signature_path as string | null) ?? null,
    proof_image_url: (raw.proof_image_url as string | null) ?? null,
    proof_image_path: (raw.proof_image_path as string | null) ?? null,
    destination_location: destinationLocation,
    created_by_user: createdBy,
    items,
  };
}

export default function StandardAccountReturnToWarehousePage() {
  const { user } = useAuth();
  const { hasWarehouseHubLink } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailReturn, setDetailReturn] = useState<SaReturnRow | null>(null);
  const [detailProofUrl, setDetailProofUrl] = useState<string | null>(null);
  const [detailSignatureUrl, setDetailSignatureUrl] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SaReturnRow | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  const { data: returns = [], isLoading, error: returnsError } = useQuery({
    queryKey: ['sa-stock-returns', user?.company_id],
    enabled: !!user?.company_id && hasWarehouseHubLink,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('standard_account_stock_return_requests')
        .select(
          `
          id,
          request_number,
          status,
          notes,
          created_at,
          signature_url,
          signature_path,
          proof_image_url,
          proof_image_path,
          destination_location:warehouse_locations!destination_location_id (
            name,
            is_main
          ),
          created_by_user:profiles!created_by ( full_name ),
          items:standard_account_stock_return_request_items (
            id,
            return_quantity,
            inspected_quantity,
            client_variant:variants!client_variant_id (
              name,
              brand:brands ( name )
            )
          )
        `
        )
        .eq('client_company_id', user!.company_id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
    },
  });

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return returns.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (!q) return true;
      return (
        row.request_number.toLowerCase().includes(q) ||
        (row.destination_location?.name ?? '').toLowerCase().includes(q) ||
        row.items.some(
          (i) =>
            i.variant?.name.toLowerCase().includes(q) ||
            i.variant?.brand?.name.toLowerCase().includes(q)
        )
      );
    });
  }, [returns, searchQuery, statusFilter]);

  const openDetail = async (row: SaReturnRow) => {
    setDetailReturn(row);
    setDetailOpen(true);
    setDetailProofUrl(row.proof_image_url);
    setDetailSignatureUrl(row.signature_url);

    const [proof, signature] = await Promise.all([
      getStandardAccountReturnEvidenceSignedUrl(row.proof_image_path),
      getStandardAccountReturnEvidenceSignedUrl(row.signature_path),
    ]);
    if (proof) setDetailProofUrl(proof);
    if (signature) setDetailSignatureUrl(signature);
  };

  const handleExportPdf = async (row: SaReturnRow) => {
    setExportingPdfId(row.id);
    try {
      const { data: companyRow } = user?.company_id
        ? await supabase
            .from('companies')
            .select('company_name')
            .eq('id', user.company_id)
            .maybeSingle()
        : { data: null };

      await exportStandardAccountReturnPdfFromSource({
        ...row,
        client_company: companyRow?.company_name
          ? { company_name: companyRow.company_name }
          : null,
      });
      toast({
        title: 'PDF opened',
        description: `${row.request_number} — use Print / Save PDF.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'PDF export failed',
        description: 'Could not open the return PDF.',
      });
    } finally {
      setExportingPdfId(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('cancel_standard_account_stock_return_request', {
        p_request_id: cancelTarget.id,
        p_reason: null,
        p_cancelled_by: user?.id ?? null,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string; request_number?: string };
      if (!result?.success) throw new Error(result?.error ?? 'Cancel failed');

      toast({
        title: 'Return cancelled',
        description: `${result.request_number ?? 'Return'} cancelled; stock restored to your inventory.`,
      });
      setCancelTarget(null);
      await queryClient.refetchQueries({ queryKey: ['sa-stock-returns'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to cancel return',
      });
    } finally {
      setCancelSubmitting(false);
    }
  };

  if (!hasWarehouseHubLink) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            This company is not linked to a warehouse, so returns to warehouse are unavailable.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <RotateCcw className="h-6 w-6" />
            Return to Warehouse
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Send stock back to your linked warehouse. Numbers look like RT-202607-0001. Warehouse
            inspects good vs damaged and chooses the batch.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <RotateCcw className="h-4 w-4 mr-2" />
          New return
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Returns</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search RT number or product…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending_receive">Pending inspect</SelectItem>
                <SelectItem value="partially_received">Partially inspected</SelectItem>
                <SelectItem value="fully_received">Fully inspected</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {returnsError ? (
            <div className="py-8 text-center text-sm text-destructive">
              Could not load returns:{' '}
              {returnsError instanceof Error ? returnsError.message : 'Unknown error'}
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No returns yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return #</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const totalQty = row.items.reduce((s, i) => s + i.return_quantity, 0);
                  const inspected = row.items.reduce((s, i) => s + i.inspected_quantity, 0);
                  const destLabel = row.destination_location
                    ? `${row.destination_location.name}${
                        row.destination_location.is_main ? ' (Main)' : ' (Sub)'
                      }`
                    : '—';
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.request_number}</TableCell>
                      <TableCell className="text-sm">{destLabel}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[row.status]}>
                          {STATUS_LABELS[row.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.items.length} SKU · {inspected}/{totalQty} inspected
                        <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                          {row.items
                            .slice(0, 3)
                            .map((i) => i.variant?.name ?? '—')
                            .join(', ')}
                          {row.items.length > 3 ? '…' : ''}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(row.created_at), 'MMM d, yyyy HH:mm')}
                        {row.created_by_user?.full_name
                          ? ` · ${row.created_by_user.full_name}`
                          : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => void openDetail(row)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={exportingPdfId === row.id}
                              onClick={() => void handleExportPdf(row)}
                            >
                              {exportingPdfId === row.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <FileText className="mr-2 h-4 w-4" />
                              )}
                              Print PDF
                            </DropdownMenuItem>
                            {row.status === 'pending_receive' && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setCancelTarget(row)}
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Cancel
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <StandardAccountReturnToWarehouseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={user?.company_id ?? null}
        userId={user?.id ?? null}
        userFullName={user?.full_name ?? null}
      />

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setDetailReturn(null);
            setDetailProofUrl(null);
            setDetailSignatureUrl(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-6">
              <DialogTitle>{detailReturn?.request_number ?? 'Return details'}</DialogTitle>
              {detailReturn && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={exportingPdfId === detailReturn.id}
                  onClick={() => void handleExportPdf(detailReturn)}
                >
                  {exportingPdfId === detailReturn.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <FileText className="h-4 w-4 mr-2" />
                  )}
                  Print PDF
                </Button>
              )}
            </div>
          </DialogHeader>
          {detailReturn && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Destination</span>
                  <p className="font-medium">
                    {detailReturn.destination_location
                      ? `${detailReturn.destination_location.name}${
                          detailReturn.destination_location.is_main ? ' (Main)' : ' (Sub)'
                        }`
                      : '—'}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <div className="mt-1">
                    <Badge variant={STATUS_VARIANT[detailReturn.status]}>
                      {STATUS_LABELS[detailReturn.status]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Submitted by</span>
                  <p>{detailReturn.created_by_user?.full_name ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created</span>
                  <p>{format(new Date(detailReturn.created_at), 'PPp')}</p>
                </div>
              </div>

              {detailReturn.notes && (
                <div>
                  <span className="text-muted-foreground">Notes</span>
                  <p>{detailReturn.notes}</p>
                </div>
              )}

              <div>
                <h4 className="font-medium mb-2">Lines</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Returned</TableHead>
                      <TableHead className="text-right">Inspected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailReturn.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.variant?.brand?.name ? `${item.variant.brand.name} · ` : ''}
                          {item.variant?.name ?? '—'}
                        </TableCell>
                        <TableCell className="text-right">{item.return_quantity}</TableCell>
                        <TableCell className="text-right">{item.inspected_quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Return proof</h4>
                  {detailProofUrl ? (
                    <a href={detailProofUrl} target="_blank" rel="noreferrer">
                      <img
                        src={detailProofUrl}
                        alt="Return proof"
                        className="max-h-48 w-full rounded-md border object-contain bg-muted/20"
                      />
                    </a>
                  ) : (
                    <p className="text-muted-foreground text-xs">No proof photo attached.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Signature</h4>
                  {detailSignatureUrl ? (
                    <img
                      src={detailSignatureUrl}
                      alt="Return signature"
                      className="max-h-36 w-full rounded-md border object-contain bg-white"
                    />
                  ) : (
                    <p className="text-muted-foreground text-xs">No signature attached.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelTarget?.request_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Stock will be restored to your main inventory. This only works if the warehouse has
              not started inspection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSubmitting}>Keep return</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={cancelSubmitting}>
              {cancelSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Cancel return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
