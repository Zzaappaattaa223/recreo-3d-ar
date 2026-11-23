const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

export const OBSERVER_EYE_HEIGHT_M = 1.5;
export const ROUTE_LINE_ELEVATION_M = 4.0;

export interface EnuCoords {
  east: number;
  north: number;
  up: number;
}

/**
 * Converts target (lat, lon) relative to user (lat, lon) into local ENU meters
 * using local equirectangular projection (< 0.1% lateral error within 5 km).
 */
export function latLonToEnu(
  origin: { lat: number; lon: number },
  target: { lat: number; lon: number },
  targetGroundOffsetM = 0
): EnuCoords {
  const cosLat = Math.cos(origin.lat * DEG_TO_RAD);
  const east = (target.lon - origin.lon) * DEG_TO_RAD * EARTH_RADIUS_M * cosLat;
  const north = (target.lat - origin.lat) * DEG_TO_RAD * EARTH_RADIUS_M;
  const up = targetGroundOffsetM - OBSERVER_EYE_HEIGHT_M;
  return { east, north, up };
}
