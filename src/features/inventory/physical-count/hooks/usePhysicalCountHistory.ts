import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

import type { PhysicalCountHistoryDetail, PhysicalCountHistoryRow } from '../types';

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function usePhysicalCountHistory({
  companyId,
  locationId,
  isMainWarehouseUser,
  enabled,
}: {
  companyId?: string;
  locationId?: string | null;
  isMainWarehouseUser: boolean;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ['physical-count-history', companyId, locationId, isMainWarehouseUser],
    enabled: enabled && !!companyId,
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async (): Promise<PhysicalCountHistoryRow[]> => {
      let query = supabase
        .from('physical_count_sessions')
        .select(
          `
          id,
          counted_at,
          created_at,
          signature_url,
          signature_path,
          notes,
          performed_by,
          performed_by_name,
          batch:inventory_batches ( id, batch_number ),
          warehouse_location:warehouse_locations ( id, name, is_main ),
          performed_by_user:profiles!physical_count_sessions_performed_by_fkey ( id, full_name ),
          physical_count_lines ( variance )
        `
        )
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false });

      if (!isMainWarehouseUser && locationId) {
        query = query.eq('warehouse_location_id', locationId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((raw) => {
        const row = raw as Record<string, unknown>;
        const lines = (row.physical_count_lines as Array<{ variance: number }>) ?? [];
        return {
          id: row.id as string,
          counted_at: row.counted_at as string,
          created_at: row.created_at as string,
          signature_url: row.signature_url as string,
          signature_path: row.signature_path as string,
          notes: row.notes as string | null,
          batch: firstRelation(row.batch as PhysicalCountHistoryRow['batch']),
          warehouse_location: firstRelation(
            row.warehouse_location as PhysicalCountHistoryRow['warehouse_location']
          ),
          performed_by: (row.performed_by as string | null) ?? null,
          performed_by_name: (row.performed_by_name as string | null) ?? null,
          performed_by_user: firstRelation(
            row.performed_by_user as PhysicalCountHistoryRow['performed_by_user']
          ),
          line_count: lines.length,
          total_variance: lines.reduce((sum, l) => sum + (l.variance ?? 0), 0),
        } satisfies PhysicalCountHistoryRow;
      });
    },
  });
}

export function usePhysicalCountSessionDetail(sessionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['physical-count-session-detail', sessionId],
    enabled: enabled && !!sessionId,
    queryFn: async (): Promise<PhysicalCountHistoryDetail | null> => {
      const { data, error } = await supabase
        .from('physical_count_sessions')
        .select(
          `
          id,
          counted_at,
          created_at,
          signature_url,
          signature_path,
          notes,
          performed_by,
          performed_by_name,
          batch:inventory_batches ( id, batch_number ),
          warehouse_location:warehouse_locations ( id, name, is_main ),
          performed_by_user:profiles!physical_count_sessions_performed_by_fkey ( id, full_name ),
          physical_count_lines (
            id,
            brand_name,
            variant_name,
            expiration_date,
            system_qty_snapshot,
            physical_qty,
            box_count,
            units_per_box,
            variance
          )
        `
        )
        .eq('id', sessionId!)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as Record<string, unknown>;
      const lines = (row.physical_count_lines as PhysicalCountHistoryDetail['lines']) ?? [];

      return {
        id: row.id as string,
        counted_at: row.counted_at as string,
        created_at: row.created_at as string,
        signature_url: row.signature_url as string,
        signature_path: row.signature_path as string,
        notes: row.notes as string | null,
        batch: firstRelation(row.batch as PhysicalCountHistoryRow['batch']),
        warehouse_location: firstRelation(
          row.warehouse_location as PhysicalCountHistoryRow['warehouse_location']
        ),
        performed_by: (row.performed_by as string | null) ?? null,
        performed_by_name: (row.performed_by_name as string | null) ?? null,
        performed_by_user: firstRelation(
          row.performed_by_user as PhysicalCountHistoryRow['performed_by_user']
        ),
        line_count: lines.length,
        total_variance: lines.reduce((sum, l) => sum + (l.variance ?? 0), 0),
        lines: [...lines].sort((a, b) => a.brand_name.localeCompare(b.brand_name)),
      };
    },
  });
}
