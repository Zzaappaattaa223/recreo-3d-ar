# Goldfish Annotated Review Report

**Status:** resolved
**Target:** `SPEC_RECREO_3D_AR.md` (`full file`, lines 1–163)

## Prioritized Findings & AI Suggestions

### [B1] [`egm-zoom-out` / `egm-comprehension` / `egm-design` / `egm-implementation-readiness`] - Severity: High
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L15-L23) (`## 2. Fase 0 — Validación técnica previa`) & [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L158) (`Etapa 2`)
* **Discrepancy Description:** Phase 0 (L21) checks whether `cuandopasa.smartmovepro.net` returns direct vehicle GPS coordinates or only stop-level ETAs, yet the entire downstream architecture (`RawVehiclePing`, `mapMatcher.ts`, `interpolator.ts`, 3D/AR views) assumes direct vehicle coordinates exist with no fallback if only stop ETAs are available or if scraping is blocked.
* **Rationale:** Implementing a full spatial/kinematic pipeline before validating the single upstream data source risks invalidating the entire architecture.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid blocker. Phase 0 must be an explicit hard gate before Etapa 1, and the spec needs a defined fallback mode (e.g., virtual/schedule-based positioning or stop-ETA-only UI) if direct vehicle coordinates are unavailable.
* ***Proposed Edit:***
  * Location: `## 2. Fase 0 — Validación técnica previa` (L15–L23) and `## 4.1` / `Etapa 2` (L158)
  * Change: Mark Fase 0 as a mandatory blocking gate (`Gate 0`) before Etapa 1; add a **Plan de contingencia** defining degraded behavior (`sourceHealth: "degraded"` / stop-ETA-only mode or schedule-based virtual interpolation) if `cuandopasa.smartmovepro.net` only exposes stop ETAs or blocks server polling.

### [B2] [`egm-zoom-out` / `egm-comprehension` / `egm-design` / `egm-codebase-details`] - Severity: High
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L11) (`## 1`), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L44-L48) (`## 3`), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L91-L114) (`## 4.2`)
* **Discrepancy Description:** `GET /api/stream?line=recreo` uses a single shared polling cache (`caché único de polling`, L48) and accepts no user `lat`, `lon`, or `stopId`, yet emits per-user fields `distanceToUserMeters` and `etaSeconds` (L108–109) while L11 mandates 100% backend ETA calculation.
* **Rationale:** A shared O(1) broadcast stream cannot compute per-user distance or ETA without receiving each user's live GPS/stop, which breaks shared caching and creates O(N_users × N_vehicles) server state and location-privacy exposure.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid architectural contradiction. Splitting user-agnostic vehicle state from client-side (or on-demand per-stop) distance/ETA calculation resolves the contradiction cleanly and simplifies backend scaling.
* ***Proposed Edit:***
  * Location: L11, L44, L48, L91–114
  * Change: Make the backend stream/endpoint strictly user-agnostic (`VehicleState` without `distanceToUserMeters` or `etaSeconds`), and compute `distanceToUserMeters` + `etaSeconds` locally on the client against the cached `RouteGeoJSON` and `Stop` list (with an optional stateless `GET /api/eta?line=...&stopId=...` endpoint if stop-level server ETA is needed). Update L11 to state that upstream polling, caching, and map matching run on the backend while user-relative distance/ETA and frame-rate visual smoothing run on the client.

