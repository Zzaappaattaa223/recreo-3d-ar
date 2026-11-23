# Stage 9 — Implementation Readiness Test (`SPEC_RECREO_3D_AR.md`, `DetailedRange`: lines 145–163)

**Verdict: FAIL** — `DetailedRange` (with context L1–143) is an architectural prompt/blueprint rather than an implementation-ready plan. It violates the **Zero-Decision Rule** across data contracts, source data, algorithms, tooling, and test specifications. (Workspace check: `c:\Users\I-MAG\proyectos AI\Esta´Jaí` contains only `SPEC_RECREO_3D_AR.md`; greenfield repo.)

---

### 🔴 Blockers

1. **Missing & Undefined Core TypeScript Contracts (`shared/types/transit.ts`, `api.ts`, `stream.ts` — L33, L46–47, L91–114, L157):**
   - Only `RawVehiclePing` and `TransitSourceAdapter` (L75–88) are formally typed.
   - `VehicleState`, `RouteGeoJSON`, `Stop`, `StreamEvent`, `sourceHealth` union values, and `GET /api/lines` / `GET /api/stops` schemas are undefined.
2. **Contradiction Between `etaCalculator.ts`, `distanceToUserMeters`, and `GET /api/stream?line=recreo` (L11, L44, L48, L91, L108–109):**
   - `GET /api/stream?line=recreo` accepts neither user `lat`/`lon` nor `stopId`, and `server.ts` uses a single polling cache, making backend per-user `distanceToUserMeters` and `etaSeconds` computation impossible as specified.
3. **Missing Source Data & Schema for `backend/data/recreo_routes.geojson` (L50, L157):**
   - Etapa 1 requires loading an initial GeoJSON for Recreo, but provides no coordinates, stop list, retrieval source, or GeoJSON feature/property schema.
4. **Undefined Upstream Feed & Fallback State Machine for `cuandoPasaAdapter.ts` (L21, L38, L116, L158):**
   - Etapa 2 requires implementing `cuandoPasaAdapter.ts` with 15 s polling and fallback, while Fase 0 (L21) defers discovering the endpoint URL, format, and whether vehicle coordinates even exist. Fallback behavior (stale cache vs. `mockAdapter` vs. empty) is unspecified.
5. **Unspecified Monorepo Tooling, Dependencies, Build/Test Commands & MapLibre↔Three.js↔WebXR Binding (L27–66, L59–61, L152, L157–162):**
   - Package manager/workspaces, `tsconfig.json`, Node.js version, module system (ESM/CJS), test runner (Vitest/Jest/`node:test`), SSE implementation, and exact frontend packages (`maplibre-gl`, `three` vs. `@react-three/fiber`, `vite-plugin-pwa`) are omitted.
   - L61 states `VrModeBridge.tsx` reuses `Map3DView.tsx`'s 3D scene without specifying how MapLibre GL integrates with Three.js/WebXR.
6. **Unspecified Core Engine Algorithms, Thresholds & Edge Cases (`mapMatcher.ts`, `interpolator.ts`, `etaCalculator.ts` — L42–44, L104–110, L157):**
   - Missing max snap distance for `snappedToRoute`, ida/vuelta disambiguation, out-of-order pings, initial speed/bearing calculation, max extrapolation timeout, terminus clamping, and stationary/passed-stop ETA behavior.

---

### 🟡 Majors

7. **Missing Concrete Test Plan & Edge-Case Assertions (L157–162):**
   - Etapa 1 requests generic unit tests for `interpolator` and `etaCalculator` without fixtures, edge cases (stale pings, off-route GPS, route wrap-around, missing `rawSpeedMps`), or tests for `mapMatcher.ts`, `mockAdapter.ts`, SSE `/api/stream`, and Stages 2–4.
8. **Incomplete File-to-Stage Mapping & Missing `Create`/`Modify` Markers (L29–66 vs. L156–161):**
   - `mapMatcher.ts`, `lineaCAdapter.ts`, `api.ts`, `transitClient.ts`, `geoSensor.ts`, `orientationSensor.ts`, `App.tsx`, `manifest.webmanifest`, and `vite.config.ts` are never assigned to any stage; workspace root vs. `recreo-3d-ar/` nesting is ambiguous.
9. **Unspecified Mobile Sensor & WebAR Parameters (`ArXrayView.tsx`, `geoSensor.ts`, `orientationSensor.ts` — L23, L56–57, L60, L116, L123–127, L160):**
   - Missing low-pass filter alpha, `359°→0°` wrap-around math, iOS `DeviceOrientationEvent.requestPermission()`, GPS accuracy cutoff, Three.js camera FOV matching, dotted line elevation height, `±20°` offset persistence, and UI behavior for `lastRealPingAgeSec > 45` or denied permissions.
10. **Style — Informal & Imprecise Phrasing in `DetailedRange` (L152, L159):**
    - L152 uses colloquialisms (*"Arrancá usando"*, *"enchufar"*, *"más adelante si validamos cobertura"*).
    - L159 uses imprecise *"buses suavizados"* and `+` instead of specifying client-side interpolation between 1 Hz SSE ticks.

---

### 🟢 Nits

11. **Mock Seed Parameters & AR HUD Formatting Rules (L39, L109, L126, L157, L160):** Specify unit count/IDs/speed profile for `mockAdapter.ts` and rounding/unit rules (`< 60 s`, `>= 1000 m`) for the AR HUD label.
12. **Contract List Omission in Etapa 1 Prompt (L33 vs. L157):** Explicitly list `RawVehiclePing`, `RouteGeoJSON`, and `Stop` alongside `VehicleState` and `TransitSourceAdapter`.
13. **Style — Minor Boilerplate & Wordiness in `DetailedRange` (L148, L153–154, L158, L160, L162):** Remove persona filler (*"Actuá como..."*), replace *"en tiempo real"* / *"vivir en el backend"* / *"detrás de una interfaz"*, and fix *"manejo de fallback si el origen falla"* redundancy.
