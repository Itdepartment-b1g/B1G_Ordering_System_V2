import { useState } from "react";
import { Link } from "react-router-dom";
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
  const [open, setOpen] = useState(false);

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
