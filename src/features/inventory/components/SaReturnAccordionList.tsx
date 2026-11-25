import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  SearchCheck,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { getStandardAccountReturnEvidenceSignedUrl } from '../utils/uploadStandardAccountReturnEvidence';

export type SaReturnListStatus =
  | 'pending_approval'
  | 'pending_receive'
  | 'partially_received'
  | 'fully_received'
  | 'cancelled';

export type SaReturnListItem = {
  id: string;
  warehouse_variant_id: string;
  return_quantity: number;
  inspected_quantity: number;
  /** Usable qty restored to warehouse inventory (qty_good). */
  stock_return_quantity: number;
  /** Damaged/unusable qty recorded for disposal only (qty_damaged). */
  disposal_quantity: number;
  variant: {
    name: string;
    variant_type?: string | null;
    brand: { name: string } | null;
  } | null;
};

/** Create-dialog choice: sellable stock vs disposal stock. */
export type SaReturnKind = 'my_inventory' | 'item_disposal';

export type SaReturnListRow = {
  id: string;
  request_number: string;
  status: SaReturnListStatus;
  notes: string | null;
  created_at: string;
  approved_at?: string | null;
  inspected_at?: string | null;
  /** Selected on create: Stock Return vs For Disposal. */
  return_type?: SaReturnKind | string | null;
  signature_url: string | null;
  signature_path: string | null;
  proof_image_url: string | null;
  proof_image_path: string | null;
  destination_location: { name: string; is_main: boolean | null } | null;
  destination_location_id?: string | null;
  client_company?: { company_name: string } | null;
  created_by_user: { full_name: string } | null;
  approved_by_user?: { full_name: string } | null;
  inspected_by_user?: { full_name: string } | null;
  items: SaReturnListItem[];
};

export type SaReturnAccordionMode = 'client' | 'warehouse';

export function saReturnKind(row: Pick<SaReturnListRow, 'return_type'>): SaReturnKind {
  return row.return_type === 'item_disposal' ? 'item_disposal' : 'my_inventory';
}

export function saReturnKindLabel(kind: SaReturnKind): string {
  return kind === 'item_disposal' ? 'For Disposal' : 'Stock Return';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'MMM d, yyyy HH:mm');
}

function formatDateTimeLong(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'PPp');
}

/** Short labels for filters / selects. */
export const SA_RETURN_STATUS_LABELS: Record<SaReturnListStatus, string> = {
  pending_approval: 'Pending approval',
  pending_receive: 'Pending inspection',
  partially_received: 'Partially inspected',
  fully_received: 'Completed',
  cancelled: 'Cancelled',
};

export const SA_RETURN_STATUS_VARIANT: Record<
  SaReturnListStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  pending_approval: 'default',
  pending_receive: 'secondary',
  partially_received: 'default',
  fully_received: 'outline',
  cancelled: 'destructive',
};

type StatusLabelOptions = {
  pendingApproverName?: string | null;
};

function classificationTotals(
  items: Array<Pick<SaReturnListItem, 'stock_return_quantity' | 'disposal_quantity'>> | undefined
) {
  const list = items ?? [];
  return {
    stockReturn: list.reduce((sum, item) => sum + (item.stock_return_quantity || 0), 0),
    disposal: list.reduce((sum, item) => sum + (item.disposal_quantity || 0), 0),
  };
}

function completedAt(row: Pick<SaReturnListRow, 'status' | 'inspected_at'>) {
  if (row.status !== 'fully_received') return null;
  return row.inspected_at ?? null;
}

export function saReturnStatusLabel(
  row: Pick<
    SaReturnListRow,
    'status' | 'destination_location' | 'approved_by_user' | 'items'
  >,
  options?: StatusLabelOptions
): string {
  const warehouse = row.destination_location?.name?.trim() || 'Warehouse';
  const pendingApprover =
    options?.pendingApproverName?.trim() ||
    row.approved_by_user?.full_name?.trim() ||
    'Super Admin';
  const { stockReturn, disposal } = classificationTotals(row.items);

  switch (row.status) {
    case 'pending_approval':
      return `Pending Approval – ${pendingApprover}`;
    case 'pending_receive':
      return `Pending Inspection – ${warehouse}`;
    case 'partially_received':
      // Inspected portions are already applied; remaining returned qty still needs classification.
      if (stockReturn > 0 && disposal > 0) {
        return `Pending Inspection – ${warehouse}`;
      }
      if (disposal > 0 && stockReturn === 0) {
        return `Disposal Processing – ${warehouse}`;
      }
      if (stockReturn > 0) {
        return `Stock Return Processing – ${warehouse}`;
      }
      return `Pending Inspection – ${warehouse}`;
    case 'fully_received':
      // Stock return inventory + disposal records are written atomically on inspect.
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return row.status;
  }
}

