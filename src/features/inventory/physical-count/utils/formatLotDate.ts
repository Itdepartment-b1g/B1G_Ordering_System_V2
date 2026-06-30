import { format } from 'date-fns';

export function formatLotDate(date: string | null | undefined): string {
  if (!date) return '—';
  return format(new Date(date), 'MMM d, yyyy');
}

export function formatLotExpirationLabel(
  expirationDate: string | null | undefined,
  quantityRemaining?: number
): string {
  const exp = expirationDate ? `exp ${formatLotDate(expirationDate)}` : 'no expiry';
  if (quantityRemaining != null) {
    return `${exp} · ${quantityRemaining} remaining`;
  }
  return exp;
}
