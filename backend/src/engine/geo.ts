const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export interface LatLon {
  lat: number;
  lon: number;
}

export interface PolylineIndex {
  coords: Array<[number, number]>; // [lon, lat]
  cumulativeMeters: number[];
  totalLengthMeters: number;
}

export function haversineMeters(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function bearingDegrees(a: LatLon, b: LatLon): number {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * RAD_TO_DEG) + 360) % 360;
}

export function bearingCosineSimilarity(degA: number, degB: number): number {
  return Math.cos((degA - degB) * DEG_TO_RAD);
}

export function buildPolylineIndex(coords: Array<[number, number]>): PolylineIndex {
  const cumulativeMeters: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const prev = { lon: coords[i - 1][0], lat: coords[i - 1][1] };
    const curr = { lon: coords[i][0], lat: coords[i][1] };
    cumulativeMeters.push(cumulativeMeters[i - 1] + haversineMeters(prev, curr));
  }
  return {
    coords,
    cumulativeMeters,
    totalLengthMeters: cumulativeMeters[cumulativeMeters.length - 1] ?? 0
  };
}

/**
 * Projects a point onto a polyline using local equirectangular meters around the point.
 */
export function projectPointOntoPolyline(
  point: LatLon,
  polyline: PolylineIndex
): { distanceMeters: number; progressMeters: number; snapped: LatLon; bearingDeg: number } {
  const cosLat = Math.cos(point.lat * DEG_TO_RAD);
  const toXY = (p: LatLon): [number, number] => [
    (p.lon - point.lon) * DEG_TO_RAD * EARTH_RADIUS_M * cosLat,
    (p.lat - point.lat) * DEG_TO_RAD * EARTH_RADIUS_M
  ];

  let bestDist = Number.POSITIVE_INFINITY;
  let bestProgress = 0;
  let bestSnapped: LatLon = point;
  let bestBearing = 0;

  for (let i = 0; i < polyline.coords.length - 1; i++) {
    const a: LatLon = { lon: polyline.coords[i][0], lat: polyline.coords[i][1] };
    const b: LatLon = { lon: polyline.coords[i + 1][0], lat: polyline.coords[i + 1][1] };
    const [ax, ay] = toXY(a);
    const [bx, by] = toXY(b);
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const dist = Math.hypot(px, py);

    if (dist < bestDist) {
      bestDist = dist;
      const segLen = polyline.cumulativeMeters[i + 1] - polyline.cumulativeMeters[i];
      bestProgress = polyline.cumulativeMeters[i] + t * segLen;
      bestSnapped = {
        lat: a.lat + t * (b.lat - a.lat),
        lon: a.lon + t * (b.lon - a.lon)
      };
      bestBearing = bearingDegrees(a, b);
    }
  }

  return {
    distanceMeters: bestDist,
    progressMeters: bestProgress,
    snapped: bestSnapped,
    bearingDeg: bestBearing
  };
}

export function pointAtProgress(
  polyline: PolylineIndex,
  progressMeters: number
): { lat: number; lon: number; bearingDeg: number; clampedProgressMeters: number } {
  const clamped = Math.max(0, Math.min(polyline.totalLengthMeters, progressMeters));
  if (polyline.coords.length === 0) {
    return { lat: 0, lon: 0, bearingDeg: 0, clampedProgressMeters: 0 };
  }
  if (polyline.coords.length === 1) {
    return {
      lat: polyline.coords[0][1],
      lon: polyline.coords[0][0],
      bearingDeg: 0,
      clampedProgressMeters: 0
    };
  }

  for (let i = 0; i < polyline.coords.length - 1; i++) {
    const startM = polyline.cumulativeMeters[i];
    const endM = polyline.cumulativeMeters[i + 1];
    if (clamped <= endM || i === polyline.coords.length - 2) {
      const segLen = endM - startM;
      const t = segLen <= 0 ? 0 : Math.max(0, Math.min(1, (clamped - startM) / segLen));
      const a: LatLon = { lon: polyline.coords[i][0], lat: polyline.coords[i][1] };
      const b: LatLon = { lon: polyline.coords[i + 1][0], lat: polyline.coords[i + 1][1] };
      return {
        lat: a.lat + t * (b.lat - a.lat),
        lon: a.lon + t * (b.lon - a.lon),
        bearingDeg: bearingDegrees(a, b),
        clampedProgressMeters: clamped
      };
    }
  }

  const last = polyline.coords[polyline.coords.length - 1];
  return { lat: last[1], lon: last[0], bearingDeg: 0, clampedProgressMeters: clamped };
}
