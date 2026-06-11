import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useAuth } from "@/features/auth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { HubRow } from "./types";

type TeamLeaderOption = { id: string; full_name: string };

type AssignHubDialogProps = {
  hub: HubRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
};

export function AssignHubDialog({
  hub,
  open,
  onOpenChange,
  onAssigned,
}: AssignHubDialogProps) {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: leaders = [], isLoading: leadersLoading } = useQuery({
    queryKey: ["hub_assign_team_leaders", companyId],
    queryFn: async (): Promise<TeamLeaderOption[]> => {
      let q = supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "team_leader")
        .order("full_name", { ascending: true });
      if (companyId) {
        q = q.eq("company_id", companyId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TeamLeaderOption[];
    },
    enabled: open && !!hub,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (open && hub) {
      setSelectedLeaderId(hub.assigned_team_leader?.id ?? "");
    }
  }, [open, hub]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (!hub) return;
    if (!selectedLeaderId) {
      toast.error("Select a team leader");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("hubs")
        .update({ assigned_team_leader_id: selectedLeaderId })
        .eq("id", hub.id);
      if (error) throw error;
      toast.success("Hub assigned to team leader");
      onAssigned();
      handleClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not save assignment";
      toast.error("Assignment failed", { description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleUnassign = async () => {
    if (!hub) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("hubs")
        .update({ assigned_team_leader_id: null })
        .eq("id", hub.id);
      if (error) throw error;
      toast.success("Assignment removed");
      onAssigned();
      handleClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not remove assignment";
      toast.error("Unassign failed", { description: msg });
    } finally {
      setSaving(false);
    }
  };

  const hasAssignment = Boolean(hub?.assigned_team_leader?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign hub</DialogTitle>
          <DialogDescription>
            Choose a team leader for{" "}
            <span className="font-medium text-foreground">{hub?.hub_name ?? "this hub"}</span>.
            They must belong to your company.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="hub-assign-tl">Team leader</Label>
          <Select
            value={selectedLeaderId || undefined}
            onValueChange={setSelectedLeaderId}
            disabled={!hub || leadersLoading || leaders.length === 0}
          >
            <SelectTrigger id="hub-assign-tl" className="w-full">
              <SelectValue
                placeholder={
                  leadersLoading
                    ? "Loading team leaders…"
                    : leaders.length === 0
                      ? "No team leaders found"
                      : "Select team leader"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {leaders.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {hasAssignment ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => void handleUnassign()}
              >
                Unassign
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={handleClose}>
              Cancel
            </Button>
            <Button type="button" disabled={saving || !hub} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Save assignment"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
