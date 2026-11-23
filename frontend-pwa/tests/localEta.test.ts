import { describe, expect, it } from "vitest";
import type { Stop, VehicleState } from "@recreo/shared";
import {
  estimateStopEta,
  FALLBACK_SPEED_MPS,
  formatDistance,
  formatEta,
  lerpPose
} from "../src/utils/localEta";

describe("Etapa 3 — Local ETA & Visual Interpolation", () => {
  const baseStop: Stop = {
    stopId: "REC-S3",
    name: "Av. Aristobulo del Valle 6500",
    lineCode: "recreo",
    branch: "Recreo - Centro",
    direction: "ida",
    sequence: 3,
    lat: -31.6104,
    lon: -60.7082,
    distanceAlongRouteMeters: 5000
  };

  const baseVehicle: VehicleState = {
    vehicleId: "REC-01",
    lineCode: "recreo",
    branch: "Recreo - Centro",
    direction: "ida",
    lat: -31.59,
    lon: -60.71,
    bearingDeg: 180,
    speedMps: 10,
    routeProgressMeters: 4000,
    snappedToRoute: true,
    isInterpolated: true,
    isBlindZoneEstimate: false,
    lastRealPingAgeSec: 4
  };

  it("computes remaining distance and ETA using vehicle speed", () => {
    const res = estimateStopEta(baseVehicle, baseStop);
    expect(res.passedStop).toBe(false);
    expect(res.distanceMeters).toBe(1000);
    expect(res.etaSeconds).toBe(100);
  });

  it("uses 6.94 m/s fallback speed when vehicle is stationary or < 1 m/s", () => {
    const stoppedVehicle: VehicleState = { ...baseVehicle, speedMps: 0 };
    const res = estimateStopEta(stoppedVehicle, baseStop);
    expect(res.distanceMeters).toBe(1000);
    expect(res.etaSeconds).toBe(Math.round(1000 / FALLBACK_SPEED_MPS));
  });

  it("marks passedStop when vehicle is >30 m past the stop", () => {
    const pastVehicle: VehicleState = { ...baseVehicle, routeProgressMeters: 5100 };
    const res = estimateStopEta(pastVehicle, baseStop);
    expect(res.passedStop).toBe(true);
    expect(res.etaSeconds).toBeNull();
  });

  it("formats distance, ETA, and linear pose interpolation", () => {
    expect(formatDistance(640)).toBe("640 m");
    expect(formatDistance(1250)).toBe("1.3 km");
    expect(formatEta(45)).toBe("< 1 min");
    expect(formatEta(120)).toBe("~2 min");
    expect(lerpPose({ lat: 0, lon: 0 }, { lat: 10, lon: 20 }, 0.5)).toEqual({ lat: 5, lon: 10 });
  });
});
