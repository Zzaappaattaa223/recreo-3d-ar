import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { RouteGeoJSON, VehicleState } from "@recreo/shared";
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
}

export function ArXrayView({ routes, vehicles }: ArXrayViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);

  const [userPos, setUserPos] = useState<UserGeoPosition | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number>(0);
  const [offsetDeg, setOffsetDeg] = useState<number>(() => loadSavedCompassOffset());
  const [iosNeedsPerm, setIosNeedsPerm] = useState<boolean>(() => needsIosOrientationPermission());

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
    return watchCompassHeading(setHeadingDeg);
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
      6000
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
  }, [headingDeg, offsetDeg]);

  // Rebuild X-Ray bus silhouettes & elevated 300m route preview
  useEffect(() => {
    const group = groupRef.current;
    if (!group || !userPos) return;

    while (group.children.length > 0) {
      const child = group.children.pop()!;
      group.remove(child);
    }

    for (const v of vehicles) {
      const enu = latLonToEnu(userPos, v, 1.5);
      // Three.js: +X = East, +Y = Up, -Z = North
      const busColor = v.isBlindZoneEstimate
        ? 0xa855f7
        : v.direction === "ida"
          ? 0x06b6d4
          : 0xf59e0b;

      const geom = new THREE.BoxGeometry(2.6, 3.0, 11.0);
      const mat = new THREE.MeshBasicMaterial({
        color: busColor,
        transparent: true,
        opacity: v.lastRealPingAgeSec > 45 ? 0.3 : 0.65,
        blending: THREE.AdditiveBlending,
        depthTest: false
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(enu.east, enu.up, -enu.north);
      mesh.rotation.y = -THREE.MathUtils.degToRad(v.bearingDeg);
      group.add(mesh);
    }

    if (routes) {
      for (const feat of routes.features) {
        if (feat.geometry.type !== "LineString") continue;
        const pts: THREE.Vector3[] = [];
        for (const [lon, lat] of feat.geometry.coordinates) {
          const dist = haversineMeters(userPos, { lat, lon });
          if (dist <= 3000) {
            const enu = latLonToEnu(userPos, { lat, lon }, ROUTE_LINE_ELEVATION_M);
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
            opacity: 0.75,
            depthTest: false
          });
          const line = new THREE.Line(lineGeom, lineMat);
          line.computeLineDistances();
          group.add(line);
        }
      }
    }
  }, [vehicles, routes, userPos]);

  const hudItems = useMemo(() => {
    if (!userPos) return [];
    return vehicles
      .map((v) => {
        const dist = haversineMeters(userPos, v);
        const speed = v.speedMps >= 1 ? v.speedMps : FALLBACK_SPEED_MPS;
        const eta = Math.round(dist / speed);
        return {
          vehicleId: v.vehicleId,
          direction: v.direction,
          dist,
          eta,
          isBlindZone: v.isBlindZoneEstimate,
          isStale: v.lastRealPingAgeSec > 45
        };
      })
      .sort((a, b) => a.dist - b.dist);
  }, [vehicles, userPos]);

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

      <div
        style={{
          position: "absolute",
          top: "0.75rem",
          right: "0.75rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.4rem",
          background: "rgba(15, 23, 42, 0.85)",
          padding: "0.6rem 0.8rem",
          borderRadius: "10px",
          fontSize: "0.8rem",
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
        {cameraError && <div style={{ color: "#fca5a5" }}>{cameraError}</div>}
        {geoError && <div style={{ color: "#fca5a5" }}>{geoError}</div>}
        {!userPos && !geoError && <div>Obteniendo GPS local...</div>}
        {hudItems.map((item) => (
          <div key={item.vehicleId}>
            {item.vehicleId} · {formatDistance(item.dist)} · {formatEta(item.eta)}
            {item.isBlindZone ? " [ZC]" : ""}
            {item.isStale ? " (señal >45s)" : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
