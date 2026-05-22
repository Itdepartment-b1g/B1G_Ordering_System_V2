import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type WarehouseGroupedPoItem = {
  id: string;
  brand_name?: string;
  variant_name?: string;
  variant_type?: string;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  warehouse_location_id?: string | null;
};

type LocationMeta = { name: string; is_main?: boolean };

interface PurchaseOrderItemsByWarehouseProps {
  items: WarehouseGroupedPoItem[];
  headerWarehouseLocationId?: string | null;
  /** location id → display name (and optional is_main via locationMetaById) */
  locationNamesById?: Record<string, string>;
  locationMetaById?: Record<string, LocationMeta>;
  emptyMessage?: string;
}

function locationLabel(
  locId: string,
  locationNamesById: Record<string, string>,
  locationMetaById: Record<string, LocationMeta>
): string {
  if (locId === 'unknown') return 'Warehouse';
  const meta = locationMetaById[locId];
  const name = meta?.name || locationNamesById[locId];
  if (!name) return 'Warehouse';
  return `${name}${meta?.is_main ? ' (Main)' : ''}`;
}

function variantTypeBadgeClass(variantType: string) {
  const t = String(variantType || '').toLowerCase();
  if (t === 'flavor') return 'bg-blue-100 text-blue-700';
  if (t === 'battery') return 'bg-green-100 text-green-700';
  return 'bg-purple-100 text-purple-700';
}

export function PurchaseOrderItemsByWarehouse({
  items,
  headerWarehouseLocationId,
  locationNamesById = {},
  locationMetaById = {},
  emptyMessage = 'No items found.',
}: PurchaseOrderItemsByWarehouseProps) {
  if (!items.length) {
    return <p className="text-muted-foreground text-center py-4">{emptyMessage}</p>;
  }

  const byLoc: Record<string, WarehouseGroupedPoItem[]> = {};
  for (const it of items) {
    const locId = String(it.warehouse_location_id || headerWarehouseLocationId || 'unknown');
    (byLoc[locId] ||= []).push(it);
  }

  const sortedLocIds = Object.keys(byLoc).sort((a, b) =>
    locationLabel(a, locationNamesById, locationMetaById).localeCompare(
      locationLabel(b, locationNamesById, locationMetaById)
    )
  );

  return (
    <Accordion type="multiple" className="w-full">
      {sortedLocIds.map((locId) => {
        const locItems = byLoc[locId] || [];
        const byBrand: Record<string, WarehouseGroupedPoItem[]> = {};
        for (const it of locItems) {
          (byBrand[String(it.brand_name || 'Unknown')] ||= []).push(it);
        }
        const brandNames = Object.keys(byBrand).sort((a, b) => a.localeCompare(b));

        return (
          <AccordionItem key={locId} value={`wh-items-${locId}`} className="border rounded-md px-3">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center justify-between w-full pr-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">
                    {locationLabel(locId, locationNamesById, locationMetaById)}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {locItems.length} items
                  </Badge>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pt-2 pb-1">
                {brandNames.map((brand) => {
                  const brandItems = (byBrand[brand] || []).slice().sort((a, b) => {
                    const ta = String(a.variant_type || '');
                    const tb = String(b.variant_type || '');
                    if (ta !== tb) return ta.localeCompare(tb);
                    return String(a.variant_name || '').localeCompare(String(b.variant_name || ''));
                  });

                  return (
                    <div key={brand} className="border rounded-md overflow-hidden">
                      <div className="px-3 py-2 bg-muted/40 flex items-center justify-between">
                        <span className="font-semibold text-sm">{brand}</span>
                        <span className="text-xs text-muted-foreground">
                          {brandItems.reduce((sum, x) => sum + Number(x.quantity || 0), 0)} units
                        </span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Variant</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {brandItems.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">{item.variant_name || '—'}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={variantTypeBadgeClass(String(item.variant_type || ''))}
                                >
                                  {String(item.variant_type || '—').toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{item.quantity}</TableCell>
                              <TableCell className="text-right">
                                ₱{Number(item.unit_price || 0).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                ₱{Number(item.total_price || 0).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
