import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/features/auth";
import { useWarehouseLocationMembership } from "@/features/inventory/useWarehouseLocationMembership";
import GettingStartedManual from "./GettingStartedManual";

type PageGettingStartedDialogProps = {
  fullManualHref?: string;
};

export default function PageGettingStartedDialog({
  fullManualHref = "/warehouse-manual#getting-started",
}: PageGettingStartedDialogProps) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.get("getting-started") === "1");
  const { membership } = useWarehouseLocationMembership({
    userId: user?.id,
    isWarehouse: user?.role === "warehouse",
  });
  const setupPath = membership.status === "sub" ? "sub" : "main";

  useEffect(() => {
    if (searchParams.get("getting-started") !== "1") return;
    setOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("getting-started");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Compass className="h-4 w-4 mr-2" />
          Getting Started
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Getting Started</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <GettingStartedManual embedded setupPath={setupPath} />
        </div>
        {fullManualHref ? (
          <p className="text-sm text-muted-foreground pt-2 border-t">
            <Link
              to={fullManualHref}
              className="text-blue-500 hover:underline"
              onClick={() => setOpen(false)}
            >
              View full manual
            </Link>
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