### [B3] [`egm-zoom-out` / `egm-design` / `egm-implementation-readiness`] - Severity: High
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L9-L10) (`## 1`), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L40-L61) (`## 3`), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L148-L159) (`## 7`)
* **Discrepancy Description:** Phase 1 MVP includes speculative VR WebXR (`VrModeBridge.tsx`) with zero hardware/interaction/iOS Safari spec, multi-engine 3D abstractions (`MapLibre GL` vs. `CesiumJS` vs. `Google Photorealistic 3D Tiles`), and `lineaCAdapter.ts` stubs.
* **Rationale:** Violates YAGNI and multiplies frontend complexity before the core Recreo tracker is proven.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid scope bloat. Deferring VR WebXR and multi-engine 3D abstractions out of Phase 1 MVP keeps the first release focused on MapLibre GL 3D + optional AR "Rayos X" (isolated as Phase 1B after the 3D map works).
* ***Proposed Edit:***
  * Location: L9–10, L22, L40, L59–61, L148, L152, L159
  * Change: Lock Phase 1 MVP to **MapLibre GL (OSM 3D)** as the single 3D map engine (removing `CesiumJS` abstraction), move **VR WebXR (`VrModeBridge.tsx`)** and **Línea C (`lineaCAdapter.ts`)** to **Fuera de alcance (Non-Goals) / Fases futuras**, and sequence **AR "Rayos X" (`ArXrayView.tsx`)** as an isolated Phase 1B milestone after the core 3D map tracker passes local validation.

### [B4] [`egm-design` / `egm-structural`] - Severity: High
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L1-L143) (`FeatureRange`)
* **Discrepancy Description:** Missing mandatory `feature-spec-standard.md` sections: **Problem Statement** (why 3D/AR over existing 2D trackers), **Alternatives Considered** (rejected options and trade-offs), and **Risks & Mitigations**.
* **Rationale:** Without these sections, a fresh reader cannot verify motivation, architectural trade-offs, or failure/security mitigations.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid structural and design omissions required by `feature-spec-standard.md`.
* ***Proposed Edit:***
  * Location: Top of `SPEC_RECREO_3D_AR.md` (before/within Section 1) and new sections before the execution runbook
  * Change: Add `## 1. Planteo del problema`, `## 2. Alcance, objetivos y no-objetivos (Non-Goals)`, `## 7. Alternativas consideradas`, and `## 8. Riesgos, límites y mitigaciones` (covering upstream scraping/WAF breakage, sensor drift, SSE/API rate limiting, and user-location privacy).

### [B5] [`egm-comprehension` / `egm-design` / `egm-implementation-readiness` / `egm-codebase-details`] - Severity: High
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L33) (`shared/types/transit.ts`), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L46) (`api.ts`), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L75-L114) (`## 4`), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L157) (`Etapa 1`)
* **Discrepancy Description:** `VehicleState`, `RouteGeoJSON`, `Stop`, `StreamEvent`, `sourceHealth` union values, and `GET /api/lines` / `GET /api/stops` schemas are referenced but never defined in TypeScript; `fetchActiveVehicles(lineCode: string)` (L87) does not use the `lineCode` union type.
* **Rationale:** Violates the Zero-Decision Rule for Etapa 1.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid blocker. Defining exact TypeScript interfaces in Section 4 removes contract ambiguity.
* ***Proposed Edit:***
  * Location: Section 4 (`## 4. Contrato de datos unificado`)
  * Change: Add exact TypeScript definitions for `LineCode`, `SourceHealth` (`"live" | "stale" | "degraded" | "offline" | "simulated"`), `VehicleState`, `Stop`, `RouteGeoJSON`, `StreamEvent`, and REST responses for `GET /api/lines` and `GET /api/stops`, and type `fetchActiveVehicles(lineCode: LineCode)`.

### [B6] [`egm-comprehension` / `egm-implementation-readiness` / `egm-codebase-details`] - Severity: High
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L50) (`recreo_routes.geojson`), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L157) (`Etapa 1`)
* **Discrepancy Description:** Etapa 1 requires loading `backend/data/recreo_routes.geojson`, but provides no coordinates, stop list, retrieval source (e.g., OSM Overpass / municipal GTFS / manual trace), or GeoJSON feature/property schema.
* **Rationale:** An implementer cannot create or validate `recreo_routes.geojson` without inventing coordinates or guessing property names.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid blocker. We must specify the exact GeoJSON feature/property schema and the concrete source/script to obtain or mock the initial Recreo route geometry for Etapa 1.
* ***Proposed Edit:***
  * Location: Section 4 / Etapa 1
  * Change: Define the exact GeoJSON schema (`FeatureCollection` with `LineString` features having `lineCode`, `branch`, `direction: "ida" | "vuelta"` and `Point` stop features having `stopId`, `name`, `lineCode`, `branch`, `sequence`) and specify that Etapa 1 uses an explicit synthetic/OSM-derived Santa Fe–Recreo corridor fixture with documented validation steps in Fase 0.

