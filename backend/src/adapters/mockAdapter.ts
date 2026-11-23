import type { LineCode, RawVehiclePing, TransitSourceAdapter } from "@recreo/shared";
import { pointAtProgress } from "../engine/geo.js";
import type { RouteStore } from "../engine/routeStore.js";

export interface MockAdapterOptions {
  speedMps?: number;
  startTimeMs?: number;
  nowProvider?: () => number;
  simulateBlindZoneSilence?: boolean;
}

export class MockTransitAdapter implements TransitSourceAdapter {
  readonly sourceName = "mock-deterministic";
  private readonly store: RouteStore;
  private readonly speedMps: number;
  private readonly startTimeMs: number;
  private readonly nowProvider: () => number;
  private readonly simulateBlindZoneSilence: boolean;

  constructor(store: RouteStore, options: MockAdapterOptions = {}) {
    this.store = store;
    this.speedMps = options.speedMps ?? 8.3;
    const utcMidnight = new Date();
    utcMidnight.setUTCHours(0, 0, 0, 0);
    this.startTimeMs = options.startTimeMs ?? utcMidnight.getTime();
    this.nowProvider = options.nowProvider ?? (() => Date.now());
    this.simulateBlindZoneSilence = options.simulateBlindZoneSilence ?? false;
  }

  async fetchActiveVehicles(lineCode: LineCode): Promise<RawVehiclePing[]> {
    const routes = this.store.findRoutesByLine(lineCode);
    const nowMs = this.nowProvider();
    const elapsedSec = Math.max(0, (nowMs - this.startTimeMs) / 1000);
    const prefix = lineCode === "recreo" ? "REC" : lineCode === "recreo_semirrapido" ? "SEMI" : "LC";

    const pings: RawVehiclePing[] = [];
    const idaRoute = routes.find((r) => r.direction === "ida");
    const vueltaRoute = routes.find((r) => r.direction === "vuelta");

    const pair = [
      { id: `${prefix}-01`, route: idaRoute, offsetMeters: 1500 },
      { id: `${prefix}-02`, route: vueltaRoute, offsetMeters: 2500 }
    ];

    for (const unit of pair) {
      if (!unit.route || unit.route.polyline.totalLengthMeters <= 0) continue;
      const progress =
        (unit.offsetMeters + elapsedSec * this.speedMps) % unit.route.polyline.totalLengthMeters;

      if (this.simulateBlindZoneSilence) {
        const inZone = unit.route.blindZoneSegments.some(
          (z) => progress >= z.startMeters && progress <= z.endMeters
        );
        if (inZone) continue;
      }

      const pos = pointAtProgress(unit.route.polyline, progress);
      pings.push({
        vehicleId: unit.id,
        lineCode,
        branch: unit.route.branch,
        lat: pos.lat,
        lon: pos.lon,
        reportedAtMs: nowMs,
        rawSpeedMps: this.speedMps,
        rawBearingDeg: pos.bearingDeg
      });
    }

    return pings;
  }
}
