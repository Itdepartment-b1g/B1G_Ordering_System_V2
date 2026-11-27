/** Deep-link helpers for Stock Movements filters. */

export function buildStockMovementsPath(opts?: {
  brandId?: string | null;
  variantId?: string | null;
  /** Filter to movements that touch this agent's inventory. */
  agentId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts?.brandId) params.set('brandId', opts.brandId);
  if (opts?.variantId) params.set('variantId', opts.variantId);
  if (opts?.agentId) params.set('agentId', opts.agentId);
  const query = params.toString();
  return query ? `/inventory/stock-movements?${query}` : '/inventory/stock-movements';
}
