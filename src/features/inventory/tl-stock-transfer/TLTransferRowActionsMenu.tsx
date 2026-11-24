import { ClipboardCheck, Eye, History, MoreHorizontal, PackageCheck, Printer, ThumbsDown, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = {
  onView?: () => void;
  onHistory?: () => void;
  onPrint?: () => void;
  onReceive?: () => void;
  onDispatch?: () => void;
  onReview?: () => void;
  onReject?: () => void;
};

export function TLTransferRowActionsMenu({
  onView,
  onHistory,
  onPrint,
  onReceive,
  onDispatch,
  onReview,
  onReject,
}: Props) {
  const hasWorkflow = !!(onReceive || onDispatch || onReview || onReject);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {onView ? (
          <DropdownMenuItem onClick={onView}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
        ) : null}
        {onHistory ? (
          <DropdownMenuItem onClick={onHistory}>
            <History className="mr-2 h-4 w-4" />
            View history
          </DropdownMenuItem>
        ) : null}
        {onPrint ? (
          <DropdownMenuItem onClick={onPrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </DropdownMenuItem>
        ) : null}
        {hasWorkflow ? <DropdownMenuSeparator /> : null}
        {onReceive ? (
          <DropdownMenuItem onClick={onReceive}>
            <PackageCheck className="mr-2 h-4 w-4" />
            Receive
          </DropdownMenuItem>
        ) : null}
        {onDispatch ? (
          <DropdownMenuItem onClick={onDispatch}>
            <Truck className="mr-2 h-4 w-4" />
            Dispatch
          </DropdownMenuItem>
        ) : null}
        {onReview ? (
          <DropdownMenuItem onClick={onReview}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Review
          </DropdownMenuItem>
        ) : null}
        {onReject ? (
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onReject}
          >
            <ThumbsDown className="mr-2 h-4 w-4" />
            Reject
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
