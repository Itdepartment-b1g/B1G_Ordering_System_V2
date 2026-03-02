/**
 * Normalize city name for consistent matching between client data and GeoJSON boundaries.
 * Used by WarRoomMap and WarRoomPage so both use the same keys.
 */
export function normalizeCity(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^city of\s+/i, '')
    .replace(/\s+city$/i, '');
}

/**
 * Get display city name from a GeoJSON Feature (ph-municipalities format).
 * Uses shapeName, ADM3_EN, or name - same as WarRoomMap filtering.
 */
export function getCityNameFromFeature(feature: { properties?: Record<string, unknown> }): string {
  const props = feature.properties ?? {};
  return (
    (props.shapeName as string) ||
    (props.ADM3_EN as string) ||
    (props.name as string) ||
    ''
  ).trim();
}
