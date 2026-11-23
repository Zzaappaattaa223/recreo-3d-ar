import fs from "node:fs";
import path from "node:path";
import type { BlindZoneSegment } from "@recreo/shared";

export interface ZoneProfile {
  weekdayPeakFactor: number;
  weekdayOffPeakFactor: number;
  weekendFactor: number;
  peakHours: number[];
}

export interface BlindZoneProfilesConfig {
  defaultWeatherFactor: number;
  defaultTrafficFactor: number;
  zones: Record<string, ZoneProfile>;
}

export interface BlindZoneContext {
  timestampMs: number;
  weatherFactor?: number;
  trafficFactor?: number;
}

export class BlindZoneHeuristic {
  private readonly config: BlindZoneProfilesConfig;

  constructor(config: BlindZoneProfilesConfig) {
    this.config = config;
  }

  static fromFile(filePath: string): BlindZoneHeuristic {
    const raw = fs.readFileSync(filePath, "utf-8");
    return new BlindZoneHeuristic(JSON.parse(raw) as BlindZoneProfilesConfig);
  }

  static defaultPath(): string {
    return path.resolve(import.meta.dirname, "../../data/blind_zone_profiles.json");
  }

  findActiveZone(
    progressMeters: number,
    segments: BlindZoneSegment[]
  ): BlindZoneSegment | undefined {
    return segments.find(
      (seg) => progressMeters >= seg.startMeters && progressMeters <= seg.endMeters
    );
  }

  getHistoricalFactor(zoneId: string, timestampMs: number): number {
    const profile = this.config.zones[zoneId];
    if (!profile) return 1.0;
    const date = new Date(timestampMs);
    const day = date.getDay(); // 0 = Sunday, 6 = Saturday
    if (day === 0 || day === 6) {
      return profile.weekendFactor;
    }
    const hour = date.getHours();
    return profile.peakHours.includes(hour)
      ? profile.weekdayPeakFactor
      : profile.weekdayOffPeakFactor;
  }

  estimateSpeedMps(
    lastKnownSpeedMps: number,
    zoneId: string,
    context: BlindZoneContext
  ): number {
    const hist = this.getHistoricalFactor(zoneId, context.timestampMs);
    const weather = context.weatherFactor ?? this.config.defaultWeatherFactor;
    const traffic = context.trafficFactor ?? this.config.defaultTrafficFactor;
    return Math.max(0, lastKnownSpeedMps * hist * weather * traffic);
  }
}
