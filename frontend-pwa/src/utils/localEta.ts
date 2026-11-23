import type { Stop, VehicleState } from "@recreo/shared";

export const FALLBACK_SPEED_MPS = 6.94; // 25 km/h
const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

export interface EtaEstimate {
  distanceMeters: number;
  etaSeconds: number | null;
  passedStop: boolean;
}

export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Computes remaining distance along route and ETA from a vehicle to a selected stop.
 */
export function estimateStopEta(vehicle: VehicleState, stop: Stop): EtaEstimate {
  if (vehicle.direction === stop.direction) {
    const remaining = stop.distanceAlongRouteMeters - vehicle.routeProgressMeters;
    if (remaining < -30) {
      return {
        distanceMeters: Math.round(haversineMeters(vehicle, stop)),
        etaSeconds: null,
        passedStop: true
      };
    }
    const clampedRemaining = Math.max(0, remaining);
    const speed = vehicle.speedMps >= 1 ? vehicle.speedMps : FALLBACK_SPEED_MPS;
    return {
      distanceMeters: Math.round(clampedRemaining),
      etaSeconds: Math.round(clampedRemaining / speed),
      passedStop: false
    };
  }

  // Different direction: report straight-line distance without route-based ETA
  return {
    distanceMeters: Math.round(haversineMeters(vehicle, stop)),
    etaSeconds: null,
    passedStop: false
  };
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function formatEta(etaSeconds: number | null): string {
  if (etaSeconds === null) return "—";
  if (etaSeconds < 60) return "< 1 min";
  return `~${Math.round(etaSeconds / 60)} min`;
}

export function lerpPose(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  alpha: number
): { lat: number; lon: number } {
  const t = Math.max(0, Math.min(1, alpha));
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lon: from.lon + (to.lon - from.lon) * t
  };
}
