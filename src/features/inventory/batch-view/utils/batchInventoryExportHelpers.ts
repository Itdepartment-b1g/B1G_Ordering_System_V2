import type { BatchInventoryGroup } from '../types';

export function buildBatchInventoryFilenamePrefix(group: BatchInventoryGroup): string {
  const batchSlug = group.batchNumber
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  const locationSlug = group.locationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 30);
  const date = new Date(group.receivedAt).toISOString().split('T')[0];
  return `batch_view_${batchSlug}_${locationSlug}_${date}`;
}
