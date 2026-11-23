import { describe, expect, it } from "vitest";
import { MockTransitAdapter } from "../src/adapters/mockAdapter.js";
import { BlindZoneHeuristic } from "../src/engine/blindZoneHeuristic.js";
import { MAX_EXTRAPOLATION_SEC, VehicleInterpolator } from "../src/engine/interpolator.js";
import { MAX_SNAP_DISTANCE_METERS, matchPingToRoute } from "../src/engine/mapMatcher.js";
import { RouteStore } from "../src/engine/routeStore.js";

describe("Etapa 1 — Spatial Engine & Blind Zone Heuristic", () => {
  const store = RouteStore.fromFile(RouteStore.defaultPath());
  const blindZone = BlindZoneHeuristic.fromFile(BlindZoneHeuristic.defaultPath());

  it("snaps pings within 60 m and marks >60 m as snappedToRoute: false", () => {
    const nearMatch = matchPingToRoute(
      {
        vehicleId: "TEST-1",
        lineCode: "recreo",
        branch: "Recreo - Centro",
        lat: -31.6104,
        lon: -60.7082,
        reportedAtMs: 1000,
        rawBearingDeg: 180
      },
      store
    );
    expect(nearMatch).not.toBeNull();
    expect(nearMatch!.snappedToRoute).toBe(true);
    expect(nearMatch!.direction).toBe("ida");

    // ~500 m east off-route
    const farMatch = matchPingToRoute(
      {
        vehicleId: "TEST-2",
        lineCode: "recreo",
        branch: "Recreo - Centro",
        lat: -31.6104,
        lon: -60.702,
        reportedAtMs: 1000,
        rawBearingDeg: 180
      },
      store
    );
    expect(farMatch).not.toBeNull();
    expect(farMatch!.snappedToRoute).toBe(false);
    expect(farMatch!.lon).toBe(-60.702);
    expect(MAX_SNAP_DISTANCE_METERS).toBe(60);
  });

  it("disambiguates ida vs vuelta using bearing similarity on shared corridor", () => {
    const northBound = matchPingToRoute(
      {
        vehicleId: "TEST-3",
        lineCode: "recreo",
        branch: "",
        lat: -31.6104,
        lon: -60.7082,
        reportedAtMs: 1000,
        rawBearingDeg: 0 // heading north -> Centro - Recreo (vuelta)
      },
      store
    );
    expect(northBound?.direction).toBe("vuelta");

    const southBound = matchPingToRoute(
      {
        vehicleId: "TEST-4",
        lineCode: "recreo",
        branch: "",
        lat: -31.6104,
        lon: -60.7082,
        reportedAtMs: 1000,
        rawBearingDeg: 180 // heading south -> Recreo - Centro (ida)
      },
      store
    );
    expect(southBound?.direction).toBe("ida");
  });

  it("calculates speed from consecutive pings, clamps at terminus, and freezes after 45 s", () => {
    const interp = new VehicleInterpolator(store, blindZone);
    const route = store.findRoute("recreo", "ida")!;

    interp.ingestPings([
      {
        vehicleId: "V-1",
        lineCode: "recreo",
        branch: "Recreo - Centro",
        lat: -31.491,
        lon: -60.7315,
        reportedAtMs: 10_000,
        rawBearingDeg: 170
      }
    ]);
    interp.ingestPings([
      {
        vehicleId: "V-1",
        lineCode: "recreo",
        branch: "Recreo - Centro",
        lat: -31.492,
        lon: -60.7312,
        reportedAtMs: 20_000,
        rawBearingDeg: 170
      }
    ]);

    const at25s = interp.getStatesAt(25_000, "recreo")[0];
    expect(at25s.speedMps).toBeGreaterThan(5);
    expect(at25s.isInterpolated).toBe(true);
    expect(at25s.isBlindZoneEstimate).toBe(false);

    // After 45s (e.g. 60s and 90s), position remains frozen at MAX_EXTRAPOLATION_SEC
    const at45sPlus = interp.getStatesAt(20_000 + (MAX_EXTRAPOLATION_SEC + 10) * 1000, "recreo")[0];
    const at90s = interp.getStatesAt(20_000 + 90_000, "recreo")[0];
    expect(at45sPlus.speedMps).toBe(0);
    expect(at45sPlus.routeProgressMeters).toBe(at90s.routeProgressMeters);

    // Terminus clamping test
    interp.ingestPings([
      {
        vehicleId: "V-TERM",
        lineCode: "recreo",
        branch: "Recreo - Centro",
        lat: -31.6485,
        lon: -60.703,
        reportedAtMs: 100_000,
        rawSpeedMps: 15,
        rawBearingDeg: 170
      }
    ]);
    const clamped = interp.getStatesAt(130_000, "recreo").find((v) => v.vehicleId === "V-TERM")!;
    expect(clamped.routeProgressMeters).toBeLessThanOrEqual(route.polyline.totalLengthMeters);
  });

  it("activates blind zone heuristic with historical, weather, and traffic factors", () => {
    const interp = new VehicleInterpolator(store, blindZone);
    // Point around -31.5550, -60.7180 lies inside rn11-norte blind zone (6200..8600 m)
    interp.ingestPings([
      {
        vehicleId: "V-BZ",
        lineCode: "recreo",
        branch: "Recreo - Centro",
        lat: -31.555,
        lon: -60.718,
        reportedAtMs: 1_000_000,
        rawSpeedMps: 10,
        rawBearingDeg: 170
      }
    ]);

    // Monday 08:00 local-ish timestamp for weekday peak check
    const mondayPeak = new Date(2026, 10, 23, 8, 0, 0).getTime();
    const state = interp.getStatesAt(1_060_000, "recreo", {
      weatherFactor: 0.9,
      trafficFactor: 0.95
    })[0];

    expect(state.isBlindZoneEstimate).toBe(true);
    expect(state.lastRealPingAgeSec).toBe(60);
    expect(state.speedMps).toBeGreaterThan(0);

    const peakSpeed = blindZone.estimateSpeedMps(10, "rn11-norte", {
      timestampMs: mondayPeak,
      weatherFactor: 0.9,
      trafficFactor: 1.0
    });
    // 10 * 0.78 (weekdayPeakFactor) * 0.9 = 7.02
    expect(peakSpeed).toBeCloseTo(7.02, 2);
  });

  it("produces 2 deterministic units (ida + vuelta) per line in MockTransitAdapter", async () => {
    const mock = new MockTransitAdapter(store, {
      startTimeMs: 1_000_000,
      nowProvider: () => 1_010_000
    });
    const recreo = await mock.fetchActiveVehicles("recreo");
    const semi = await mock.fetchActiveVehicles("recreo_semirrapido");
    expect(recreo.map((v) => v.vehicleId)).toEqual(["REC-01", "REC-02"]);
    expect(semi.map((v) => v.vehicleId)).toEqual(["SEMI-01", "SEMI-02"]);
  });
});
