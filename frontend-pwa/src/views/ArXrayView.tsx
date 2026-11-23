import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { RouteGeoJSON, Stop, VehicleState } from "@recreo/shared";
import { watchLocalGeoPosition, type UserGeoPosition } from "../sensors/geoSensor";
import {
  loadSavedCompassOffset,
  needsIosOrientationPermission,
  requestOrientationPermission,
  saveCompassOffset,
  watchCompassHeading
} from "../sensors/orientationSensor";
import { latLonToEnu, ROUTE_LINE_ELEVATION_M } from "../utils/enuProjection";
import { FALLBACK_SPEED_MPS, formatDistance, formatEta, haversineMeters } from "../utils/localEta";

export interface ArXrayViewProps {
  routes: RouteGeoJSON | null;
  vehicles: VehicleState[];
  fallbackStop?: Stop | null;
}

interface ScreenMarker {
  vehicleId: string;
  direction: string;
  distanceText: string;
  etaText: string;
  isBlindZone: boolean;
  isStale: boolean;
  xPercent: number;
  yPercent: number;
  inFront: boolean;
  offScreenSide: "left" | "right" | "none";
}

export function ArXrayView({ routes, vehicles, fallbackStop }: ArXrayViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  const [userPos, setUserPos] = useState<UserGeoPosition | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number>(0);
  const [hasCompass, setHasCompass] = useState<boolean>(false);
  const [offsetDeg, setOffsetDeg] = useState<number>(() => loadSavedCompassOffset());
  const [iosNeedsPerm, setIosNeedsPerm] = useState<boolean>(() => needsIosOrientationPermission());
  const [screenMarkers, setScreenMarkers] = useState<ScreenMarker[]>([]);

  const effectiveOrigin = useMemo(() => {
    if (userPos) return { lat: userPos.lat, lon: userPos.lon, isFallback: false };
    if (fallbackStop) return { lat: fallbackStop.lat, lon: fallbackStop.lon, isFallback: true };
    return { lat: -31.6104, lon: -60.7082, isFallback: true };
  }, [userPos, fallbackStop]);

  // 1. Rear camera stream
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Cámara trasera no disponible en este navegador.");
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      })
      .catch(() => {
        if (!cancelled) setCameraError("Permiso de cámara trasera denegado.");
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 2. Local GPS on-demand (strictly client-side)
  useEffect(() => {
    return watchLocalGeoPosition({
      onPosition: (pos) => {
        setGeoError(null);
        setUserPos(pos);
      },
      onError: setGeoError
    });
  }, []);

  // 3. Compass orientation
  useEffect(() => {
    if (iosNeedsPerm) return;
    return watchCompassHeading((deg) => {
      setHasCompass(true);
      setHeadingDeg(deg);
    });
  }, [iosNeedsPerm]);

  // 4. Three.js X-Ray overlay scene
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      host.clientWidth / Math.max(1, host.clientHeight),
      0.5,
      25000
    );
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const worldGroup = new THREE.Group();
    scene.add(worldGroup);

    sceneRef.current = scene;
    cameraRef.current = camera;
    groupRef.current = worldGroup;

    const onResize = () => {
      if (!host) return;
      camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let rafId = 0;
    const renderLoop = () => {
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(renderLoop);
    };
    rafId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  // Sync camera yaw with compass + manual offset
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    const effectiveHeadingRad = THREE.MathUtils.degToRad(headingDeg + offsetDeg);
    cam.rotation.order = "YXZ";
    cam.rotation.y = -effectiveHeadingRad;
    cam.updateMatrixWorld();
  }, [headingDeg, offsetDeg]);

  // Rebuild X-Ray bus silhouettes, light pillars, elevated route, and screen-space markers
  useEffect(() => {
    const group = groupRef.current;
    const cam = cameraRef.current;
    if (!group || !cam) return;

    while (group.children.length > 0) {
      const child = group.children.pop()!;
      group.remove(child);
    }

    const projected: ScreenMarker[] = [];

    for (const v of vehicles) {
      const dist = haversineMeters(effectiveOrigin, v);
      const enu = latLonToEnu(effectiveOrigin, v, 1.5);
      const busColor = v.isBlindZoneEstimate
        ? 0xa855f7
        : v.direction === "ida"
          ? 0x06b6d4
          : 0xf59e0b;

      // Distance-compensated scale so buses remain visible at 500 m – 10 km
      const scaleFactor = Math.max(1, dist / 220);

      const geom = new THREE.BoxGeometry(2.6 * scaleFactor, 3.0 * scaleFactor, 11.0 * scaleFactor);
      const mat = new THREE.MeshBasicMaterial({
        color: busColor,
        transparent: true,
        opacity: v.lastRealPingAgeSec > 45 ? 0.35 : 0.75,
        blending: THREE.AdditiveBlending,
        depthTest: false
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(enu.east, enu.up, -enu.north);
      mesh.rotation.y = -THREE.MathUtils.degToRad(v.bearingDeg);
      group.add(mesh);

      // Vertical X-Ray beacon pillar
      const pillarGeom = new THREE.CylinderGeometry(
        0.6 * scaleFactor,
        0.6 * scaleFactor,
        24 * scaleFactor,
        8
      );
      const pillarMat = new THREE.MeshBasicMaterial({
        color: busColor,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthTest: false
      });
      const pillar = new THREE.Mesh(pillarGeom, pillarMat);
      pillar.position.set(enu.east, enu.up + 12 * scaleFactor, -enu.north);
      group.add(pillar);

      // Project to screen coordinates for floating HUD badge / edge arrow
      const worldPos = new THREE.Vector3(enu.east, enu.up + 6 * scaleFactor, -enu.north);
      const camSpace = worldPos.clone().applyMatrix4(cam.matrixWorldInverse);
      const inFront = camSpace.z < 0;
      const ndc = worldPos.clone().project(cam);

      let xPercent = (ndc.x * 0.5 + 0.5) * 100;
      let yPercent = (-ndc.y * 0.5 + 0.5) * 100;
      let offScreenSide: "left" | "right" | "none" = "none";

      if (!inFront) {
        offScreenSide = camSpace.x >= 0 ? "right" : "left";
        xPercent = offScreenSide === "right" ? 90 : 10;
        yPercent = 50;
      } else if (xPercent < 8) {
        offScreenSide = "left";
        xPercent = 8;
      } else if (xPercent > 92) {
        offScreenSide = "right";
        xPercent = 92;
      }

      yPercent = Math.max(18, Math.min(82, yPercent));
      const speed = v.speedMps >= 1 ? v.speedMps : FALLBACK_SPEED_MPS;
      const eta = Math.round(dist / speed);

      projected.push({
        vehicleId: v.vehicleId,
        direction: v.direction,
        distanceText: formatDistance(dist),
        etaText: formatEta(eta),
        isBlindZone: v.isBlindZoneEstimate,
        isStale: v.lastRealPingAgeSec > 45,
        xPercent,
        yPercent,
        inFront,
        offScreenSide
      });
    }

    setScreenMarkers(projected);

    if (routes) {
      for (const feat of routes.features) {
        if (feat.geometry.type !== "LineString") continue;
        const pts: THREE.Vector3[] = [];
        for (const [lon, lat] of feat.geometry.coordinates) {
          const dist = haversineMeters(effectiveOrigin, { lat, lon });
          if (dist <= 3500) {
            const enu = latLonToEnu(effectiveOrigin, { lat, lon }, ROUTE_LINE_ELEVATION_M);
            pts.push(new THREE.Vector3(enu.east, enu.up, -enu.north));
          }
        }
        if (pts.length >= 2) {
          const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
          const lineMat = new THREE.LineDashedMaterial({
            color: feat.properties.direction === "ida" ? 0x38bdf8 : 0xfbbf24,
            dashSize: 12,
            gapSize: 6,
            transparent: true,
            opacity: 0.85,
            depthTest: false
          });
          const line = new THREE.Line(lineGeom, lineMat);
          line.computeLineDistances();
          group.add(line);
        }
      }
    }
  }, [vehicles, routes, effectiveOrigin, headingDeg, offsetDeg]);

  const handleEnableIosCompass = async () => {
    const granted = await requestOrientationPermission();
    setIosNeedsPerm(!granted);
  };

  const handleOffsetChange = (val: number) => {
    setOffsetDeg(val);
    saveCompassOffset(val);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      <div
        ref={canvasHostRef}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      />

      {/* Screen-space floating X-Ray target cards & directional arrows */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {screenMarkers.map((m) => (
          <div
            key={m.vehicleId}
            style={{
              position: "absolute",
              left: `${m.xPercent}%`,
              top: `${m.yPercent}%`,
              transform: "translate(-50%, -50%)",
              padding: "4px 9px",
              borderRadius: "999px",
              fontSize: "0.75rem",
              fontWeight: 700,
              whiteSpace: "nowrap",
              color: "#f8fafc",
              background: m.isBlindZone
                ? "rgba(168, 85, 247, 0.85)"
                : m.direction === "ida"
                  ? "rgba(2, 132, 199, 0.85)"
                  : "rgba(217, 119, 6, 0.85)",
              border: "1.5px solid rgba(255,255,255,0.85)",
              boxShadow: "0 0 14px rgba(56,189,248,0.65)",
              opacity: m.isStale ? 0.55 : 1
            }}
          >
            {m.offScreenSide === "left" ? "◀ " : ""}
            {m.vehicleId} · {m.distanceText} · {m.etaText}
            {m.isBlindZone ? " [ZC]" : ""}
            {m.offScreenSide === "right" ? " ▶" : ""}
          </div>
        ))}
      </div>

      {/* Top-right calibration & status HUD */}
      <div
        style={{
          position: "absolute",
          top: "0.75rem",
          right: "0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem",
          background: "rgba(15, 23, 42, 0.88)",
          padding: "0.6rem 0.8rem",
          borderRadius: "10px",
          fontSize: "0.78rem",
          maxWidth: "260px"
        }}
      >
        <div style={{ fontWeight: 700 }}>
          Brújula: {Math.round((headingDeg + offsetDeg + 360) % 360)}° (offset {offsetDeg}°)
        </div>
        <input
          aria-label="Calibración brújula"
          type="range"
          min={-180}
          max={180}
          step={1}
          value={offsetDeg}
          onChange={(e) => handleOffsetChange(Number(e.target.value))}
        />
        {iosNeedsPerm && (
          <button type="button" onClick={handleEnableIosCompass}>
            Habilitar brújula (iOS)
          </button>
        )}
        {!hasCompass && !iosNeedsPerm && (
          <div style={{ color: "#fde68a" }}>
            Sin brújula automática: usá el slider ±180° para orientar la vista.
          </div>
        )}
        {effectiveOrigin.isFallback && (
          <div style={{ color: "#bae6fd" }}>
            {geoError ?? "GPS adquiriendo"} — usando parada de referencia.
          </div>
        )}
        {userPos && (
          <div style={{ color: "#86efac" }}>
            GPS local activo (±{Math.round(userPos.accuracyMeters)} m)
          </div>
        )}
        {cameraError && <div style={{ color: "#fca5a5" }}>{cameraError}</div>}
      </div>
    </div>
  );
}
