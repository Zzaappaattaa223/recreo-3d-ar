import fs from "node:fs";
import path from "node:path";
import type {
  BlindZoneSegment,
  Direction,
  LineCode,
  LineInfo,
  RouteGeoJSON,
  Stop
} from "@recreo/shared";
import { buildPolylineIndex, projectPointOntoPolyline, type PolylineIndex } from "./geo.js";

export interface IndexedRoute {
  lineCode: LineCode;
  branch: string;
  direction: Direction;
  polyline: PolylineIndex;
  blindZoneSegments: BlindZoneSegment[];
}

export class RouteStore {
  readonly geojson: RouteGeoJSON;
  readonly routes: IndexedRoute[] = [];
  readonly stops: Stop[] = [];

  constructor(geojson: RouteGeoJSON) {
    this.geojson = geojson;

    for (const feature of geojson.features) {
      if (feature.geometry.type === "LineString" && feature.properties.kind === "route") {
        this.routes.push({
          lineCode: feature.properties.lineCode,
          branch: feature.properties.branch,
          direction: feature.properties.direction,
          polyline: buildPolylineIndex(feature.geometry.coordinates),
          blindZoneSegments: feature.properties.blindZoneSegments ?? []
        });
      }
    }

    for (const feature of geojson.features) {
      if (feature.geometry.type === "Point" && feature.properties.kind === "stop") {
        const [lon, lat] = feature.geometry.coordinates;
        const props = feature.properties;
        const route = this.findRoute(props.lineCode, props.direction, props.branch);
        const distanceAlongRouteMeters = route
          ? projectPointOntoPolyline({ lat, lon }, route.polyline).progressMeters
          : 0;
        this.stops.push({
          stopId: props.stopId,
          name: props.name,
          lineCode: props.lineCode,
          branch: props.branch,
          direction: props.direction,
          sequence: props.sequence,
          lat,
          lon,
          distanceAlongRouteMeters
        });
      }
    }
  }

  static fromFile(filePath: string): RouteStore {
    const raw = fs.readFileSync(filePath, "utf-8");
    return new RouteStore(JSON.parse(raw) as RouteGeoJSON);
  }

  static defaultPath(): string {
    return path.resolve(import.meta.dirname, "../../data/recreo_routes.geojson");
  }

  findRoutesByLine(lineCode: LineCode): IndexedRoute[] {
    return this.routes.filter((r) => r.lineCode === lineCode);
  }

  findRoute(lineCode: LineCode, direction: Direction, branch?: string): IndexedRoute | undefined {
    return this.routes.find(
      (r) =>
        r.lineCode === lineCode &&
        r.direction === direction &&
        (branch === undefined || r.branch === branch)
    );
  }

  getLines(): LineInfo[] {
    const labels: Record<LineCode, string> = {
      recreo: "Recreo",
      recreo_semirrapido: "Recreo Semirrápido",
      linea_c: "Línea C (Santo Tomé)"
    };
    const grouped = new Map<LineCode, Set<string>>();
    for (const r of this.routes) {
      if (!grouped.has(r.lineCode)) grouped.set(r.lineCode, new Set());
      grouped.get(r.lineCode)!.add(r.branch);
    }
    return Array.from(grouped.entries()).map(([lineCode, branches]) => ({
      lineCode,
      label: labels[lineCode] ?? lineCode,
      branches: Array.from(branches)
    }));
  }

  getStops(lineCode?: LineCode): Stop[] {
    return lineCode ? this.stops.filter((s) => s.lineCode === lineCode) : this.stops;
  }

  getRouteGeoJSON(lineCode?: LineCode): RouteGeoJSON {
    if (!lineCode) return this.geojson;
    return {
      type: "FeatureCollection",
      features: this.geojson.features.filter((f) => f.properties.lineCode === lineCode)
    };
  }
}
