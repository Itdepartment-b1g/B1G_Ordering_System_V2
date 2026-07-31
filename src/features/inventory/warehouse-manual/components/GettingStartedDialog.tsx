import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth";
import { useWarehouseLocationMembership } from "@/features/inventory/useWarehouseLocationMembership";
import { dismissGettingStarted } from "../utils/warehouseGettingStartedDismiss";
import GettingStartedManual from "./GettingStartedManual";

type GettingStartedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function GettingStartedDialog({
  open,
  onOpenChange,
}: GettingStartedDialogProps) {
  const { user } = useAuth();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const { membership } = useWarehouseLocationMembership({
    userId: user?.id,
    isWarehouse: user?.role === "warehouse",
  });
  const setupPath = membership.status === "sub" ? "sub" : "main";

  useEffect(() => {
    if (open) {
      setDontShowAgain(false);
    }
  }, [open]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && dontShowAgain && user?.id && user?.company_id) {
      dismissGettingStarted(user.id, user.company_id);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Getting Started</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <GettingStartedManual embedded setupPath={setupPath} />
        </div>
        <p className="text-sm text-muted-foreground pt-2 border-t">
          <Link
            to="/warehouse-manual#getting-started"
            className="text-blue-500 hover:underline"
            onClick={() => handleOpenChange(false)}
          >
            View full manual
          </Link>
        </p>
        <DialogFooter className="flex-col gap-4 sm:flex-col sm:items-stretch sm:space-x-0">
          <div className="flex items-center gap-2">
            <Checkbox
              id="getting-started-dont-show"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
            />
            <Label htmlFor="getting-started-dont-show" className="text-sm font-normal cursor-pointer">
              Don&apos;t show this again
            </Label>
          </div>
          <Button type="button" onClick={() => handleOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
