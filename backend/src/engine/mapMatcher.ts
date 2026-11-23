import type { Direction, RawVehiclePing } from "@recreo/shared";
import {
  bearingCosineSimilarity,
  bearingDegrees,
  projectPointOntoPolyline
} from "./geo.js";
import type { IndexedRoute, RouteStore } from "./routeStore.js";

export const MAX_SNAP_DISTANCE_METERS = 60;

export interface MatchResult {
  route: IndexedRoute;
  direction: Direction;
  lat: number;
  lon: number;
  bearingDeg: number;
  routeProgressMeters: number;
  snappedToRoute: boolean;
}

export interface PreviousPingHint {
  lat: number;
  lon: number;
  direction?: Direction;
}

/**
 * Matches a raw GPS ping to the best route polyline for its lineCode,
 * disambiguating inbound/outbound directions via bearing similarity.
 */
export function matchPingToRoute(
  ping: RawVehiclePing,
  store: RouteStore,
  prevHint?: PreviousPingHint
): MatchResult | null {
  const candidates = store.findRoutesByLine(ping.lineCode);
  if (candidates.length === 0) return null;

  const estimatedBearing =
    ping.rawBearingDeg ??
    (prevHint ? bearingDegrees({ lat: prevHint.lat, lon: prevHint.lon }, ping) : undefined);

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCandidate: IndexedRoute = candidates[0];
  let bestProj = projectPointOntoPolyline(ping, candidates[0].polyline);

  for (const candidate of candidates) {
    const proj = projectPointOntoPolyline(ping, candidate.polyline);
    // Lower distance is better; bearing alignment breaks ties on overlapping streets.
    let score = -proj.distanceMeters;
    if (estimatedBearing !== undefined) {
      const cos = bearingCosineSimilarity(estimatedBearing, proj.bearingDeg);
      score += cos * 40;
    }
    if (candidate.branch === ping.branch) {
      score += 15;
    }
    if (prevHint?.direction === candidate.direction) {
      score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
      bestProj = proj;
    }
  }

  const snappedToRoute = bestProj.distanceMeters <= MAX_SNAP_DISTANCE_METERS;
  return {
    route: bestCandidate,
    direction: bestCandidate.direction,
    lat: snappedToRoute ? bestProj.snapped.lat : ping.lat,
    lon: snappedToRoute ? bestProj.snapped.lon : ping.lon,
    bearingDeg: estimatedBearing ?? bestProj.bearingDeg,
    routeProgressMeters: bestProj.progressMeters,
    snappedToRoute
  };
}
