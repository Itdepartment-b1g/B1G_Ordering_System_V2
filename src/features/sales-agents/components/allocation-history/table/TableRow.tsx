import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { AllocationHistoryGroup } from '../utils/allocationHistoryMappers';

export function formatManilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function allocationTypeLabel(type: AllocationHistoryGroup['allocationType']): string {
  return type === 'leader_to_agent' ? 'Leader to Agent' : 'Main to Leader';
}

function variantTypeLabel(type: string | null): string | null {
  if (!type) return null;
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'Flavor';
  if (normalized === 'battery') return 'Battery';
  if (normalized === 'foc') return 'FOC';
  return type;
}

function variantTypeBadgeClass(type: string | null): string {
  if (!type) return '';
  const normalized = type.trim().toLowerCase();
  if (normalized === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (normalized === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (normalized === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  return '';
}

export function AllocationGroupRow({ group }: { group: AllocationHistoryGroup }) {
  const [open, setOpen] = useState(false);
  const missingLines = group.lineCount === 0;

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen((v) => !v)}>
        <TableCell className="w-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={open ? 'Collapse variants' : 'Expand variants'}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">{formatManilaDateTime(group.createdAt)}</TableCell>
        <TableCell className="font-medium">{group.allocatedToName}</TableCell>
        <TableCell>
          <Badge variant="secondary">{allocationTypeLabel(group.allocationType)}</Badge>
        </TableCell>
        <TableCell className="text-muted-foreground">{group.brandName ?? '—'}</TableCell>
        <TableCell className="text-muted-foreground">{group.allocatedByName}</TableCell>
        <TableCell className="text-right tabular-nums">
          {missingLines ? (
            <Badge variant="outline" className="font-normal text-amber-700">
              No lines
            </Badge>
          ) : (
            group.lineCount
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums font-medium">
          {group.totalQuantity.toLocaleString()}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
          <TableCell colSpan={8} className="p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Variants in this session
            </p>
            {missingLines ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This session has no linked inventory transactions. New allocations from{' '}
                  <span className="font-medium">Stock Allocations</span> should show variant lines
                  after the database migration is applied.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.brandName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{line.variantName}</span>
                            {variantTypeLabel(line.variantType) && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${variantTypeBadgeClass(line.variantType)}`}
                              >
                                {variantTypeLabel(line.variantType)}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.quantity.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
