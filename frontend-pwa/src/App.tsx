import { useEffect, useMemo, useState } from "react";
import type { LineCode, LineInfo, RouteGeoJSON, SourceHealth, Stop, VehicleState } from "@recreo/shared";
import {
  fetchLines,
  fetchRoutes,
  fetchStops,
  subscribeToVehicleStream
} from "./services/transitClient";
import { estimateStopEta, formatDistance, formatEta } from "./utils/localEta";
import { ArXrayView } from "./views/ArXrayView";
import { Map3DView } from "./views/Map3DView";

type ViewMode = "map3d" | "ar_rx";

export function App() {
  const [mode, setMode] = useState<ViewMode>("map3d");
  const [lines, setLines] = useState<LineInfo[]>([]);
  const [selectedLine, setSelectedLine] = useState<LineCode>("recreo");
  const [stops, setStops] = useState<Stop[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<RouteGeoJSON | null>(null);
  const [vehicles, setVehicles] = useState<VehicleState[]>([]);
  const [sourceHealth, setSourceHealth] = useState<SourceHealth>("simulated");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    void fetchLines().then(setLines).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchStops(selectedLine), fetchRoutes(selectedLine)])
      .then(([loadedStops, loadedRoutes]) => {
        if (cancelled) return;
        setStops(loadedStops);
        setRoutes(loadedRoutes);
        setSelectedStopId(loadedStops[0]?.stopId ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedLine]);

  useEffect(() => {
    return subscribeToVehicleStream({
      lineCode: selectedLine,
      onEvent: (ev) => {
        setVehicles(ev.vehicles);
        setSourceHealth(ev.sourceHealth);
      },
      onStatusChange: setConnected
    });
  }, [selectedLine]);

  const selectedStop = useMemo(
    () => stops.find((s) => s.stopId === selectedStopId) ?? null,
    [stops, selectedStopId]
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: "#0b1120",
        color: "#f8fafc",
        fontFamily: "system-ui, sans-serif"
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          background: "#0f172a",
          borderBottom: "1px solid #1e293b"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <strong>Recreo 3D &amp; AR</strong>
          <span
            style={{
              fontSize: "0.75rem",
              padding: "2px 8px",
              borderRadius: "999px",
              background: connected ? "#14532d" : "#7f1d1d"
            }}
          >
            {connected ? `SSE 1Hz · ${sourceHealth}` : "Reconectando..."}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <select
            aria-label="Línea"
            value={selectedLine}
            onChange={(e) => setSelectedLine(e.target.value as LineCode)}
            style={{ padding: "0.35rem 0.5rem", borderRadius: "6px" }}
          >
            {(lines.length > 0
              ? lines
              : [
                  { lineCode: "recreo" as LineCode, label: "Recreo", branches: [] },
                  {
                    lineCode: "recreo_semirrapido" as LineCode,
                    label: "Recreo Semirrápido",
                    branches: []
                  }
                ]
            ).map((l) => (
              <option key={l.lineCode} value={l.lineCode}>
                {l.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Parada"
            value={selectedStopId ?? ""}
            onChange={(e) => setSelectedStopId(e.target.value || null)}
            style={{ padding: "0.35rem 0.5rem", borderRadius: "6px" }}
          >
            {stops.map((s) => (
              <option key={s.stopId} value={s.stopId}>
                {s.name} ({s.direction})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setMode("map3d")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "6px",
              border: "none",
              background: mode === "map3d" ? "#0284c7" : "#334155",
              color: "#fff",
              cursor: "pointer"
            }}
          >
            Mapa 3D
          </button>
          <button
            type="button"
            onClick={() => setMode("ar_rx")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "6px",
              border: "none",
              background: mode === "ar_rx" ? "#0284c7" : "#334155",
              color: "#fff",
              cursor: "pointer"
            }}
          >
            AR Rayos X
          </button>
        </div>
      </header>

      <main style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {mode === "map3d" ? (
          <Map3DView
            routes={routes}
            stops={stops}
            vehicles={vehicles}
            selectedStopId={selectedStopId}
            onSelectStop={setSelectedStopId}
          />
        ) : (
          <ArXrayView routes={routes} vehicles={vehicles} fallbackStop={selectedStop} />
        )}

        <aside
          style={{
            position: "absolute",
            left: "1rem",
            bottom: "1rem",
            background: "rgba(15, 23, 42, 0.9)",
            border: "1px solid #334155",
            borderRadius: "10px",
            padding: "0.75rem 1rem",
            maxWidth: "320px",
            fontSize: "0.85rem"
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "0.4rem" }}>
            Unidades activas ({vehicles.length})
          </div>
          {vehicles.map((v) => {
            const eta = selectedStop ? estimateStopEta(v, selectedStop) : null;
            return (
              <div
                key={v.vehicleId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  padding: "0.2rem 0",
                  borderTop: "1px solid rgba(51,65,85,0.6)"
                }}
              >
                <span>
                  {v.vehicleId} ({v.direction}){v.isBlindZoneEstimate ? " [ZC]" : ""}
                </span>
                <span>
                  {eta
                    ? eta.passedStop
                      ? "Pasó parada"
                      : `${formatDistance(eta.distanceMeters)} · ${formatEta(eta.etaSeconds)}`
                    : `${Math.round(v.speedMps * 3.6)} km/h`}
                </span>
              </div>
            );
          })}
        </aside>
      </main>
    </div>
  );
}
