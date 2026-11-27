import { cn } from '@/lib/utils';
import type { OrderReturnedQtySummary } from './clientReturnApi';

type ReturnQtyTone = 'none' | 'pending' | 'posted' | 'mixed';

function getReturnQtyTone(summary?: OrderReturnedQtySummary | null): ReturnQtyTone {
  const posted = summary?.posted || 0;
  const pending = summary?.pending || 0;
  if (posted <= 0 && pending <= 0) return 'none';
  if (posted > 0 && pending > 0) return 'mixed';
  if (pending > 0) return 'pending';
  return 'posted';
}

const RETURN_QTY_TONE_CLASS: Record<ReturnQtyTone, string> = {
  none: 'bg-muted text-muted-foreground',
  pending: 'bg-amber-100 text-amber-800 border border-amber-200',
  posted: 'bg-rose-100 text-rose-800 border border-rose-200',
  mixed: 'bg-violet-100 text-violet-800 border border-violet-200',
};

const RETURN_QTY_LEGEND: Array<{ tone: ReturnQtyTone; label: string }> = [
  { tone: 'none', label: 'None' },
  { tone: 'pending', label: 'Pending' },
  { tone: 'posted', label: 'Posted' },
  { tone: 'mixed', label: 'Pending + Posted' },
];

export function ReturnQtyBadge({
  summary,
  onClick,
}: {
  summary?: OrderReturnedQtySummary | null;
  onClick?: () => void;
}) {
  const tone = getReturnQtyTone(summary);
  const total = summary?.total || 0;
  const title =
    tone === 'none'
      ? 'No returns'
      : tone === 'pending'
        ? `Pending ${summary?.pending || 0}`
        : tone === 'posted'
          ? `Posted ${summary?.posted || 0}`
          : `Posted ${summary?.posted || 0} · Pending ${summary?.pending || 0}`;

  const className = cn(
    'inline-flex min-w-[1.75rem] items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
    RETURN_QTY_TONE_CLASS[tone],
    onClick && total > 0 && 'underline-offset-2 hover:underline'
  );

  if (onClick && total > 0) {
    return (
      <button type="button" title={title} className={className} onClick={onClick}>
        {total}
      </button>
    );
  }

  return (
    <span title={title} className={className}>
      {total}
    </span>
  );
}

export function ReturnQtyLegend({
  className,
  label = 'Return:',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground',
        className
      )}
      aria-label="Return column legend"
    >
      <span className="font-medium text-foreground/80">{label}</span>
      {RETURN_QTY_LEGEND.map((item) => (
        <span key={item.tone} className="inline-flex items-center gap-1.5">
          <span
            className={cn('inline-block h-2.5 w-2.5 rounded-sm', RETURN_QTY_TONE_CLASS[item.tone])}
            aria-hidden
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
