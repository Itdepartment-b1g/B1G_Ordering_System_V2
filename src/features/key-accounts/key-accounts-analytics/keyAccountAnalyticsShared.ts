export function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Same definition as Product Analytics on Key Account Analytics page. */
export function isDeliveredKeyAccountOrder(order: {
  status?: string | null;
  workflow_status?: string | null;
}): boolean {
  return order.status === 'fulfilled' && order.workflow_status === 'delivered';
}
