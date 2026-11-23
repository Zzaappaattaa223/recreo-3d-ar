import type { LineCode, LineInfo, RouteGeoJSON, Stop, StreamEvent } from "@recreo/shared";

export async function fetchLines(): Promise<LineInfo[]> {
  const res = await fetch("/api/lines");
  if (!res.ok) throw new Error(`HTTP ${res.status} loading lines`);
  const data = (await res.json()) as { lines: LineInfo[] };
  return data.lines;
}

export async function fetchStops(lineCode: LineCode): Promise<Stop[]> {
  const res = await fetch(`/api/stops?line=${encodeURIComponent(lineCode)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading stops`);
  const data = (await res.json()) as { stops: Stop[] };
  return data.stops;
}

export async function fetchRoutes(lineCode: LineCode): Promise<RouteGeoJSON> {
  const res = await fetch(`/api/routes?line=${encodeURIComponent(lineCode)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading routes`);
  return (await res.json()) as RouteGeoJSON;
}

export interface StreamSubscriptionOptions {
  lineCode: LineCode;
  onEvent: (event: StreamEvent) => void;
  onStatusChange?: (connected: boolean) => void;
}

/**
 * Subscribes to GET /api/stream?line=... with automatic exponential backoff + jitter reconnect.
 */
export function subscribeToVehicleStream(options: StreamSubscriptionOptions): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const connect = () => {
    if (closed) return;
    source = new EventSource(`/api/stream?line=${encodeURIComponent(options.lineCode)}`);

    source.onopen = () => {
      attempt = 0;
      options.onStatusChange?.(true);
    };

    source.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as StreamEvent;
        options.onEvent(parsed);
      } catch {
        // Ignore malformed frame
      }
    };

    source.onerror = () => {
      options.onStatusChange?.(false);
      source?.close();
      source = null;
      if (closed) return;

      const baseDelay = Math.min(15_000, 1000 * Math.pow(2, attempt));
      const jitter = Math.round(Math.random() * 500);
      attempt += 1;
      retryTimer = setTimeout(connect, baseDelay + jitter);
    };
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    source?.close();
  };
}
