# Stage 6 — Comprehension Test (`SPEC_RECREO_3D_AR.md`)

## What this proposes
This document proposes building a real-time bus tracking application for the "Recreo" and "Recreo Semirrápido" bus lines in Santa Fe, Argentina, featuring three client views: a 3D map, a web-based "X-Ray" augmented reality (AR) view, and a WebXR virtual reality (VR) mode. It outlines a modular monorepo architecture (a Fastify/TypeScript backend and a React/Vite/Three.js Progressive Web App frontend) in which all data polling, map matching, 1 Hz kinematic interpolation, and ETA calculations run on the backend, enabling the client to later scale to a native mobile app (via Capacitor and ARCore) without rewriting core logic. It also defines a zero-cost pre-validation phase (Phase 0), unified data contracts, a phased AR scaling roadmap, Google Antigravity setup instructions, and a four-stage execution prompt (lines 145–163) to build the system incrementally.

## How the existing system works, per this document
No custom codebase or application exists yet; this is a greenfield planning specification. As an external data source, the document references an existing transit service called "Cuando pasa SFC" and its web portal (`cuandopasa.smartmovepro.net`) that covers the Recreo and Recreo Semirrápido lines, though its exact payload format (JSON/XML), refresh interval, and whether it returns direct vehicle coordinates or only per-stop ETAs are unknown and must be inspected in Phase 0. It also references existing external platforms and tooling—Google Photorealistic 3D Maps/Tiles, OpenStreetMap 3D (MapLibre GL / CesiumJS), and Google Antigravity with its Marketplace plugins—as available infrastructure to evaluate or configure before development.

---

### Findings

1. **Severity**: Blocker
   **Affected Scope**: Per-user fields on shared stream (`backend/src/routes/stream.ts`, lines 44, 48, 91, 108–109)
   **Discrepancy Description & Rationale**: `GET /api/stream?line=recreo` (line 91) only shows a `line` query parameter, and `server.ts` (line 48) uses a "caché único de polling" (single polling cache). However, the stream event payload includes user-specific fields: `"distanceToUserMeters": 640` (line 108) and `"etaSeconds": 115` (line 109, described at line 44 as "ETA a parada del usuario"). The document does not explain how the backend receives the user's GPS coordinates or target stop, nor how a shared 1 Hz SSE stream computes per-user distance and ETA.

2. **Severity**: Blocker
   **Affected Scope**: Phase 0 Contingency (`Verificación 1. Feed de Recreo`, line 21 vs. Sections 3, 4, 7)
   **Discrepancy Description & Rationale**: Line 21 explicitly warns that Phase 0 must verify whether `cuandopasa.smartmovepro.net` returns direct vehicle coordinates or *only ETA per stop* ("si devuelve coordenadas directas de unidades o solo ETA por parada"). Yet the entire downstream architecture—`RawVehiclePing` requiring `lat`/`lon` (lines 79–80), `mapMatcher.ts` (line 42), `interpolator.ts` (line 43), and Stage 2 (`cuandoPasaAdapter.ts`, line 158)—assumes direct vehicle coordinates exist. There is no fallback architecture or decision branch explaining how the system works if only stop ETAs are available.

3. **Severity**: Major
   **Affected Scope**: Undefined / Unexplained Project & Domain Concepts (`Google Antigravity`, `créditos`, `VR WebXR`, `Línea C`, `PWA`, `Capacitor`)
   **Discrepancy Description & Rationale**:
   - **Google Antigravity & "créditos"** (lines 3, 135–141, 145): Referenced as the execution platform with credit-saving rules and 4 separate sessions, without defining what Antigravity is, how credits work, or linking to documentation.
   - **VR WebXR mode** (`VrModeBridge.tsx`, lines 9, 61, 148, 159): Listed as one of the three core views, but unlike `ArXrayView` (Section 5), the document never explains what the VR mode renders, how the user interacts with it, or what hardware/browsers it targets beyond "Entrada WebXR reutilizando la escena 3D".
   - **Línea C (Santo Tomé) with "horarios estimados"** (lines 10, 40, 77, 154): Line 10 states it will be added via `TransitSourceAdapter` using either future GPS or estimated schedules. However, `TransitSourceAdapter.fetchActiveVehicles` returns `RawVehiclePing[]` (lines 75–88), which requires `lat`, `lon`, and `reportedAtMs`. It is unclear how schedule-only data maps to this interface.
   - **PWA** (lines 3, 11, 23, 51, 64, 123, 130, 148) and **Capacitor** (lines 11, 130, 148): Used without spelling out "Progressive Web App" or defining/linking Capacitor.

