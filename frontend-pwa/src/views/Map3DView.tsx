import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { RouteGeoJSON, Stop, VehicleState } from "@recreo/shared";
import { lerpPose } from "../utils/localEta";

export interface Map3DViewProps {
  routes: RouteGeoJSON | null;
  stops: Stop[];
  vehicles: VehicleState[];
  selectedStopId: string | null;
  onSelectStop?: (stopId: string) => void;
}

const DEFAULT_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export function Map3DView({
  routes,
  stops,
  vehicles,
  selectedStopId,
  onSelectStop
}: Map3DViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<
    Map<
      string,
      {
        marker: maplibregl.Marker;
        from: { lat: number; lon: number };
        to: { lat: number; lon: number };
        updatedAt: number;
      }
    >
  >(new Map());
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEFAULT_STYLE_URL,
      center: [-60.715, -31.57],
      zoom: 12.4,
      pitch: 55,
      bearing: -15
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      map.addSource("recreo-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });

      map.addLayer({
        id: "recreo-route-ida",
        type: "line",
        source: "recreo-routes",
        filter: ["==", ["get", "direction"], "ida"],
        paint: {
          "line-color": "#0ea5e9",
          "line-width": 5,
          "line-opacity": 0.9
        }
      });

      map.addLayer({
        id: "recreo-route-vuelta",
        type: "line",
        source: "recreo-routes",
        filter: ["==", ["get", "direction"], "vuelta"],
        paint: {
          "line-color": "#f59e0b",
          "line-width": 4,
          "line-opacity": 0.85,
          "line-dasharray": [2, 1]
        }
      });
    });

    mapRef.current = map;

    return () => {
      for (const m of markersRef.current.values()) m.marker.remove();
      markersRef.current.clear();
      for (const sm of stopMarkersRef.current) sm.remove();
      stopMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update GeoJSON routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routes) return;
    const applyRoutes = () => {
      const src = map.getSource("recreo-routes") as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData({
          type: "FeatureCollection",
          features: routes.features.filter((f) => f.geometry.type === "LineString")
        } as GeoJSON.FeatureCollection);
      }
    };
    if (map.isStyleLoaded()) applyRoutes();
    else map.once("load", applyRoutes);
  }, [routes]);

  // Update stop markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const sm of stopMarkersRef.current) sm.remove();
    stopMarkersRef.current = stops.map((stop) => {
      const el = document.createElement("button");
      el.type = "button";
      el.title = `${stop.name} (${stop.direction})`;
      const isSelected = stop.stopId === selectedStopId;
      el.style.width = isSelected ? "16px" : "11px";
      el.style.height = isSelected ? "16px" : "11px";
      el.style.borderRadius = "9999px";
      el.style.border = "2px solid #ffffff";
      el.style.background = isSelected ? "#22c55e" : "#334155";
      el.style.cursor = "pointer";
      el.onclick = () => onSelectStop?.(stop.stopId);

      return new maplibregl.Marker({ element: el })
        .setLngLat([stop.lon, stop.lat])
        .addTo(map);
    });
  }, [stops, selectedStopId, onSelectStop]);

  // Update vehicle targets & run 60fps visual interpolation between 1 Hz SSE ticks
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const now = performance.now();
    const activeIds = new Set(vehicles.map((v) => v.vehicleId));

    for (const [id, entry] of markersRef.current.entries()) {
      if (!activeIds.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    }

    for (const v of vehicles) {
      const existing = markersRef.current.get(v.vehicleId);
      const isStale = v.lastRealPingAgeSec > 45;

      if (!existing) {
        const el = document.createElement("div");
        el.style.padding = "4px 7px";
        el.style.borderRadius = "8px";
        el.style.fontSize = "11px";
        el.style.fontWeight = "700";
        el.style.color = "#ffffff";
        el.style.whiteSpace = "nowrap";
        el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.45)";
        el.style.border = "1px solid rgba(255,255,255,0.4)";

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([v.lon, v.lat])
          .addTo(map);

        markersRef.current.set(v.vehicleId, {
          marker,
          from: { lat: v.lat, lon: v.lon },
          to: { lat: v.lat, lon: v.lon },
          updatedAt: now
        });
      } else {
        const currentLngLat = existing.marker.getLngLat();
        existing.from = { lat: currentLngLat.lat, lon: currentLngLat.lng };
        existing.to = { lat: v.lat, lon: v.lon };
        existing.updatedAt = now;
      }

      const item = markersRef.current.get(v.vehicleId)!;
      const el = item.marker.getElement();
      el.style.background = v.isBlindZoneEstimate
        ? "#a855f7"
        : v.direction === "ida"
          ? "#0284c7"
          : "#d97706";
      el.style.opacity = isStale ? "0.55" : "1";
      el.textContent = `${v.vehicleId} · ${Math.round(v.speedMps * 3.6)} km/h${
        v.isBlindZoneEstimate ? " (ZC)" : ""
      }`;
    }

    let rafId = 0;
    const animate = () => {
      const tNow = performance.now();
      let moving = false;
      for (const entry of markersRef.current.values()) {
        const alpha = Math.min(1, (tNow - entry.updatedAt) / 950);
        if (alpha < 1) moving = true;
        const pos = lerpPose(entry.from, entry.to, alpha);
        entry.marker.setLngLat([pos.lon, pos.lat]);
      }
      if (moving) {
        rafId = requestAnimationFrame(animate);
      }
    };
    rafId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(rafId);
  }, [vehicles]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: "420px", position: "relative" }}
    />
  );
}