### [B7] [`egm-design` / `egm-implementation-readiness`] - Severity: High
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L42-L44) (`engine/`), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L104-L110), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L157) (`Etapa 1`)
* **Discrepancy Description:** `mapMatcher.ts`, `interpolator.ts`, and `etaCalculator.ts` lack algorithms, thresholds, and edge-case rules (max snap distance for `snappedToRoute`, inbound/outbound disambiguation, terminus clamping, stale-ping extrapolation limit, zero-speed ETA fallback).
* **Rationale:** Leaves core kinematic math and edge-case behavior unspecified.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid blocker. Even if ETA moves to the client (per B2), `mapMatcher.ts` and client/server interpolation still need explicit constants and edge-case rules.
* ***Proposed Edit:***
  * Location: New subsection in Section 4/5 (`Reglas del motor espacial y cinemático`)
  * Change: Specify concrete constants and edge-case rules: `MAX_SNAP_DISTANCE_METERS = 60`, direction disambiguation via previous ping + bearing cosine similarity (`>= 0`), terminus clamping (`[0, routeLength]`), `MAX_EXTRAPOLATION_SEC = 45` (`lastRealPingAgeSec > 45` freezes motion and marks stale), and default fallback speed (`25 km/h` / `6.94 m/s`) when `speedMps < 1`.

### [B8] [`egm-comprehension` / `egm-implementation-readiness` / `egm-codebase-details`] - Severity: High
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L27-L66) (`## 3`), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L157-L162) (`## 7`)
* **Discrepancy Description:** Monorepo workspace manager (`npm`/`pnpm`), `package.json` manifests, `tsconfig.json`, Node.js version, ESM/CJS, test runner (Vitest), SSE implementation, and exact frontend packages (`maplibre-gl`, `three`, `vite-plugin-pwa`) are unspecified.
* **Rationale:** Violates the Zero-Decision Rule for setting up a buildable, testable monorepo in Etapa 1.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid blocker. Locking the exact stack and CLI commands ensures Etapa 1 produces a clean, buildable workspace.
* ***Proposed Edit:***
  * Location: Section 3 (`Stack y configuración de monorepo`) and Etapa 1
  * Change: Specify `npm workspaces` (`recreo-3d-ar/` as repo root or current workspace), Node.js `>= 20` (ESM), TypeScript `5.x`, `fastify` + `@fastify/cors`, `vitest` for unit/integration tests, `react` + `vite` + `maplibre-gl` + `three` + `vite-plugin-pwa`, plus exact `npm test` and `npm run build` verification commands.

---

### [M1] [`egm-design` / `egm-structural`] - Severity: Medium
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L7-L12) (`## 1`)
* **Discrepancy Description:** Missing explicit **Non-Goals** subsection.
* **Rationale:** Required by `feature-spec-standard.md` to bound MVP scope.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid improvement that directly pairs with B3.
* ***Proposed Edit:***
  * Location: Section 1/2 (`Objetivos y No-Objetivos`)
  * Change: Add explicit Non-Goals: no VR WebXR in Phase 1, no native Capacitor/ARCore in Phase 1, no fare/ticketing or offline routing, no guaranteed sub-meter AR occlusion in Phase 1.

### [M2] [`egm-design` / `egm-structural` / `egm-zoom-out`] - Severity: Medium
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L135-L163) (`## 6` & `## 7`)
* **Discrepancy Description:** Section 6 (Antigravity IDE plugins and credit-saving strategy) and Section 7 (execution prompt) mix meta-workflow instructions into the technical feature specification.
* **Rationale:** Obscures the system design for a fresh reader; belongs in a separate appendix/runbook section clearly delineated from the architecture spec.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid structural separation. Keep them in the document as an explicit **Anexo de ejecución (Google Antigravity)** at the end (since the user uses this doc to drive Antigravity) while keeping Sections 1–8 strictly architectural.
* ***Proposed Edit:***
  * Location: Lines 135–163
  * Change: Rename and group Sections 6–7 under `## Anexo: Plan de implementación y ejecución en Google Antigravity` with impersonal register.

