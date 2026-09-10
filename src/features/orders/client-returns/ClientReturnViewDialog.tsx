import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getMockReturnLineQty, type MockClientReturn } from './clientReturnMock';
import { BrandReturnedTable, groupLinesByBrand } from './ClientReturnBrandTable';
import { ClientReturnExpandedMeta } from './ClientReturnExpandedMeta';

type ClientReturnViewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: MockClientReturn | null;
};

export function ClientReturnViewDialog({ open, onOpenChange, row }: ClientReturnViewDialogProps) {
  const qty = row ? getMockReturnLineQty(row) : 0;
  const brandGroups = row ? groupLinesByBrand(row.lines) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-rose-600" />
            <span className="font-mono">{row?.returnNumber || 'Return'}</span>
          </DialogTitle>
          <DialogDescription>
            {row ? (
              <>
                {row.orderNumber} · {row.clientName} · {qty} unit{qty === 1 ? '' : 's'}
              </>
            ) : (
              'Return details'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          {row ? (
            <>
              <ClientReturnExpandedMeta row={row} />
              {brandGroups.map((group) => (
                <BrandReturnedTable key={group.brandName} brandName={group.brandName} variants={group.variants} />
              ))}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
