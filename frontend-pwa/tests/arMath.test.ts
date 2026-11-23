import { describe, expect, it } from "vitest";
import { CircularLowPassFilter } from "../src/sensors/orientationSensor";
import { latLonToEnu, OBSERVER_EYE_HEIGHT_M } from "../src/utils/enuProjection";

describe("Etapa 4 — AR X-Ray Math (Circular Filter & ENU Projection)", () => {
  it("handles 359° -> 1° wrap-around smoothly without jumping through 180°", () => {
    const filter = new CircularLowPassFilter(0.2);
    const first = filter.update(359);
    expect(first).toBeCloseTo(359, 1);

    const second = filter.update(1);
    // Should stay near 0°/359°, never jump toward 180°
    expect(second > 350 || second < 10).toBe(true);
  });

  it("projects (lat, lon) into local ENU meters with <0.1% lateral error within 5 km", () => {
    const origin = { lat: -31.6104, lon: -60.7082 };
    // ~1 km north
    const northTarget = { lat: -31.6014, lon: -60.7082 };
    const enu = latLonToEnu(origin, northTarget, 4.0);

    expect(Math.abs(enu.east)).toBeLessThan(1);
    expect(enu.north).toBeGreaterThan(990);
    expect(enu.north).toBeLessThan(1010);
    expect(enu.up).toBeCloseTo(4.0 - OBSERVER_EYE_HEIGHT_M, 2);
  });
});