const ITEMS_HEAD_CLASS =
  'h-auto bg-[#F3F4F6] px-3 py-2 text-xs font-semibold text-foreground';
const ITEMS_CELL_CLASS = 'whitespace-nowrap px-3 py-1.5';

const COL_COUNT = 9; // expand + 7 data columns + actions

function destinationLabel(row: SaReturnListRow) {
  if (!row.destination_location) return '—';
  return `${row.destination_location.name}${
    row.destination_location.is_main ? ' (Main)' : ' (Sub)'
  }`;
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{value || '—'}</dd>
    </div>
  );
}

function ReturnedItemsTable({ items }: { items: SaReturnListItem[] }) {
  const totalReturned = items.reduce((sum, item) => sum + item.return_quantity, 0);
  const totalInspected = items.reduce((sum, item) => sum + item.inspected_quantity, 0);
  const totalStockReturn = items.reduce((sum, item) => sum + item.stock_return_quantity, 0);
  const totalDisposal = items.reduce((sum, item) => sum + item.disposal_quantity, 0);

  return (
    <div className="overflow-x-auto border border-[#E5E7EB]">
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow className="border-[#E5E7EB] hover:bg-transparent">
            <TableHead className={ITEMS_HEAD_CLASS}>Brand</TableHead>
            <TableHead className={ITEMS_HEAD_CLASS}>Variant</TableHead>
            <TableHead className={ITEMS_HEAD_CLASS}>Variant Type</TableHead>
            <TableHead className={cn(ITEMS_HEAD_CLASS, 'text-right')}>Total Returned</TableHead>
            <TableHead className={cn(ITEMS_HEAD_CLASS, 'text-right')}>Total Inspected</TableHead>
            <TableHead className={cn(ITEMS_HEAD_CLASS, 'text-right text-emerald-800')}>
              Stock Return
            </TableHead>
            <TableHead className={cn(ITEMS_HEAD_CLASS, 'text-right text-red-800')}>
              Disposal
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} className="border-[#E5E7EB] bg-white hover:bg-white">
              <TableCell className={ITEMS_CELL_CLASS}>
                {item.variant?.brand?.name ?? '—'}
              </TableCell>
              <TableCell className={ITEMS_CELL_CLASS}>{item.variant?.name ?? '—'}</TableCell>
              <TableCell className={cn(ITEMS_CELL_CLASS, 'text-muted-foreground')}>
                {item.variant?.variant_type?.trim() || '—'}
              </TableCell>
              <TableCell className={cn(ITEMS_CELL_CLASS, 'text-right tabular-nums')}>
                {item.return_quantity}
              </TableCell>
              <TableCell className={cn(ITEMS_CELL_CLASS, 'text-right tabular-nums')}>
                {item.inspected_quantity}
              </TableCell>
              <TableCell
                className={cn(
                  ITEMS_CELL_CLASS,
                  'text-right tabular-nums font-medium text-emerald-700'
                )}
              >
                {item.stock_return_quantity}
              </TableCell>
              <TableCell
                className={cn(
                  ITEMS_CELL_CLASS,
                  'text-right tabular-nums font-medium text-destructive'
                )}
              >
                {item.disposal_quantity}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-[#E5E7EB] bg-white hover:bg-white">
            <TableCell className={cn(ITEMS_CELL_CLASS, 'py-2 text-xs font-semibold')}>
              TOTAL
            </TableCell>
            <TableCell className={ITEMS_CELL_CLASS} />
            <TableCell className={ITEMS_CELL_CLASS} />
            <TableCell
              className={cn(
                ITEMS_CELL_CLASS,
                'py-2 text-right text-xs font-semibold tabular-nums'
              )}
            >
              {totalReturned}
            </TableCell>
            <TableCell
              className={cn(
                ITEMS_CELL_CLASS,
                'py-2 text-right text-xs font-semibold tabular-nums'
              )}
            >
              {totalInspected}
            </TableCell>
            <TableCell
              className={cn(
                ITEMS_CELL_CLASS,
                'py-2 text-right text-xs font-semibold tabular-nums text-emerald-700'
              )}
            >
              {totalStockReturn}
            </TableCell>
            <TableCell
              className={cn(
                ITEMS_CELL_CLASS,
                'py-2 text-right text-xs font-semibold tabular-nums text-destructive'
              )}
            >
              {totalDisposal}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

export function SaReturnExpandedPanel({
  row,
  pendingApproverName,
}: {
  row: SaReturnListRow;
  pendingApproverName?: string | null;
}) {
  const [proofUrl, setProofUrl] = useState<string | null>(row.proof_image_url);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(row.signature_url);

  useEffect(() => {
    let cancelled = false;
    setProofUrl(row.proof_image_url);
    setSignatureUrl(row.signature_url);

    void Promise.all([
      getStandardAccountReturnEvidenceSignedUrl(row.proof_image_path),
      getStandardAccountReturnEvidenceSignedUrl(row.signature_path),
    ]).then(([proof, signature]) => {
      if (cancelled) return;
      if (proof) setProofUrl(proof);
      if (signature) setSignatureUrl(signature);
    });

    return () => {
      cancelled = true;
    };
  }, [row.id, row.proof_image_path, row.proof_image_url, row.signature_path, row.signature_url]);

  const statusText = saReturnStatusLabel(row, { pendingApproverName });
  const returnKind = saReturnKind(row);

  return (
    <div className="space-y-5">
      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Evidence in Detail
        </h4>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <DetailField
            label="Return Number"
            value={
              <span className="font-mono text-sm font-medium tabular-nums">
                {row.request_number}
              </span>
            }
          />
          <DetailField
            label="Status"
            value={
              <Badge variant={SA_RETURN_STATUS_VARIANT[row.status]} className="whitespace-normal">
                {statusText}
              </Badge>
            }
          />
          <DetailField
            label="Return Type"
            value={
              <Badge
                variant="outline"
                className={cn(
                  'whitespace-normal',
                  returnKind === 'my_inventory' &&
                    'border-emerald-200 bg-emerald-50 text-emerald-800',
                  returnKind === 'item_disposal' &&
                    'border-red-200 bg-red-50 text-red-800'
                )}
              >
                {saReturnKindLabel(returnKind)}
              </Badge>
            }
          />
          {row.client_company?.company_name ? (
            <DetailField label="Client" value={row.client_company.company_name} />
          ) : null}
          <DetailField
            label="Returned By"
            value={row.created_by_user?.full_name ?? '—'}
          />
          <DetailField
            label="Approved By"
            value={row.approved_by_user?.full_name ?? '—'}
          />
          <DetailField
            label="Inspected By"
            value={row.inspected_by_user?.full_name ?? '—'}
          />
          <DetailField
            label="Destination Warehouse"
            value={destinationLabel(row)}
          />
          <DetailField label="Returned at" value={formatDateTimeLong(row.created_at)} />
          <DetailField label="Approved at" value={formatDateTimeLong(row.approved_at)} />
          <DetailField label="Inspected at" value={formatDateTimeLong(row.inspected_at)} />
          <DetailField label="Created at" value={formatDateTimeLong(row.created_at)} />
          <DetailField
            label="Completed at"
            value={formatDateTimeLong(completedAt(row))}
          />
        </dl>

        {row.notes?.trim() ? (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{row.notes.trim()}</p>
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground mb-2">Return proof</p>
            {proofUrl ? (
              <a href={proofUrl} target="_blank" rel="noreferrer" className="inline-block">
                <img
                  src={proofUrl}
                  alt="Return proof"
                  className="max-h-44 w-auto max-w-full rounded-md border object-contain bg-muted/20"
                />
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">No proof photo attached.</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Signature</p>
            {signatureUrl ? (
              <img
                src={signatureUrl}
                alt="Return signature"
                className="max-h-36 w-auto max-w-full rounded-md border object-contain bg-white"
              />
            ) : (
              <p className="text-sm text-muted-foreground">No signature attached.</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Returned Items
        </h4>
        <ReturnedItemsTable items={row.items} />
      </section>
    </div>
  );
}

type Props<T extends SaReturnListRow> = {
  rows: T[];
  mode?: SaReturnAccordionMode;
  isCompanyAdmin?: boolean;
  approvingId?: string | null;
  exportingPdfId: string | null;
  pendingApproverName?: string | null;
  onView: (row: T) => void;
  onPrintPdf: (row: T) => void;
  onApprove?: (row: T) => void;
  onInspect?: (row: T) => void;
  canInspect?: (row: T) => boolean;
  canCancelRow?: (row: T) => boolean;
  onCancel?: (row: T) => void;
};

export function SaReturnAccordionList<T extends SaReturnListRow>({
  rows,
  mode = 'client',
  isCompanyAdmin = false,
  approvingId = null,
  exportingPdfId,
  pendingApproverName,
  onView,
  onPrintPdf,
  onApprove,
  onInspect,
  canInspect,
  canCancelRow,
  onCancel,
}: Props<T>) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const isWarehouse = mode === 'warehouse';

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="overflow-auto border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10 px-2" aria-label="Expand" />
            <TableHead className="min-w-[10rem]">Return #</TableHead>
            {isWarehouse ? (
              <TableHead className="min-w-[10rem]">Client</TableHead>
            ) : null}
            <TableHead className="min-w-[10rem]">Destination</TableHead>
            <TableHead className="min-w-[14rem]">Status</TableHead>
            <TableHead className="min-w-[12rem]">Items</TableHead>
            {isWarehouse ? null : (
              <TableHead className="min-w-[9rem]">Returned by</TableHead>
            )}
            <TableHead className="min-w-[10rem]">Return type</TableHead>
            <TableHead className="whitespace-nowrap">Returned at</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const open = openIds.has(row.id);
            const totalQty = row.items.reduce((sum, item) => sum + item.return_quantity, 0);
            const inspected = row.items.reduce((sum, item) => sum + item.inspected_quantity, 0);
            const canApprove =
              !!onApprove && isCompanyAdmin && row.status === 'pending_approval';
            const showInspect = !!onInspect && (canInspect ? canInspect(row) : false);
            const canCancel = canCancelRow
              ? canCancelRow(row)
              : row.status === 'pending_approval' || row.status === 'pending_receive';
            const statusText = saReturnStatusLabel(row, { pendingApproverName });
            const returnKind = saReturnKind(row);

            return (
              <Fragment key={row.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => toggle(row.id)}
                  data-state={open ? 'open' : undefined}
                >
                  <TableCell className="w-10 px-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={open ? 'Collapse return' : 'Expand return'}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle(row.id);
                      }}
                    >
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 transition-transform duration-200',
                          open && 'rotate-180'
                        )}
                      />
                    </Button>
                  </TableCell>
                  <TableCell className="min-w-[10rem]">
                    <span className="font-mono text-sm font-medium whitespace-nowrap tabular-nums">
                      {row.request_number}
                    </span>
                  </TableCell>
                  {isWarehouse ? (
                    <TableCell className="text-sm min-w-[10rem]">
                      {row.client_company?.company_name ?? '—'}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-sm min-w-[10rem]">
                    {destinationLabel(row)}
                  </TableCell>
                  <TableCell className="min-w-[14rem]">
                    <Badge
                      variant={SA_RETURN_STATUS_VARIANT[row.status]}
                      className="whitespace-normal text-left"
                    >
                      {statusText}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm min-w-[12rem]">
                    {row.items.length} SKU · {inspected}/{totalQty} inspected
                    <div className="text-xs text-muted-foreground truncate max-w-[280px]">
                      {row.items
                        .slice(0, 3)
                        .map((item) => item.variant?.name ?? '—')
                        .join(', ')}
                      {row.items.length > 3 ? '…' : ''}
                    </div>
                  </TableCell>
                  {isWarehouse ? null : (
                    <TableCell className="text-sm min-w-[9rem] whitespace-nowrap">
                      {row.created_by_user?.full_name ?? '—'}
                    </TableCell>
                  )}
                  <TableCell className="min-w-[10rem]">
                    <Badge
                      variant="outline"
                      className={cn(
                        'whitespace-normal text-left',
                        returnKind === 'my_inventory' &&
                          'border-emerald-200 bg-emerald-50 text-emerald-800',
                        returnKind === 'item_disposal' &&
                          'border-red-200 bg-red-50 text-red-800'
                      )}
                    >
                      {saReturnKindLabel(returnKind)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Open actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => onView(row)}>
                          <Eye className="mr-2 h-4 w-4" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={exportingPdfId === row.id}
                          onClick={() => onPrintPdf(row)}
                        >
                          {exportingPdfId === row.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="mr-2 h-4 w-4" />
                          )}
                          Print PDF
                        </DropdownMenuItem>
                        {showInspect ? (
                          <DropdownMenuItem onClick={() => onInspect?.(row)}>
                            <SearchCheck className="mr-2 h-4 w-4" />
                            Inspect
                          </DropdownMenuItem>
                        ) : null}
                        {canApprove ? (
                          <DropdownMenuItem
                            disabled={approvingId === row.id}
                            onClick={() => onApprove?.(row)}
                          >
                            {approvingId === row.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Approve
                          </DropdownMenuItem>
                        ) : null}
                        {canCancel && onCancel ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onCancel(row)}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              {row.status === 'pending_approval' && isCompanyAdmin
                                ? 'Reject'
                                : 'Cancel'}
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>

                {open ? (
                  <TableRow className="hover:bg-transparent bg-muted/10">
                    <TableCell colSpan={COL_COUNT} className="p-0">
                      <div className="border-t px-4 py-4 sm:px-5 space-y-4">
                        <SaReturnExpandedPanel
                          row={row}
                          pendingApproverName={pendingApproverName}
                        />
                        {showInspect ? (
                          <div className="flex justify-end">
                            <Button type="button" onClick={() => onInspect?.(row)}>
                              <SearchCheck className="mr-2 h-4 w-4" />
                              Inspect return
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