### [M3] [`egm-implementation-readiness` / `egm-codebase-details`] - Severity: Medium
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L29-L66) vs. [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L156-L161)
* **Discrepancy Description:** Several files in Section 3 (`mapMatcher.ts`, `api.ts`, `transitClient.ts`, `App.tsx`, `manifest.webmanifest`, `vite.config.ts`) are unassigned to any stage, `Create`/`Modify` markers are missing, and the test plan lacks concrete test cases/fixtures.
* **Rationale:** Leaves implementers guessing which files belong to which stage and what edge cases to test.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid readiness gap.
* ***Proposed Edit:***
  * Location: Detailed Implementation Plan (Etapas 1–4)
  * Change: Map every retained file to an explicit stage with `[Create]`/`[Modify]` markers and add a concrete test matrix per stage (validating off-route snap, terminus clamp, stale ping > 45 s, missing `rawSpeedMps`, and SSE/REST endpoints).

### [M4] [`egm-design` / `egm-comprehension` / `egm-implementation-readiness`] - Severity: Medium
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L23), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L56-L60), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L123-L127), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L160)
* **Discrepancy Description:** Mobile WebAR sensors lack iOS `DeviceOrientationEvent.requestPermission()` flow, `webkitCompassHeading` vs. Android `deviceorientationabsolute`, `359°→0°` wrap-around math, low-pass alpha, GPS accuracy cutoff, ENU altitude handling, and wider calibration (`±20°` is insufficient for 30°–180° urban magnetic drift).
* **Rationale:** Without these parameters, `ArXrayView` will fail on iOS Safari and misalign in urban environments.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid technical gap for the WebAR milestone.
* ***Proposed Edit:***
  * Location: Section 5 (`ArXrayView`) and Etapa 4
  * Change: Specify iOS permission button + `webkitCompassHeading` normalization, circular low-pass filter (`alpha = 0.15` over `sin`/`cos`), widen manual offset to `±180°` (with `1°` steps), `MAX_GPS_ACCURACY_METERS = 50`, flat-ground ENU assumption (`Up = +1.5 m` eye height, elevated route line at `+4 m`), and fallback banner when sensors are denied or `lastRealPingAgeSec > 45`.

### [M5] [`egm-design`] - Severity: Medium
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L23), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L46-L48), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L91-L113)
* **Discrepancy Description:** Missing security, abuse-prevention, and privacy controls (CORS policy, rate limiting, TLS/WSS, client-only GPS).
* **Rationale:** Public streaming/API endpoints without rate limits or CORS are vulnerable to abuse.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid security requirement; addressed in the new Risks & Mitigations section and backend config.
* ***Proposed Edit:***
  * Location: `## 8. Riesgos, límites y mitigaciones` and backend spec
  * Change: Require strict CORS allowlist, per-IP rate limiting on `/api/*`, HTTPS/TLS in production (and Cloudflare Tunnel/ngrok for Fase 0 mobile testing), and strictly client-side user GPS (no PII/location logged or persisted on server).

### [M6] [`egm-comprehension` / `egm-style` / `egm-codebase-details`] - Severity: Medium
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L11), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L21), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L47), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L54), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L91), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L157-L158)
* **Discrepancy Description:** Inconsistent transport (`SSE o /ws` vs. `SSE`), render cadence (`1–2 segundos` vs. `1 Hz`), and polling interval (`10–30 s` vs. hardcoded `15 s`).
* **Rationale:** Contradictory numbers confuse implementation.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid consistency fix.
* ***Proposed Edit:***
  * Location: L11, L47, L54, L158
  * Change: Standardize on **SSE (`GET /api/stream`)** (removing `/ws` ambiguity), **1 Hz** stream emission, and configurable `POLL_INTERVAL_MS = 15000` (adjustable per Fase 0 findings).

