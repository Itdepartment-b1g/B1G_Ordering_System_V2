import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/lib/supabase';
import type { AgentAttendance } from '@/types/database.types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type AttendanceEditRow = AgentAttendance & {
  agent: {
    id: string;
    full_name: string;
    email: string;
    role: string;
    company_id: string | null;
  } | null;
  hub: { id: string; hub_name: string } | null;
};

type HubOption = {
  id: string;
  hub_name: string;
};

function isoToDatetimeLocalManila(iso: string | null | undefined, fallbackDate: string): string {
  if (!iso) {
    return `${fallbackDate}T10:00`;
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function datetimeLocalManilaToIso(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}

function formatManilaBusinessDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00+08:00`).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

type RpcResult = { success: boolean; message?: string };

export function canSuperAdminEditAttendance(
  isSuperAdmin: boolean,
  row: AttendanceEditRow
): boolean {
  return (
    isSuperAdmin &&
    row.agent?.role === 'mobile_sales' &&
    (row.status === 'absent' || row.status === 'present')
  );
}

type AdminAttendanceEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: AttendanceEditRow | null;
  companyId: string | null;
};

export function AdminAttendanceEditDialog({
  open,
  onOpenChange,
  row,
  companyId,
}: AdminAttendanceEditDialogProps) {
  const queryClient = useQueryClient();
  const [hubId, setHubId] = useState('');
  const [timeInLocal, setTimeInLocal] = useState('');
  const [timeOutLocal, setTimeOutLocal] = useState('');
  const [note, setNote] = useState('');

  const businessDate = row?.business_date ?? '';

  const { data: hubs = [], isLoading: hubsLoading } = useQuery({
    queryKey: ['admin_attendance_edit_hubs', companyId],
    enabled: open && !!companyId,
    queryFn: async (): Promise<HubOption[]> => {
      const { data, error } = await supabase
        .from('hubs')
        .select('id, hub_name')
        .order('hub_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as HubOption[];
    },
  });

  useEffect(() => {
    if (!open || !row) return;
    setHubId(row.hub_id ?? '');
    setTimeInLocal(isoToDatetimeLocalManila(row.time_in, row.business_date));
    setTimeOutLocal(row.time_out ? isoToDatetimeLocalManila(row.time_out, row.business_date) : '');
    setNote(
      row.status === 'absent'
        ? 'Agent forgot to time in.'
        : row.note?.trim() ?? ''
    );
  }, [open, row]);

  useEffect(() => {
    if (!open || hubId || hubs.length === 0) return;
    setHubId(hubs[0].id);
  }, [open, hubId, hubs]);

  const title = useMemo(() => {
    if (!row) return 'Edit attendance';
    if (row.status === 'absent') return 'Record time in (admin correction)';
    return 'Edit attendance times';
  }, [row]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!row) throw new Error('No attendance selected');
      if (!hubId) throw new Error('Select a hub');
      if (!timeInLocal.trim()) throw new Error('Time in is required');
      if (!note.trim()) throw new Error('A correction note is required');

      const timeInIso = datetimeLocalManilaToIso(timeInLocal);
      const timeOutIso = timeOutLocal.trim() ? datetimeLocalManilaToIso(timeOutLocal) : null;

      const { data, error } = await supabase.rpc('super_admin_correct_agent_attendance', {
        p_attendance_id: row.id,
        p_hub_id: hubId,
        p_time_in: timeInIso,
        p_time_out: timeOutIso,
        p_note: note.trim(),
      });

      if (error) throw error;

      const result = data as RpcResult | null;
      if (!result?.success) {
        throw new Error(result?.message ?? 'Could not save attendance correction');
      }
    },
    onSuccess: () => {
      toast.success('Attendance updated');
      void queryClient.invalidateQueries({ queryKey: ['agent_attendance_overview'] });
      void queryClient.invalidateQueries({ queryKey: ['agent_attendance_computed_hours'] });
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Could not save attendance correction';
      toast.error(msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {row ? (
              <>
                {row.agent?.full_name ?? 'Agent'} · {formatManilaBusinessDateLabel(row.business_date)}
              </>
            ) : (
              'Correct attendance for a mobile sales agent who forgot to time in.'
            )}
          </DialogDescription>
        </DialogHeader>

        {row?.status === 'absent' ? (
          <Alert>
            <AlertDescription>
              This day is marked absent. Saving will record the agent as present with the times below.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4 py-1">
          {/* <div className="space-y-2">
            <Label htmlFor="admin-att-hub">Hub</Label>
            <Select value={hubId} onValueChange={setHubId} disabled={hubsLoading || hubs.length === 0}>
              <SelectTrigger id="admin-att-hub">
                <SelectValue placeholder={hubsLoading ? 'Loading hubs…' : 'Select hub'} />
              </SelectTrigger>
              <SelectContent>
                {hubs.map(hub => (
                  <SelectItem key={hub.id} value={hub.id}>
                    {hub.hub_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div> */}

          <div className="space-y-2">
            <Label htmlFor="admin-att-time-in">Time in (Manila)</Label>
            <Input
              id="admin-att-time-in"
              type="datetime-local"
              value={timeInLocal}
              onChange={event => setTimeInLocal(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="admin-att-time-out">Time out (Manila, optional)</Label>
            <Input
              id="admin-att-time-out"
              type="datetime-local"
              value={timeOutLocal}
              onChange={event => setTimeOutLocal(event.target.value)}
            />
          </div>

          {/* <div className="space-y-2">
            <Label htmlFor="admin-att-note">Correction note</Label>
            <Textarea
              id="admin-att-note"
              rows={3}
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="Why this attendance is being corrected…"
            />
          </div> */}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || hubsLoading || !hubId}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save correction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
