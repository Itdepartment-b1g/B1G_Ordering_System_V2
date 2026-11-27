import { formatPriceAmount } from './companyPriceChangeApi';

/** Prev = slate (outgoing), updated = green. */
export function PriceChangeDisplay({
  oldVal,
  newVal,
  className = '',
}: {
  oldVal: number;
  newVal: number;
  className?: string;
}) {
  return (
    <span className={`whitespace-nowrap font-mono tabular-nums ${className}`.trim()}>
      <span className="text-slate-500">{formatPriceAmount(oldVal)}</span>
      <span className="text-muted-foreground mx-1">→</span>
      <span className="text-green-600 font-semibold">{formatPriceAmount(newVal)}</span>
    </span>
  );
}
