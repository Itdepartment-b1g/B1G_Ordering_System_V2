import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Eye, LayoutGrid, List, RotateCcw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  type MockClientReturn,
} from './clientReturnMock';
import { BrandReturnedTable, groupLinesByBrand } from './ClientReturnBrandTable';
import { ClientReturnExpandedMeta } from './ClientReturnExpandedMeta';
import { ClientReturnViewDialog } from './ClientReturnViewDialog';

const HISTORY_PAGE_SIZE: PageSize = 25;
const VIEW_MODE_KEY = 'client-order-returns-view';

type HistoryViewMode = 'table' | 'cards';

function isMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

function readStoredViewMode(): HistoryViewMode {
  if (isMobileViewport()) return 'cards';
  if (typeof window === 'undefined') return 'table';
  const saved = window.localStorage.getItem(VIEW_MODE_KEY);
  if (saved === 'table' || saved === 'cards') return saved;
  return 'table';
}

function uniqueReturnBrands(lines: MockClientReturn['lines']): string[] {
  return groupLinesByBrand(lines).map((group) => group.brandName);
}

function ReturnedBrandBadges({ brands }: { brands: string[] }) {
  if (brands.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1" title={brands.join(', ')}>
      {brands.map((brand) => (
        <Badge key={brand} variant="secondary" className="font-normal text-[11px] px-1.5 py-0 h-5 max-w-[9rem] truncate">
          {brand}
        </Badge>
      ))}
    </div>
  );
}

function ReturnHistoryCard({ row, onView }: { row: MockClientReturn; onView: () => void }) {
  const qty = getMockReturnLineQty(row);
  return (
    <div className="rounded-2xl border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono font-semibold text-sm truncate">{row.returnNumber}</p>
          <p className="font-mono text-xs text-muted-foreground truncate">{row.orderNumber}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full"
          onClick={onView}
          aria-label={`View ${row.returnNumber}`}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>

      <h3 className="text-xl font-bold tracking-tight mt-4 truncate">{row.clientName}</h3>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Returned by</p>
          <p className="font-semibold text-sm truncate">{row.returnedByName}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Returned date</p>
          <p className="font-semibold text-sm">{format(new Date(row.returnDate), 'MMM d, yyyy')}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="font-semibold text-sm">{format(new Date(row.createdAt), 'MMM d, yyyy · h:mm a')}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Returned Brands</p>
          <div className="mt-0.5">
            <ReturnedBrandBadges brands={uniqueReturnBrands(row.lines)} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-4">
        <Badge variant="outline" className="font-normal">
          {formatClientReturnReason(row.reason)}
        </Badge>
        <span className="text-sm font-semibold tabular-nums">
          {qty} {qty === 1 ? 'unit' : 'units'}
        </span>
      </div>
    </div>
  );
}

function ReturnHistoryDetails({ row }: { row: MockClientReturn }) {
  const brandGroups = groupLinesByBrand(row.lines);
  return (
    <div className="space-y-3 mb-2">
      <ClientReturnExpandedMeta row={row} />
      {brandGroups.map((group) => (
        <BrandReturnedTable key={group.brandName} brandName={group.brandName} variants={group.variants} />
      ))}
    </div>
  );
}

function ViewModeToggle({
  value,
  onChange,
}: {
  value: HistoryViewMode;
  onChange: (mode: HistoryViewMode) => void;
}) {
  const options: { id: HistoryViewMode; label: string; icon: typeof List }[] = [
    { id: 'table', label: 'Table', icon: List },
    { id: 'cards', label: 'Cards', icon: LayoutGrid },
  ];

  return (
    <div className="flex rounded-md border p-0.5 shrink-0">
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.id;
        return (
          <Button
            key={option.id}
            type="button"
            variant={active ? 'default' : 'ghost'}
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={() => onChange(option.id)}
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export default function ClientOrderReturnsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(HISTORY_PAGE_SIZE);
  const [viewRow, setViewRow] = useState<MockClientReturn | null>(null);
  const [viewMode, setViewMode] = useState<HistoryViewMode>(readStoredViewMode);

  const setAndStoreViewMode = (mode: HistoryViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const onChange = () => {
      if (media.matches) setViewMode('cards');
      else setViewMode(readStoredViewMode());
    };
    media.addEventListener('change', onChange);
    if (media.matches) setViewMode('cards');
    return () => media.removeEventListener('change', onChange);
  }, []);

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
        ...uniqueReturnBrands(row.lines),
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
          History of items returned against an ORD number (CR-MTS-YYYYMM-000001).
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-rose-600" />
                <h2 className="font-semibold">
                  {filtered.length} return{filtered.length === 1 ? '' : 's'}
                </h2>
              </div>
              <ViewModeToggle value={viewMode} onChange={setAndStoreViewMode} />
            </div>
            <div className="relative w-full sm:max-w-72 sm:ml-auto">
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
              {viewMode === 'cards' && (
                <div className="space-y-3">
                  {pagedItems.map((row) => (
                    <ReturnHistoryCard key={row.id} row={row} onView={() => setViewRow(row)} />
                  ))}
                </div>
              )}

              {viewMode === 'table' && (
                <div className="rounded-md border overflow-x-auto">
                  <div className="hidden md:grid grid-cols-[1.5rem_0.9fr_0.85fr_0.75fr_1fr_0.75fr_0.75fr_1fr_0.65fr_0.35fr] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground bg-muted/50 border-b min-w-[1080px]">
                    <span />
                    <span>CR #</span>
                    <span>ORD #</span>
                    <span>Client</span>
                    <span>Brands</span>
                    <span>Returned by</span>
                    <span>Returned date</span>
                    <span>Created</span>
                    <span>Reason</span>
                    <span className="text-right">Qty</span>
                  </div>
                  <Accordion type="multiple" className="w-full min-w-[1080px] md:min-w-0">
                    {pagedItems.map((row) => {
                      const qty = getMockReturnLineQty(row);
                      return (
                        <AccordionItem key={row.id} value={row.id} className="px-3">
                          <AccordionTrigger className="hover:no-underline py-3 justify-start gap-2 [&>svg]:order-first [&>svg]:h-4 [&>svg]:w-4">
                            <div className="grid w-full grid-cols-1 md:grid-cols-[0.9fr_0.85fr_0.75fr_1fr_0.75fr_0.75fr_1fr_0.65fr_0.35fr] gap-1 md:gap-2 text-left text-sm">
                              <span className="font-mono text-xs font-semibold">{row.returnNumber}</span>
                              <span className="font-mono text-xs text-muted-foreground">{row.orderNumber}</span>
                              <span className="truncate">{row.clientName}</span>
                              <ReturnedBrandBadges brands={uniqueReturnBrands(row.lines)} />
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
                            <div className="md:ml-6">
                              <ReturnHistoryDetails row={row} />
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              )}

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

      <ClientReturnViewDialog
        open={!!viewRow}
        onOpenChange={(open) => {
          if (!open) setViewRow(null);
        }}
        row={viewRow}
      />
    </div>
  );
}
