import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  isPriceItemAlreadyConfirmed,
  type CompanyPriceChangeAgreement,
  type CompanyPriceChangeBatch,
  type CompanyPriceChangeItem,
} from './companyPriceChangeApi';
import { formatPriceItemWave, groupPriceItemsByBrandWave } from './priceChangeItemGroups';
import { PriceChangeDisplay } from './PriceChangeDisplay';

export type PriceItemsViewMode = 'cards' | 'table';

function StatusBadge({ seen }: { seen: boolean }) {
  return seen ? (
    <Badge
      variant="outline"
      className="bg-green-50 text-green-900 border-green-200 font-normal shrink-0"
    >
      Confirmed
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="bg-amber-50 text-amber-900 border-amber-200 font-normal shrink-0"
    >
      New
    </Badge>
  );
}

function ItemCard({
  item,
  showStatus,
  seen,
}: {
  item: CompanyPriceChangeItem;
  showStatus: boolean;
  seen: boolean;
}) {
  return (
    <div
      className={`rounded-md border p-3 space-y-2 ${seen ? 'bg-muted/20' : 'bg-background'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm leading-snug break-words">{item.variant_name}</p>
          <p className="text-xs text-muted-foreground capitalize mt-0.5">{item.variant_type}</p>
        </div>
        {showStatus && <StatusBadge seen={seen} />}
      </div>
      <dl className="grid grid-cols-1 gap-1.5 text-xs">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground shrink-0">Selling</dt>
          <dd>
            <PriceChangeDisplay
              oldVal={item.old_selling_price}
              newVal={item.new_selling_price}
              className="text-xs"
            />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground shrink-0">DSP</dt>
          <dd>
            <PriceChangeDisplay
              oldVal={item.old_dsp_price}
              newVal={item.new_dsp_price}
              className="text-xs"
            />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground shrink-0">RSP</dt>
          <dd>
            <PriceChangeDisplay
              oldVal={item.old_rsp_price}
              newVal={item.new_rsp_price}
              className="text-xs"
            />
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function PriceChangeItemsGroupedTable({
  batch,
  myAgreement,
  compact = false,
  showStatus = false,
  viewMode = 'table',
}: {
  batch: CompanyPriceChangeBatch;
  myAgreement?: CompanyPriceChangeAgreement | null;
  compact?: boolean;
  showStatus?: boolean;
  /** Explicit layout — cards (mobile) or table (web). */
  viewMode?: PriceItemsViewMode;
}) {
  const groups = [...groupPriceItemsByBrandWave(batch.items ?? [])];
  if (showStatus) {
    groups.sort((a, b) => {
      const aHasNew = a.items.some((i) => !isPriceItemAlreadyConfirmed(i, myAgreement)) ? 0 : 1;
      const bHasNew = b.items.some((i) => !isPriceItemAlreadyConfirmed(i, myAgreement)) ? 0 : 1;
      if (aHasNew !== bHasNew) return aHasNew - bHasNew;
      const byTime = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (byTime !== 0) return byTime;
      return a.brandName.localeCompare(b.brandName);
    });
    for (const g of groups) {
      g.items = [...g.items].sort((a, b) => {
        const aSeen = isPriceItemAlreadyConfirmed(a, myAgreement) ? 1 : 0;
        const bSeen = isPriceItemAlreadyConfirmed(b, myAgreement) ? 1 : 0;
        if (aSeen !== bSeen) return aSeen - bSeen;
        return a.variant_name.localeCompare(b.variant_name);
      });
    }
  }
  const textClass = compact ? 'text-xs' : undefined;
  const useCards = viewMode === 'cards';

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">No price items in this batch.</p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key} className="space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5">
            <span className="font-semibold text-sm">{group.brandName}</span>
            <span className="text-muted-foreground text-xs">—</span>
            <span className="text-xs text-muted-foreground">
              {formatPriceItemWave(group.updatedAt)}
            </span>
          </div>

          {useCards ? (
            <div className="space-y-2">
              {group.items.map((item) => {
                const seen = showStatus
                  ? isPriceItemAlreadyConfirmed(item, myAgreement)
                  : false;
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    showStatus={showStatus}
                    seen={seen}
                  />
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table className={compact ? 'text-xs' : undefined}>
                <TableHeader>
                  <TableRow>
                    {showStatus && (
                      <TableHead className="w-[88px] whitespace-nowrap px-2">Status</TableHead>
                    )}
                    <TableHead className="px-2">Variant</TableHead>
                    <TableHead className="px-2 w-[72px]">Type</TableHead>
                    <TableHead className="px-2 whitespace-nowrap">Selling</TableHead>
                    <TableHead className="px-2 whitespace-nowrap">DSP</TableHead>
                    <TableHead className="px-2 whitespace-nowrap">RSP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((item) => {
                    const seen = showStatus
                      ? isPriceItemAlreadyConfirmed(item, myAgreement)
                      : false;
                    return (
                      <TableRow key={item.id} className={seen ? 'bg-muted/20' : undefined}>
                        {showStatus && (
                          <TableCell className="px-2 py-2">
                            <StatusBadge seen={seen} />
                          </TableCell>
                        )}
                        <TableCell className={`px-2 py-2 ${compact ? 'text-sm' : ''}`}>
                          {item.variant_name}
                        </TableCell>
                        <TableCell className="px-2 py-2 capitalize text-muted-foreground">
                          {item.variant_type}
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <PriceChangeDisplay
                            oldVal={item.old_selling_price}
                            newVal={item.new_selling_price}
                            className={textClass}
                          />
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <PriceChangeDisplay
                            oldVal={item.old_dsp_price}
                            newVal={item.new_dsp_price}
                            className={textClass}
                          />
                        </TableCell>
                        <TableCell className="px-2 py-2">
                          <PriceChangeDisplay
                            oldVal={item.old_rsp_price}
                            newVal={item.new_rsp_price}
                            className={textClass}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
