import { useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type TeamLeaderOption = {
  id: string;
  full_name: string;
};

type PoTeamLeaderSelectProps = {
  companyId: string | null | undefined;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  enabled?: boolean;
};

export function PoTeamLeaderSelect({
  companyId,
  value,
  onValueChange,
  disabled = false,
  enabled = true,
}: PoTeamLeaderSelectProps) {
  const { data: leaders = [], isLoading } = useQuery({
    queryKey: ['po_create_team_leaders', companyId],
    queryFn: async (): Promise<TeamLeaderOption[]> => {
      let query = supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'team_leader')
        .order('full_name', { ascending: true });

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TeamLeaderOption[];
    },
    enabled: enabled && !!companyId,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
        Receiving team leader
      </Label>
      <Select
        value={value || undefined}
        onValueChange={onValueChange}
        disabled={disabled || isLoading || leaders.length === 0}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              isLoading
                ? 'Loading team leaders…'
                : leaders.length === 0
                  ? 'No team leaders found'
                  : 'Select team leader'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {leaders.map((leader) => (
            <SelectItem key={leader.id} value={leader.id}>
              {leader.full_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        This team leader will confirm receipt when the warehouse dispatches this PO.
      </p>
    </div>
  );
}
