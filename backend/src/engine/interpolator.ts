import type { RawVehiclePing, VehicleState } from "@recreo/shared";
import { BlindZoneHeuristic, type BlindZoneContext } from "./blindZoneHeuristic.js";
import { pointAtProgress } from "./geo.js";
import { matchPingToRoute } from "./mapMatcher.js";
import type { IndexedRoute, RouteStore } from "./routeStore.js";

export const MAX_EXTRAPOLATION_SEC = 45;
export const DEFAULT_FALLBACK_SPEED_MPS = 8.3;

interface TrackedVehicle {
  lastPing: RawVehiclePing;
  prevPing?: RawVehiclePing;
  route: IndexedRoute;
  baseProgressMeters: number;
  speedMps: number;
  bearingDeg: number;
  snappedToRoute: boolean;
}

export class VehicleInterpolator {
  private readonly store: RouteStore;
  private readonly blindZone: BlindZoneHeuristic;
  private readonly tracked = new Map<string, TrackedVehicle>();

  constructor(store: RouteStore, blindZone: BlindZoneHeuristic) {
    this.store = store;
    this.blindZone = blindZone;
  }

  ingestPings(pings: RawVehiclePing[]): void {
    for (const ping of pings) {
      const existing = this.tracked.get(ping.vehicleId);
      if (existing && ping.reportedAtMs < existing.lastPing.reportedAtMs) {
        continue; // Ignore out-of-order stale ping
      }

      const prevHint = existing
        ? {
            lat: existing.lastPing.lat,
            lon: existing.lastPing.lon,
            direction: existing.route.direction
          }
        : undefined;

      const match = matchPingToRoute(ping, this.store, prevHint);
      if (!match) continue;

      let speedMps = ping.rawSpeedMps;
      if (speedMps === undefined && existing && existing.route.direction === match.direction) {
        const dtSec = (ping.reportedAtMs - existing.lastPing.reportedAtMs) / 1000;
        if (dtSec > 0.5) {
          const deltaM = match.routeProgressMeters - existing.baseProgressMeters;
          speedMps = Math.max(0, deltaM / dtSec);
        }
      }

      this.tracked.set(ping.vehicleId, {
        lastPing: ping,
        prevPing: existing?.lastPing,
        route: match.route,
        baseProgressMeters: match.routeProgressMeters,
        speedMps: speedMps ?? existing?.speedMps ?? DEFAULT_FALLBACK_SPEED_MPS,
        bearingDeg: match.bearingDeg,
        snappedToRoute: match.snappedToRoute
      });
    }
  }

  getStatesAt(
    nowMs: number,
    lineCode?: RawVehiclePing["lineCode"],
    context?: Partial<BlindZoneContext>
  ): VehicleState[] {
    const states: VehicleState[] = [];

    for (const entry of this.tracked.values()) {
      if (lineCode && entry.lastPing.lineCode !== lineCode) continue;

      const ageSec = Math.max(0, (nowMs - entry.lastPing.reportedAtMs) / 1000);
      const activeZone = this.blindZone.findActiveZone(
        entry.baseProgressMeters,
        entry.route.blindZoneSegments
      );

      let isBlindZoneEstimate = false;
      let effectiveSpeed = entry.speedMps;
      let effectiveAgeForMotion = ageSec;

      if (activeZone && ageSec > 0) {
        isBlindZoneEstimate = true;
        effectiveSpeed = this.blindZone.estimateSpeedMps(entry.speedMps, activeZone.zoneId, {
          timestampMs: nowMs,
          weatherFactor: context?.weatherFactor,
          trafficFactor: context?.trafficFactor
        });
      } else if (ageSec > MAX_EXTRAPOLATION_SEC) {
        effectiveSpeed = 0;
        effectiveAgeForMotion = MAX_EXTRAPOLATION_SEC;
      }

      const rawTargetProgress =
        entry.baseProgressMeters + effectiveSpeed * effectiveAgeForMotion;
      const pos = pointAtProgress(entry.route.polyline, rawTargetProgress);

      states.push({
        vehicleId: entry.lastPing.vehicleId,
        lineCode: entry.lastPing.lineCode,
        branch: entry.route.branch,
        direction: entry.route.direction,
        lat: entry.snappedToRoute ? pos.lat : entry.lastPing.lat,
        lon: entry.snappedToRoute ? pos.lon : entry.lastPing.lon,
        bearingDeg: entry.snappedToRoute ? pos.bearingDeg : entry.bearingDeg,
        speedMps: effectiveSpeed,
        routeProgressMeters: pos.clampedProgressMeters,
        snappedToRoute: entry.snappedToRoute,
        isInterpolated: ageSec > 0,
        isBlindZoneEstimate,
        lastRealPingAgeSec: Math.round(ageSec)
      });
    }

    return states;
  }
}
