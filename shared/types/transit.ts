export type LineCode = "recreo" | "recreo_semirrapido" | "linea_c";
export type Direction = "ida" | "vuelta";
export type SourceHealth = "live" | "stale" | "degraded" | "offline" | "simulated";

export interface RawVehiclePing {
  vehicleId: string;
  lineCode: LineCode;
  branch: string;
  lat: number;
  lon: number;
  reportedAtMs: number;
  rawSpeedMps?: number;
  rawBearingDeg?: number;
}

export interface TransitSourceAdapter {
  readonly sourceName: string;
  fetchActiveVehicles(lineCode: LineCode): Promise<RawVehiclePing[]>;
}

export interface VehicleState {
  vehicleId: string;
  lineCode: LineCode;
  branch: string;
  direction: Direction;
  lat: number;
  lon: number;
  bearingDeg: number;
  speedMps: number;
  routeProgressMeters: number;
  snappedToRoute: boolean;
  isInterpolated: boolean;
  isBlindZoneEstimate: boolean;
  lastRealPingAgeSec: number;
}

export interface StreamEvent {
  serverTimeMs: number;
  sourceHealth: SourceHealth;
  vehicles: VehicleState[];
}

export interface Stop {
  stopId: string;
  name: string;
  lineCode: LineCode;
  branch: string;
  direction: Direction;
  sequence: number;
  lat: number;
  lon: number;
  distanceAlongRouteMeters: number;
}

export interface LineInfo {
  lineCode: LineCode;
  label: string;
  branches: string[];
}

export interface BlindZoneSegment {
  startMeters: number;
  endMeters: number;
  zoneId: string;
}

export interface RouteFeatureProperties {
  kind: "route";
  lineCode: LineCode;
  branch: string;
  direction: Direction;
  blindZoneSegments?: BlindZoneSegment[];
}

export interface StopFeatureProperties {
  kind: "stop";
  stopId: string;
  name: string;
  lineCode: LineCode;
  branch: string;
  direction: Direction;
  sequence: number;
}

export interface RouteGeoJSON {
  type: "FeatureCollection";
  features: Array<
    | {
        type: "Feature";
        geometry: { type: "LineString"; coordinates: Array<[number, number]> };
        properties: RouteFeatureProperties;
      }
    | {
        type: "Feature";
        geometry: { type: "Point"; coordinates: [number, number] };
        properties: StopFeatureProperties;
      }
  >;
}
