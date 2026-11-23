import type { GroupedRequest, Request } from '../requestHooks';

export function variantTypeLabel(type: string | null | undefined): string | null {
  if (!type?.trim()) return null;
  const key = type.trim().toLowerCase();
  if (key === 'flavor') return 'Flavor';
  if (key === 'battery') return 'Battery';
  if (key === 'foc') return 'FOC';
  if (key === 'posm') return 'POSM';
  if (key === 'ncv') return 'NCV';
  return type;
}

export function variantTypeBadgeClass(type: string | null | undefined): string {
  if (!type) return '';
  const key = type.trim().toLowerCase();
  if (key === 'flavor') return 'border-purple-300 bg-purple-100 text-purple-800';
  if (key === 'battery') return 'border-green-300 bg-green-100 text-green-800';
  if (key === 'foc') return 'border-orange-300 bg-orange-100 text-orange-800';
  if (key === 'posm') return 'border-blue-300 bg-blue-100 text-blue-800';
  if (key === 'ncv') return 'border-slate-300 bg-slate-100 text-slate-800';
  return '';
}

export function groupStockRequestLinesByBrand(requests: Request[]) {
  const byBrand = new Map<string, Request[]>();
  for (const req of requests) {
    const brand = req.variant?.brand?.name?.trim() || 'Unknown brand';
    const list = byBrand.get(brand) ?? [];
    list.push(req);
    byBrand.set(brand, list);
  }

  return [...byBrand.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(([brand, items]) => {
      const byType = new Map<string, Request[]>();
      for (const req of items) {
        const type = variantTypeLabel(req.variant?.variant_type) || 'Other';
        const list = byType.get(type) ?? [];
        list.push(req);
        byType.set(type, list);
      }
      return {
        brand,
        types: [...byType.entries()]
          .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
          .map(([type, typeItems]) => ({
            type,
            variantType: typeItems[0]?.variant?.variant_type ?? null,
            items: [...typeItems].sort((a, b) =>
              (a.variant?.name || '').localeCompare(b.variant?.name || '', undefined, {
                sensitivity: 'base',
              })
            ),
          })),
      };
    });
}

export function groupMyStockRequests(requests: Request[]): GroupedRequest[] {
  const groups: { [key: string]: Request[] } = {};

  requests.forEach((request) => {
    const key =
      request.request_number ||
      `${new Date(request.requested_at).getTime()}-${request.requester_notes || 'no-notes'}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(request);
  });

  return Object.entries(groups)
    .map(([key, groupRequests]) => {
      const firstRequest = groupRequests[0];
      const allSameStatus = groupRequests.every((r) => r.status === firstRequest.status);
      return {
        id: key,
        requested_at: firstRequest.requested_at,
        status: allSameStatus ? firstRequest.status : 'mixed',
        productCount: groupRequests.length,
        totalQuantity: groupRequests.reduce((sum, r) => sum + r.requested_quantity, 0),
        requests: groupRequests,
        requester_notes: firstRequest.requester_notes,
      } satisfies GroupedRequest;
    })
    .sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());
}

export function formatStockRequestWhen(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}