4. **Severity**: Major
   **Affected Scope**: Missing Type Definitions & Unspecified `sourceHealth` States (`shared/types/transit.ts`, lines 33, 96, 157)
   **Discrepancy Description & Rationale**: Line 33 lists `VehicleState`, `RouteGeoJSON`, and `Stop` as shared contracts in `shared/types/transit.ts`, and Stage 1 (line 157) instructs the implementer to define `VehicleState`. However, Section 4 only defines `RawVehiclePing` and `TransitSourceAdapter`, plus an untyped JSON example (lines 93–114) without naming `VehicleState` or defining `RouteGeoJSON` and `Stop`. Similarly, line 96 shows `"sourceHealth": "live"`, but no other allowed values (e.g., stale, degraded, offline) are defined, making Stage 2's "manejo de fallback si el origen falla" (line 158) ambiguous.

5. **Severity**: Major
   **Affected Scope**: Source & Validation of Route Data (`backend/data/recreo_routes.geojson`, lines 50, 157)
   **Discrepancy Description & Rationale**: Line 50 references "Trazas y paradas validadas de Recreo ida/vuelta" and Stage 1 (line 157) requires loading an initial GeoJSON of the Recreo route. The document does not state where to obtain the official route geometry and stop coordinates for Recreo and Recreo Semirrápido, or how to validate them.

6. **Severity**: Major
   **Affected Scope**: Ambiguous Transport, Refresh Rate, and 3D Map Choices (lines 11, 21–22, 47, 54, 59, 91, 152, 157–158)
   **Discrepancy Description & Rationale**:
   - **SSE vs. WebSocket**: Lines 47 and 54 say `SSE o /ws (WebSocket)`, while lines 91 and 157 specify SSE `/api/stream`.
   - **Client render cadence vs. stream rate**: Line 11 says the client renders normalized states every `1–2 segundos`, while lines 91 and 157 specify a `1 Hz` stream.
   - **Polling interval**: Line 21 says typical GPS refresh is `10–30 s`, whereas Stage 2 (line 158) hardcodes `15 s` without stating whether it is configurable based on Phase 0 results.
   - **CesiumJS**: Listed as an option in lines 22 and 59, but omitted in the Stage 1–4 prompt (line 152 only mentions MapLibre GL and Google Photorealistic 3D Tiles).

7. **Severity**: Major
   **Affected Scope**: Unstated Assumptions on External Access, Tech Stack, and Mobile Sensors (lines 21, 23, 57, 125–127, 157)
   **Discrepancy Description & Rationale**:
   - **External API access**: Assumes `cuandopasa.smartmovepro.net` exposes an unauthenticated, scrapeable/callable XHR/Fetch endpoint without CORS, rate-limiting, or anti-bot restrictions blocking a backend server.
   - **Tech stack & tooling**: Implies React (`.tsx`), Vite (`vite.config.ts`), Three.js, Node.js, and a unit test runner (line 157), without specifying package versions, monorepo workspace manager, or test framework.
   - **Mobile compass & AR elevation**: Line 23 and 57 mention `DeviceOrientationEvent` and a low-pass filter, but omit iOS's mandatory `DeviceOrientationEvent.requestPermission()` flow and `webkitCompassHeading` vs. `alpha` differences. Line 125–126 projects `(lat, lon)` to flat ENU coordinates and draws an "elevated dotted line", without specifying how altitude/Up (`U` in ENU) or bus orientation (`bearingDeg`) are applied in Three.js.

8. **Severity**: Nit
   **Affected Scope**: Term Ordering (`AR "Rayos X"`, lines 1, 9, 60, 121–126)
   **Discrepancy Description & Rationale**: The term `AR "Rayos X"` appears in the title (line 1), Section 1 (line 9), and Section 3 (line 60) before being explained in Section 5 (line 126). Adding a brief parenthetical or forward reference in Section 1 would improve first-read comprehension.
