import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import { useSuperAdminAllocationHistory } from '@/features/sales-agents/components/super-admin-allocation-history/hooks/useSuperAdminAllocationHistory';
import {
  formatManilaDateTime,
  useAllocationRecordExport,
} from '@/features/sales-agents/components/super-admin-allocation-history/table/TableRow';
import { MobileSalesAllocationBrandList } from '@/features/inventory/components/MobileSalesAllocationBrandList';
import { useTeamLeaderAgentIds } from '@/features/team-leader/hooks/useTeamLeaderAgentIds';
import { filterLeaderAllocationGroups } from '../components/allocation-history/leaderAllocationGroups';

export default function LeaderAllocationHistoryDetailPage() {
  const { groupId = '' } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const { data: allGroups = [], isLoading, isError } = useSuperAdminAllocationHistory();
  const { data: teamAgentIds = [], isLoading: isLoadingTeamAgents } = useTeamLeaderAgentIds();
  const group = useMemo(
    () =>
      filterLeaderAllocationGroups(allGroups, user?.id, teamAgentIds).find(
        (item) => item.groupId === groupId
      ) || null,
    [allGroups, groupId, teamAgentIds, user?.id]
  );
  const exports = useAllocationRecordExport(group);
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

  if (isLoading || isLoadingTeamAgents) {
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
          <Link to="/leader-allocation-history">
            <ArrowLeft className="h-4 w-4" />
            Back to allocation history
          </Link>
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p className="font-medium text-foreground">Allocation not found</p>
            <p className="mt-1 text-sm">It may have been removed, or the link is outdated.</p>
            <Button className="mt-4" asChild>
              <Link to="/leader-allocation-history">Go to Allocation History</Link>
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
          <Link to="/leader-allocation-history">
            <ArrowLeft className="h-4 w-4" />
            Back to allocation history
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#02066F]">Allocation details</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            From {group.allocatedByName} · {formatManilaDateTime(group.createdAt)}
          </p>
        </div>
      </div>

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