### [M7] [`egm-comprehension` / `egm-codebase-details`] - Severity: Medium
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L10), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L40), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L77), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L154)
* **Discrepancy Description:** Unclear how `Línea C` schedule-only data maps to `RawVehiclePing` (`lat`, `lon`, `reportedAtMs`).
* **Rationale:** Ambiguous future adapter contract.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid clarification, resolved cleanly by deferring `lineaCAdapter.ts` to Future Phases (per B3) and noting that schedule-based adapters synthesize virtual `lat`/`lon` along the route polyline.
* ***Proposed Edit:***
  * Location: Section 1/2 (Non-Goals / Future Phases) and Section 4.1
  * Change: Document that future schedule-only adapters project timetable progress onto `RouteGeoJSON` to emit synthetic `RawVehiclePing` coordinates.

### [M8] [`egm-style`] - Severity: Medium
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L3-L163)
* **Discrepancy Description:** Colloquialisms (*"sin desperdiciar créditos"*, *"vive en el backend"*, *"celular"*, *"Arrancá usando"*, *"enchufar"*, *"buses suavizados"*), register shift to *voseo* in Section 6, unquantified *"error despreciable"* (L125), ambiguous *"Slider discreto"* (L127) and *"precisión métrica"* (L131).
* **Rationale:** Technical specs require uniform, precise, impersonal register.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Valid style and precision fixes.
* ***Proposed Edit:***
  * Location: Throughout `SPEC_RECREO_3D_AR.md`
  * Change: Standardize on impersonal technical Spanish, quantify equirectangular ENU error (`< 0.1 %` / `< 5 m` at `5 km` radius), clarify *"control deslizante compacto en pantalla con pasos de 1°"*, clarify *"escala real (en metros) sujeta a cobertura VPS"*, and replace colloquialisms.

---

### [N1] [`egm-structural`] - Severity: Low
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L72-L131)
* **Discrepancy Description:** Inconsistent H3 numbering (`### 4.1`/`4.2` vs. `### Fase 1`) and missing blank lines before lists in Section 5.
* **Rationale:** Minor formatting asymmetry.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Worth fixing while editing Section 5.
* ***Proposed Edit:***
  * Location: Section 5
  * Change: Standardize H3 subheadings (`### 5.1`, `### 5.2`) with blank lines before lists.

### [N2] [`egm-implementation-readiness`] - Severity: Low
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L39), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L126), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L157)
* **Discrepancy Description:** `mockAdapter.ts` seed parameters and AR HUD label rounding rules (`< 60 s`, `>= 1000 m`) are unspecified.
* **Rationale:** Minor implementation detail.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Easy to specify alongside Stage 1 and Stage 4 details.
* ***Proposed Edit:***
  * Location: Section 4 / Etapa 1 & Etapa 4
  * Change: Specify `mockAdapter` default (2 units per line, `REC-01`/`REC-02`, constant `8.3 m/s` / `30 km/h`) and HUD formatting (`< 60 s` → `"< 1 min"`, `>= 1000 m` → `"1.2 km"`).

### [N3] [`egm-design`] - Severity: Low
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L22)
* **Discrepancy Description:** Missing explicit HTTP referrer restrictions and daily quota caps if Google Photorealistic 3D Tiles API key is used.
* **Rationale:** Cost-control guardrail.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Worth adding in one sentence in Fase 0.
* ***Proposed Edit:***
  * Location: Fase 0 table, row 2 (L22)
  * Change: Add requirement for HTTP referrer restriction and daily quota cap on any Google Cloud API key.

### [N4] [`egm-comprehension` / `egm-style`] - Severity: Low
* **Affected Scope:** [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L9), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L17), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L27), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L39), [SPEC_RECREO_3D_AR.md](SPEC_RECREO_3D_AR.md#L148)
* **Discrepancy Description:** Minor prose cleanup (`AR "Rayos X"` explained on first mention, remove *"verificaciones rápidas"*, *"liviano/a"*, *"para dev sin red"*, and prompt persona filler *"Actuá como..."*).
* **Rationale:** Improves readability.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Quick cleanup during the batch edit.
* ***Proposed Edit:***
  * Location: L9, L17, L27, L39, L123, L148
  * Change: Apply concise technical phrasing across these lines.
