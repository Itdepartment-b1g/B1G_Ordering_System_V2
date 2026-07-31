import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Book } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type PageManualDialogProps = {
  title: string;
  children: React.ReactNode;
  fullManualHref?: string;
};

export default function PageManualDialog({
  title,
  children,
  fullManualHref,
}: PageManualDialogProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.get("manual") === "1");

  useEffect(() => {
    if (searchParams.get("manual") !== "1") return;
    setOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("manual");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Book className="h-4 w-4 mr-2" />
          Manual Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">{children}</div>
        {fullManualHref && (
          <p className="text-sm text-muted-foreground pt-2 border-t">
            <Link
              to={fullManualHref}
              className="text-blue-500 hover:underline"
              onClick={() => setOpen(false)}
            >
              View full manual
            </Link>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
