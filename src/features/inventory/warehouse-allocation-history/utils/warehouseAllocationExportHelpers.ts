export function buildWarehouseAllocationFilenamePrefix(group: {
  locationName: string;
  createdAt: string;
}): string {
  const slug = group.locationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  const date = new Date(group.createdAt).toISOString().split('T')[0];
  return `warehouse_allocation_${slug}_${date}`;
}
