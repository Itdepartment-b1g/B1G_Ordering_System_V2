import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { RotateCcw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import {
  formatClientReturnReason,
  getMockReturnLineQty,
  MOCK_CLIENT_RETURNS,
  SHOW_CLIENT_RETURN_MOCK,
} from './clientReturnMock';
import { BrandReturnedTable, groupLinesByBrand } from './ClientReturnBrandTable';
import { ClientReturnExpandedMeta } from './ClientReturnExpandedMeta';

const HISTORY_PAGE_SIZE: PageSize = 25;

export default function ClientOrderReturnsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(HISTORY_PAGE_SIZE);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return MOCK_CLIENT_RETURNS;
    return MOCK_CLIENT_RETURNS.filter((row) => {
      const haystack = [
        row.returnNumber,
        row.orderNumber,
        row.clientName,
        row.returnedByName,
        row.reason,
        formatClientReturnReason(row.reason),
        row.notes || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [searchQuery, pageSize]);

  const { pagedItems, safePage, pageCount } = getListPaginationSlice(filtered, page, pageSize);

  if (!SHOW_CLIENT_RETURN_MOCK) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold tracking-tight">Client Order Returns</h1>
        <p className="text-muted-foreground mt-2">This page is hidden until the mock flag is enabled.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Client Order Returns</h1>
        <p className="text-muted-foreground">
          History of items returned against an ORD number (CR-MTS-YYYYMM-0001).
        </p>
      </div>

      <Alert className="border-amber-200 bg-amber-50 text-amber-950">
        <AlertDescription>
          Visual mock with dummy data. No database writes. Open an approved order on{' '}
          <Link to="/my-orders" className="underline font-medium">
            My Orders
          </Link>{' '}
          to see the order → return timeline.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-rose-600" />
              <h2 className="font-semibold">
                {filtered.length} return{filtered.length === 1 ? '' : 's'}
              </h2>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search CR, ORD, client..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No matching returns.</p>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <div className="hidden md:grid grid-cols-[1.5rem_0.95fr_0.95fr_0.85fr_0.85fr_0.8fr_1.1fr_0.7fr_0.4fr] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 border-b min-w-[900px]">
                  <span />
                  <span>CR #</span>
                  <span>ORD #</span>
                  <span>Client</span>
                  <span>Returned by</span>
                  <span>Returned date</span>
                  <span>Created</span>
                  <span>Reason</span>
                  <span className="text-right">Qty</span>
                </div>

                <Accordion type="multiple" className="w-full min-w-[900px] md:min-w-0">
                  {pagedItems.map((row) => {
                    const qty = getMockReturnLineQty(row);
                    const brandGroups = groupLinesByBrand(row.lines);
                    return (
                      <AccordionItem key={row.id} value={row.id} className="px-3">
                        <AccordionTrigger className="hover:no-underline py-3 justify-start gap-2 [&>svg]:order-first [&>svg]:h-4 [&>svg]:w-4">
                          <div className="grid w-full grid-cols-1 md:grid-cols-[0.95fr_0.95fr_0.85fr_0.85fr_0.8fr_1.1fr_0.7fr_0.4fr] gap-1 md:gap-2 text-left text-sm">
                            <span className="font-mono text-xs font-semibold">{row.returnNumber}</span>
                            <span className="font-mono text-xs text-muted-foreground">{row.orderNumber}</span>
                            <span className="truncate">{row.clientName}</span>
                            <span className="truncate text-sm">{row.returnedByName}</span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(row.returnDate), 'MMM d, yyyy')}
                            </span>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(row.createdAt), 'MMM d, yyyy h:mm a')}
                            </span>
                            <span>
                              <Badge variant="outline" className="font-normal">
                                {formatClientReturnReason(row.reason)}
                              </Badge>
                            </span>
                            <span className="font-semibold text-rose-700 tabular-nums md:text-right">{qty}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 mb-2 md:ml-6">
                            <ClientReturnExpandedMeta row={row} />
                            {brandGroups.map((group) => (
                              <BrandReturnedTable
                                key={group.brandName}
                                brandName={group.brandName}
                                variants={group.variants}
                              />
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
              <div className="mt-4">
                <ListPagination
                  pageSize={pageSize}
                  safePage={safePage}
                  pageCount={pageCount}
                  onPageSizeChange={(value) => {
                    setPageSize(value);
                    setPage(0);
                  }}
                  onPrevious={() => setPage((current) => Math.max(0, current - 1))}
                  onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
