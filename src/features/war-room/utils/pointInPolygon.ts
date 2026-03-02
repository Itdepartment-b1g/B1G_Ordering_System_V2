import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

/** GeoJSON Feature with Polygon or MultiPolygon geometry (ph-municipalities format). */
type PolygonFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

/**
 * Test if a [lat, lng] point is inside a GeoJSON Feature's geometry.
 * Feature geometry can be Polygon or MultiPolygon (ph-municipalities format).
 * Coordinates: client uses (latitude, longitude); GeoJSON is [lng, lat].
 */
export function isPointInFeature(
  latitude: number,
  longitude: number,
  feature: PolygonFeature
): boolean {
  const geom = feature.geometry;
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
    return false;
  }
  // Turf expects [longitude, latitude]
  const pt = point([longitude, latitude]);
  return booleanPointInPolygon(pt, feature);
}
