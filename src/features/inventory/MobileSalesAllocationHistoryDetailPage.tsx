import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import {
  allocationTypeLabel,
  formatManilaDateTime,
  useAllocationRecordExport,
} from '@/features/sales-agents/components/super-admin-allocation-history/table/TableRow';
import { MobileSalesAllocationBrandList } from './components/MobileSalesAllocationBrandList';
import {
  fetchMyLeaderAllocations,
  MOBILE_SALES_ALLOCATION_HISTORY_QUERY_KEY,
} from './utils/fetchMyLeaderAllocations';

export default function MobileSalesAllocationHistoryDetailPage() {
  const { groupId = '' } = useParams<{ groupId: string }>();
  const { user } = useAuth();

  const { data: groups = [], isLoading, isError } = useQuery({
    queryKey: [MOBILE_SALES_ALLOCATION_HISTORY_QUERY_KEY, user?.id, user?.company_id],
    enabled: !!user?.id,
    queryFn: () => fetchMyLeaderAllocations(user!.id, user?.company_id),
  });

  const group = useMemo(
    () => groups.find((item) => item.groupId === groupId) || null,
    [groups, groupId]
  );
  const exports = useAllocationRecordExport(group);
  const totalSkus = useMemo(() => {
    const ids = new Set((group?.lines ?? []).map((line) => line.variantId || line.id));
    return ids.size;
  }, [group]);
  const { data: variantTypes = [] } = useQuery({
    queryKey: ['variant-types', user?.company_id],
    enabled: !!user?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('variant_types')
        .select('name, display_name, color_code')
        .eq('company_id', user!.company_id)
        .eq('is_active', true);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading allocation…
      </div>
    );
  }

  if (isError || !group) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/my-allocation-history">
            <ArrowLeft className="h-4 w-4" />
            Back to allocation history
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">Allocation not found</p>
            <p className="mt-1 text-sm">It may have been removed, or the link is outdated.</p>
            <Button className="mt-4" asChild>
              <Link to="/my-allocation-history">Go to Allocation History</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8 md:p-6">
      <div className="space-y-2">
        <Button variant="ghost" size="sm" className="-ml-2 gap-1.5" asChild>
          <Link to="/my-allocation-history">
            <ArrowLeft className="h-4 w-4" />
            Back to allocation history
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-[#02066F]">Allocation details</h1>
      </div>

      <dl className="overflow-hidden rounded-lg border border-[#D5DCF3] bg-white">
        {(
          [
            { label: 'Date', value: formatManilaDateTime(group.createdAt) },
            { label: 'Allocated to', value: group.allocatedToName?.trim() || '—' },
            { label: 'Allocated by', value: group.allocatedByName?.trim() || '—' },
            { label: 'Flow', value: allocationTypeLabel(group.allocationType) },
            { label: 'Total Units', value: group.totalQuantity.toLocaleString() },
            { label: 'Total SKUs', value: totalSkus.toLocaleString() },
            { label: 'Brand', value: group.brandName?.trim() || '—' },
          ] as const
        ).map((row) => (
          <div
            key={row.label}
            className="flex items-start justify-between gap-3 border-b border-[#E4E8F5] px-3.5 py-2.5 last:border-b-0"
          >
            <dt className="shrink-0 text-xs font-normal text-[#02066F]/55">{row.label}</dt>
            <dd className="min-w-0 break-words text-right text-sm font-medium leading-snug text-[#02066F]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={exports.isExporting}
          onClick={() => void exports.onExportExcel()}
        >
          {exports.isExportingExcel ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="mr-2 h-4 w-4" />
          )}
          Excel
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={exports.isExporting}
          onClick={() => void exports.onExportPdf()}
        >
          {exports.isExportingPdf ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileText className="mr-2 h-4 w-4" />
          )}
          PDF
        </Button>
      </div>

      <MobileSalesAllocationBrandList
        isLoading={false}
        groups={[group]}
        variantTypes={variantTypes}
        emptyMessage="This allocation has no product lines yet."
      />
    </div>
  );
}
