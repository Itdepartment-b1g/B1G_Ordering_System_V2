import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CLIENT_RETURN_STOCK_FATE_META,
  clientReturnStockFateBadgeClass,
  type ClientReturnStockFate,
} from './clientReturnPreview';

export function ClientReturnStockFateBadge({
  fate,
  qty,
  showDescription = false,
  className,
}: {
  fate: ClientReturnStockFate;
  qty?: number;
  showDescription?: boolean;
  className?: string;
}) {
  const meta = CLIENT_RETURN_STOCK_FATE_META[fate];
  const title = qty == null ? meta.label : `${meta.label} ${qty}`;

  if (!showDescription) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'font-normal text-[11px] px-1.5 py-0 h-5',
          clientReturnStockFateBadgeClass(fate),
          className
        )}
      >
        {title}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-auto w-max max-w-none rounded-md font-normal px-3 py-2 flex flex-col items-start gap-0.5',
        clientReturnStockFateBadgeClass(fate),
        className
      )}
    >
      <span className="text-[11px] font-medium leading-tight whitespace-nowrap">{title}</span>
      <span className="text-[10px] font-normal leading-snug opacity-80 whitespace-nowrap">
        {meta.description}
      </span>
    </Badge>
  );
}

export function ClientReturnStockFateLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground space-y-1.5',
        className
      )}
    >
      {(Object.keys(CLIENT_RETURN_STOCK_FATE_META) as ClientReturnStockFate[]).map((fate) => {
        const meta = CLIENT_RETURN_STOCK_FATE_META[fate];
        return (
          <p key={fate}>
            <span className="font-medium text-foreground">{meta.legendLabel}</span>
            {' — '}
            {meta.description}
          </p>
        );
      })}
    </div>
  );
}
