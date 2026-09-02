import { useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DEFAULT_PAGE_SIZE,
  getListPaginationSlice,
  ListPagination,
  type PageSize,
} from '@/features/shared/components/ListPagination';
import {
  type AccountingAgentStatus,
  type AccountingAgentSummary,
  type AccountingInventoryItem,
} from '@/features/accounting/hooks/useAccountingAgentInventory';
import { Box, Check, ChevronRight, ChevronsUpDown, Eye, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatPeso(value: number) {
  return `₱${value.toLocaleString()}`;
}

function variantTypeBadgeClass(type: string | null | undefined): string {
  if (!type) return '';
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (normalized === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (normalized === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  return '';
}

function AgentStatusLabel({ status }: { status: AccountingAgentStatus }) {
  const inactive = status === 'inactive';
  return (
    <Badge
      variant="outline"
      className={
        inactive
          ? 'border-muted-foreground/30 bg-muted text-muted-foreground'
          : 'border-emerald-300 bg-emerald-50 text-emerald-800'
      }
    >
      {inactive ? 'Inactive' : 'Active'}
    </Badge>
  );
}

function groupItemsByBrand(items: AccountingInventoryItem[]) {
  const byBrand = new Map<
    string,
    { brandId: string; brandName: string; items: AccountingInventoryItem[]; qty: number; value: number }
  >();

  for (const item of items) {
    const existing = byBrand.get(item.brandId);
    if (existing) {
      existing.items.push(item);
      existing.qty += item.qty;
      existing.value += item.value;
    } else {
      byBrand.set(item.brandId, {
        brandId: item.brandId,
        brandName: item.brandName,
        items: [item],
        qty: item.qty,
        value: item.value,
      });
    }
  }

  return Array.from(byBrand.values()).sort((a, b) => a.brandName.localeCompare(b.brandName));
}

type FilterKind = 'all' | 'brand' | 'variant';

interface SearchOption {
  id: string;
  label: string;
  hint?: string;
}

function SearchablePicker({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
}: {
  options: SearchOption[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder: string;
  searchPlaceholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full sm:w-[240px] justify-between font-normal"
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 z-[80]" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.hint ?? ''} ${option.id}`}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === option.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="truncate text-xs text-muted-foreground">{option.hint}</span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface AgentInventoryListProps {
  people: AccountingAgentSummary[];
  isFiltered: boolean;
  selectedRole: 'team_leader' | 'mobile_sales';
}

export default function AgentInventoryList({
  people,
  isFiltered,
  selectedRole,
}: AgentInventoryListProps) {
  const [selectedPerson, setSelectedPerson] = useState<AccountingAgentSummary | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [filterKind, setFilterKind] = useState<FilterKind>('all');
  const [filterValue, setFilterValue] = useState<string | null>(null);
  const [brandVariantId, setBrandVariantId] = useState('all');

  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => a.agentName.localeCompare(b.agentName)),
    [people]
  );

  const peopleKey = useMemo(() => people.map((person) => person.agentId).join(','), [people]);

  useEffect(() => {
    setPage(0);
  }, [peopleKey, selectedRole, pageSize]);

  const { pageCount, safePage, pagedItems } = useMemo(
    () => getListPaginationSlice(sortedPeople, page, pageSize),
    [sortedPeople, page, pageSize]
  );

  const selectedBrands = useMemo(
    () => (selectedPerson ? groupItemsByBrand(selectedPerson.inventory) : []),
    [selectedPerson]
  );

  const brandOptions = useMemo<SearchOption[]>(
    () => selectedBrands.map((brand) => ({ id: brand.brandId, label: brand.brandName })),
    [selectedBrands]
  );

  const variantOptions = useMemo<SearchOption[]>(
    () =>
      selectedBrands.flatMap((brand) =>
        brand.items.map((item) => ({
          id: item.id,
          label: item.variantName,
          hint: `${brand.brandName}${item.variantType ? ` · ${item.variantType}` : ''}`,
        }))
      ),
    [selectedBrands]
  );

  const brandVariantOptions = useMemo<SearchOption[]>(() => {
    if (filterKind !== 'brand' || !filterValue) return [];
    const brand = selectedBrands.find((item) => item.brandId === filterValue);
    if (!brand) return [];
    return [
      { id: 'all', label: 'All variants' },
      ...brand.items.map((item) => ({
        id: item.id,
        label: item.variantName,
        hint: item.variantType || undefined,
      })),
    ];
  }, [filterKind, filterValue, selectedBrands]);

  const filteredDialogBrands = useMemo(() => {
    if (filterKind === 'all') return selectedBrands;

    if (filterKind === 'brand') {
      if (!filterValue) return selectedBrands;
      const matched = selectedBrands.filter((brand) => brand.brandId === filterValue);
      if (brandVariantId === 'all') return matched;

      return matched.flatMap((brand) => {
        const items = brand.items.filter((item) => item.id === brandVariantId);
        if (items.length === 0) return [];
        return [
          {
            ...brand,
            items,
            qty: items.reduce((sum, item) => sum + item.qty, 0),
            value: items.reduce((sum, item) => sum + item.value, 0),
          },
        ];
      });
    }

    if (!filterValue) return selectedBrands;

    return selectedBrands.flatMap((brand) => {
      const items = brand.items.filter((item) => item.id === filterValue);
      if (items.length === 0) return [];
      return [
        {
          ...brand,
          items,
          qty: items.reduce((sum, item) => sum + item.qty, 0),
          value: items.reduce((sum, item) => sum + item.value, 0),
        },
      ];
    });
  }, [selectedBrands, filterKind, filterValue, brandVariantId]);

  const dialogTotals = useMemo(() => {
    return filteredDialogBrands.reduce(
      (acc, brand) => ({
        skus: acc.skus + brand.items.length,
        units: acc.units + brand.qty,
        value: acc.value + brand.value,
      }),
      { skus: 0, units: 0, value: 0 }
    );
  }, [filteredDialogBrands]);

  const openPerson = (person: AccountingAgentSummary) => {
    setFilterKind('all');
    setFilterValue(null);
    setBrandVariantId('all');
    setSelectedPerson(person);
  };

  return (
    <>
      {sortedPeople.length === 0 ? (
        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
          <p>
            {isFiltered
              ? 'No people match the current filters.'
              : selectedRole === 'team_leader'
                ? 'No team leaders found.'
                : 'No mobile sales found.'}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="bg-muted/60">Name</TableHead>
                  <TableHead className="bg-muted/60">
                    {selectedRole === 'mobile_sales' ? 'Team' : 'Role'}
                  </TableHead>
                  <TableHead className="bg-muted/60 text-right">SKUs</TableHead>
                  <TableHead className="bg-muted/60 text-right">Units</TableHead>
                  {/* <TableHead className="bg-muted/60 text-right">Allocated</TableHead> */}
                  <TableHead className="bg-muted/60 w-[48px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedItems.map((person) => (
                  <TableRow
                    key={person.agentId}
                    className="cursor-pointer"
                    onClick={() => openPerson(person)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{person.agentName}</span>
                        <AgentStatusLabel status={person.status} />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {selectedRole === 'mobile_sales'
                        ? person.leaderName || 'Unassigned'
                        : 'Team Leader'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{person.variantCount}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {person.totalStock.toLocaleString()}
                    </TableCell>
                    {/* <TableCell className="text-right tabular-nums font-medium text-emerald-600">
                      {formatPeso(person.totalValue)}
                    </TableCell> */}
                    <TableCell className="text-right">
                      <Eye className="inline h-4 w-4 text-muted-foreground" aria-hidden />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="border-t px-3 py-3">
            <ListPagination
              pageSize={pageSize}
              safePage={safePage}
              pageCount={pageCount}
              onPageSizeChange={setPageSize}
              onPrevious={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            />
          </div>
        </>
      )}

      <Dialog open={!!selectedPerson} onOpenChange={(open) => !open && setSelectedPerson(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pr-8">
              <span>{selectedPerson?.agentName}</span>
              {selectedPerson ? <AgentStatusLabel status={selectedPerson.status} /> : null}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {selectedRole === 'mobile_sales'
                ? selectedPerson?.leaderName
                  ? `Mobile Sales · ${selectedPerson.leaderName}`
                  : 'Mobile Sales · Unassigned'
                : 'Team Leader'}
              {' — view only'}
            </p>
          </DialogHeader>

          {selectedPerson && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  value={filterKind}
                  onValueChange={(value) => {
                    setFilterKind(value as FilterKind);
                    setFilterValue(null);
                    setBrandVariantId('all');
                  }}
                >
                  <SelectTrigger className="h-10 w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="brand">Brand</SelectItem>
                    <SelectItem value="variant">Variant</SelectItem>
                  </SelectContent>
                </Select>
                {filterKind === 'brand' && (
                  <>
                    <SearchablePicker
                      options={brandOptions}
                      value={filterValue}
                      onChange={(id) => {
                        setFilterValue(id);
                        setBrandVariantId('all');
                      }}
                      placeholder="Select a brand..."
                      searchPlaceholder="Search brand..."
                    />
                    {filterValue && (
                      <SearchablePicker
                        options={brandVariantOptions}
                        value={brandVariantId}
                        onChange={setBrandVariantId}
                        placeholder="Select a variant..."
                        searchPlaceholder="Search variant..."
                      />
                    )}
                  </>
                )}
                {filterKind === 'variant' && (
                  <SearchablePicker
                    options={variantOptions}
                    value={filterValue}
                    onChange={setFilterValue}
                    placeholder="Select a variant..."
                    searchPlaceholder="Search variant..."
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Card className="relative overflow-hidden border-border/70 shadow-sm">
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/[0.08] via-transparent to-transparent" />
                  <Package className="pointer-events-none absolute -bottom-4 -right-3 h-24 w-24 text-sky-500/10" />
                  <div className="relative z-10 p-4 pr-14 pb-10">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Total SKUs
                    </p>
                    <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                      {dialogTotals.skus}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Unique variants</p>
                  </div>
                </Card>
                <Card className="relative overflow-hidden border-border/70 shadow-sm">
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-500/[0.08] via-transparent to-transparent" />
                  <Box className="pointer-events-none absolute -bottom-4 -right-3 h-24 w-24 text-violet-500/10" />
                  <div className="relative z-10 p-4 pr-14 pb-10">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Total Units
                    </p>
                    <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                      {dialogTotals.units.toLocaleString()}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">On-hand quantity</p>
                  </div>
                </Card>
              </div>

              {filteredDialogBrands.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {selectedBrands.length === 0
                    ? 'No stock for this person.'
                    : 'No brands or variants match the current filters.'}
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border">
                  <div className="grid grid-cols-[1.6fr_72px_88px] gap-2 bg-muted/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="pl-6">Brand</span>
                    <span className="text-right">SKUs (Variants)</span>
                    <span className="text-right">Units</span>
                    {/* <span className="text-right">Allocated</span> */}
                  </div>
                  <Accordion type="multiple">
                    {filteredDialogBrands.map((brand) => (
                      <AccordionItem key={brand.brandId} value={brand.brandId} className="border-b last:border-b-0">
                        <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-muted/30 gap-2 justify-start [&>svg:last-child]:hidden [&[data-state=open]>svg:first-child]:rotate-90">
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
                          <div className="grid min-w-0 flex-1 grid-cols-[1.6fr_72px_88px] items-center gap-2 text-left">
                            <span className="truncate font-medium text-sm">{brand.brandName}</span>
                            <span className="text-right text-sm tabular-nums">{brand.items.length}</span>
                            <span className="text-right text-sm tabular-nums">{brand.qty.toLocaleString()}</span>
                            {/* <span className="text-right text-sm tabular-nums text-emerald-600">
                              {formatPeso(brand.value)}
                            </span> */}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0 pt-0">
                          <div className="bg-slate-50/80 px-4 py-4">
                            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Variants in this brand
                            </p>
                            <div className="overflow-hidden rounded-md border bg-white">
                              <Table>
                                <TableHeader>
                                  <TableRow className="hover:bg-transparent">
                                    <TableHead>Variant</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                    {/* <TableHead className="text-right">Unit</TableHead>
                                    <TableHead className="text-right">Allocated</TableHead> */}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {brand.items.map((item) => (
                                    <TableRow key={item.id}>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">{item.variantName}</span>
                                          {item.variantType ? (
                                            <Badge
                                              variant="outline"
                                              className={`text-[10px] ${variantTypeBadgeClass(item.variantType)}`}
                                            >
                                              {item.variantType}
                                            </Badge>
                                          ) : null}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums">
                                        {item.qty.toLocaleString()}
                                      </TableCell>
                                      {/* <TableCell className="text-right tabular-nums text-muted-foreground">
                                        {formatPeso(item.allocatedPrice)}
                                      </TableCell>
                                      <TableCell className="text-right tabular-nums text-emerald-600">
                                        {formatPeso(item.value)}
                                      </TableCell> */}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
