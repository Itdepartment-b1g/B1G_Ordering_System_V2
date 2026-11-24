import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, PackageX } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import type { TlTransferDateRange } from './tlStockTransferListHelpers';
import {
  filterTlLostItemGroups,
  groupTlLostItems,
  lostItemLabel,
  type TlLostItemGroup,
} from './tlTransferLostItems';
import { useAppDispatch, useAppSelector } from '@/store/store';
import { fetchTlLostLines } from '@/store/slices/motosales/tl-stock-transfers';

type Props = {
  searchQuery: string;
  dateRange: TlTransferDateRange;
  page: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
};

function transferRows(group: TlLostItemGroup, userId: string) {
  const byNumber = new Map<string, { hasOpen: boolean; canInvestigate: boolean }>();
  for (const line of group.transfers) {
    const number = line.requestNumber;
    if (!number) continue;
    const current = byNumber.get(number) ?? { hasOpen: false, canInvestigate: false };
    current.hasOpen = current.hasOpen || line.status === 'open';
    current.canInvestigate = current.canInvestigate || line.sourceLeaderId === userId;
    byNumber.set(number, current);
  }
  return [...byNumber.entries()].map(([number, flags]) => ({ number, ...flags }));
}

function shortageHref(requestNumber: string, hasOpen: boolean) {
  const params = new URLSearchParams({
    search: requestNumber,
    status: hasOpen ? 'open' : 'all',
  });
  return `/inventory/tl-transfer-shortages?${params.toString()}`;
}

export function TLTransferLostItemsPanel({
  searchQuery,
  dateRange,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const { user } = useAuth();
  const dispatch = useAppDispatch();

  const lines = useAppSelector((state) => state.motoSalesTlTransfers.lostLines);
  const lostStatus = useAppSelector((state) => state.motoSalesTlTransfers.lostStatus);
  const error = useAppSelector((state) => state.motoSalesTlTransfers.lostError);
  const isLoading = lostStatus === 'idle' || lostStatus === 'loading';

  useEffect(() => {
    if (!user?.company_id || !user?.id) return;
    void dispatch(fetchTlLostLines());
  }, [dispatch, user?.company_id, user?.id]);

  const groups = useMemo(() => groupTlLostItems(lines), [lines]);
  const filtered = useMemo(
    () => filterTlLostItemGroups(groups, searchQuery, dateRange),
    [groups, searchQuery, dateRange]
  );
  const pagination = useMemo(
    () => getListPaginationSlice(filtered, page, pageSize),
    [filtered, page, pageSize]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading missing and lost items...
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-10 text-center text-sm text-destructive">
        {error || 'Could not load missing and lost items.'}
      </p>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <PackageX className="h-10 w-10 mx-auto mb-2 opacity-40" />
        <p>No missing or lost transfer items</p>
        <p className="mt-1 text-sm">
          Items show here after a receive is short — still investigating, written off, or replaced.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No missing or lost items match this search or date range.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="whitespace-nowrap">Transfer #</TableHead>
              <TableHead className="text-center">
                Missing
                <span className="block font-normal text-[11px] text-muted-foreground">
                  (under investigation)
                </span>
              </TableHead>
              <TableHead className="text-center">Lost</TableHead>
              <TableHead className="text-center">Transfers</TableHead>
              <TableHead>Last reported</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pagedItems.map((group) => {
              const transfers = transferRows(group, user?.id || '');
              return (
                <TableRow key={group.variantId}>
                  <TableCell>
                    <p className="font-medium">{lostItemLabel(group)}</p>
                    {group.variantType ? (
                      <p className="text-sm text-muted-foreground">{group.variantType}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {transfers.map((transfer) => (
                        <span key={transfer.number}>{transfer.number}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {group.missingQuantity > 0 ? group.missingQuantity : '—'}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {group.lostQuantity > 0 ? group.lostQuantity : '—'}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{group.transferCount}</TableCell>
                  <TableCell>{new Date(group.lastAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      {transfers
                        .filter((transfer) => transfer.canInvestigate)
                        .map((transfer) => (
                          <Button key={transfer.number} asChild size="sm" variant="outline">
                            <Link to={shortageHref(transfer.number, transfer.hasOpen)}>
                              Investigate
                            </Link>
                          </Button>
                        ))}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        pageSize={pageSize}
        safePage={pagination.safePage}
        pageCount={pagination.pageCount}
        onPageSizeChange={onPageSizeChange}
        onPrevious={() => onPageChange(Math.max(0, pagination.safePage - 1))}
        onNext={() =>
          onPageChange(Math.min(pagination.pageCount - 1, pagination.safePage + 1))
        }
      />
    </div>
  );
}
