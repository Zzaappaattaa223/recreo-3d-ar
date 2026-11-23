# Consolidated EGM Review Report — `SPEC_RECREO_3D_AR.md`

**Target Document:** [SPEC_RECREO_3D_AR.md](file:///c:/Users/I-MAG/proyectos%20AI/Esta%C2%B4Ja%C3%AD/SPEC_RECREO_3D_AR.md)
**Semantic Split:** `FeatureRange` = L1–143 | `DetailedRange` = L145–163
**Overall Verdict:** **FAIL** across Zoom Out (Stages 5 & 8), Feature Spec (Stage 7), and Implementation Readiness (Stage 9).

> [!IMPORTANT]
> **Core Takeaway:** Do **not** patch this specification by adding more backend infrastructure (Redis Pub/Sub for 1 Hz SSE, user-GPS streaming, or complex map-matching/WebAR edge-case engines). Stages 5–8 converge on the same conclusion: **execute Phase 0 first as a hard gate**, resolve the shared-cache vs. per-user-ETA contradiction by moving interpolation/ETA to the client, and prune speculative Phase 1 scope (VR WebXR, custom WebAR, multi-engine 3D abstractions) until a core Recreo tracker works end-to-end.

---

## 1. Consolidated Action Items by Priority

### 🔴 Blockers (Must Resolve Before Implementation)

| ID | Action Item | Summary & Concrete Fix |
| :--- | :--- | :--- |
| **B1** | **Make Phase 0 a Hard Gate & Define Stop-ETA Fallback** | `cuandopasa.smartmovepro.net` has not been verified (L21). If it returns only stop-level ETAs (or blocks server scraping via WAF/rate-limiting), `RawVehiclePing` (`lat`/`lon`), `mapMatcher.ts`, `interpolator.ts`, and 3D/AR positioning cannot work. Require Phase 0 completion before Etapa 1 and define a fallback architecture (stop-ETA display or schedule-based estimation). |
| **B2** | **Resolve Shared-Cache vs. Per-User ETA Contradiction** | `GET /api/stream?line=recreo` (L91) uses a single polling cache (`caché único de polling`, L48) and accepts no user `lat`/`lon`/`stopId`, yet emits `distanceToUserMeters` and `etaSeconds` (L108–109). Either keep the backend strictly user-agnostic (`GET /api/vehicles?line=recreo` or user-agnostic stream) and compute distance/ETA + smooth `lerp` on the client, or define an explicit per-stop endpoint (`GET /api/eta?line=...&stopId=...`). |
| **B3** | **Prune Speculative MVP Scope (VR WebXR & Multi-Engine 3D)** | Remove `VrModeBridge.tsx` (WebXR) from Phase 1 MVP (zero hardware/interaction/iOS Safari spec) and defer custom WebAR "Rayos X" + multi-engine 3D abstractions (`CesiumJS`, Google 3D Tiles, Capacitor/ARCore, `lineaCAdapter.ts`) to explicit **Non-Goals / Future Phases** until the core 2D/2.5D MapLibre GL tracker is validated. |
| **B4** | **Add Required Feature-Spec Sections (`Problem Statement`, `Alternatives Considered`, `Risks & Mitigations`)** | `FeatureRange` violates `feature-spec-standard.md` by omitting: (1) Problem Statement (why 3D/AR over existing 2D trackers), (2) Alternatives Considered (stateless cache + client `lerp` vs. 1 Hz stateful SSE; 2D/2.5D map vs. custom WebAR), and (3) Risks & Mitigations (scraping breakage, sensor drift, security/rate-limiting, privacy). |
| **B5** | **Define Missing Core TypeScript Contracts & API Schemas** | `shared/types/transit.ts` (L33) and Etapa 1 (L157) reference `VehicleState`, `RouteGeoJSON`, `Stop`, `GET /api/lines`, `GET /api/stops`, and `sourceHealth` states without defining their TypeScript interfaces or HTTP schemas. Also fix `fetchActiveVehicles(lineCode: string)` (L87) to use the `lineCode` union type. |
| **B6** | **Provide `recreo_routes.geojson` Source Data & Schema** | Etapa 1 requires loading `backend/data/recreo_routes.geojson` (L50, L157) with no coordinates, stop list, retrieval source, or GeoJSON feature/property schema. Supply the source or exact schema/fixture. |
| **B7** | **Specify Engine Algorithms, Thresholds & Edge Cases** | If backend `mapMatcher.ts`, `interpolator.ts`, and `etaCalculator.ts` are retained, specify exact snap thresholds, inbound/outbound disambiguation, terminus clamping, zero-speed ETA fallback, and stale-ping timeout. (Alternatively, eliminate backend interpolation/ETA per B2.) |
| **B8** | **Lock Monorepo Tooling, Dependencies & Build/Test Commands** | Specify workspace manager (`npm`/`pnpm`), `package.json` manifests, `tsconfig.json`, Node.js version, ESM/CJS, test runner (e.g., Vitest), exact npm dependencies, and MapLibre↔Three.js↔WebXR integration (if kept). |

---

### 🟡 Majors (Should Resolve for Clarity, Quality & Readiness)

| ID | Action Item | Summary & Concrete Fix |
| :--- | :--- | :--- |
| **M1** | **Add Explicit `Non-Goals` Subsection** | Bound Phase 1 scope explicitly in Section 1 (e.g., no fare/ticketing, no offline routing, no VR, no native ARCore in MVP). |
| **M2** | **Separate Meta-Workflow Runbook from Feature Spec** | Move Section 6 (Antigravity plugins/credit strategy) and Section 7 (execution prompt) into a separate runbook/appendix so the feature spec stays focused on system design. |
| **M3** | **Define Concrete Test Plan & Stage File Mapping** | Add a per-stage test matrix (happy path + edge cases: stale ping > 45 s, off-route GPS, terminus wrap-around, missing `rawSpeedMps`) and assign every file in Section 3 (`mapMatcher.ts`, `api.ts`, `transitClient.ts`, `App.tsx`, `manifest.webmanifest`, `vite.config.ts`) to a stage with `Create`/`Modify` markers. |
| **M4** | **Specify Mobile Sensor & WebAR Parameters (If Retained)** | Address iOS `DeviceOrientationEvent.requestPermission()` and `webkitCompassHeading`, widen magnetic calibration beyond `±20°` (urban interference is 30°–180°), specify low-pass filter alpha, `359°→0°` wrap-around, GPS accuracy cutoff, ENU altitude handling, and denied-permission UI. |
| **M5** | **Add Security, Rate-Limiting & Privacy Controls** | Define CORS policy, SSE/API rate limiting, TLS/WSS enforcement, and client-side-only user GPS handling. |
| **M6** | **Reconcile Transport, Cadence & Polling Inconsistencies** | Resolve `SSE o /ws` (L47/54) vs. `SSE` (L91/157), `1–2 segundos` (L11) vs. `1 Hz` (L91), and `10–30 s` (L21) vs. hardcoded `15 s` (L158). |
| **M7** | **Clarify `Línea C` Schedule-to-GPS Mapping** | Explain how `lineaCAdapter.ts` (horarios estimados, L10/40) maps schedule data into `RawVehiclePing` (`lat`, `lon`, `reportedAtMs`), or defer it cleanly. |
| **M8** | **Fix Style, Register & Precision Issues** | Unify Spanish technical register (eliminate *voseo* in Section 6, colloquialisms like *"vive en el backend"*, *"celular"*, *"Arrancá usando"*, *"enchufar"*, *"buses suavizados"*); quantify *"error despreciable"* (L125); clarify *"Slider discreto"* (L127) and *"precisión métrica"* (L131). |

---

### 🟢 Nits (Polish & Symmetry)

| ID | Action Item | Summary & Concrete Fix |
| :--- | :--- | :--- |
| **N1** | **Standardize H3 Numbering & Section Symmetry** | Use `### 5.1` / `### 5.2` with blank lines before lists in Section 5 to match Section 4; document REST endpoints in Section 4. |
| **N2** | **Define `mockAdapter` Seed & AR HUD Formatting Rules** | Specify deterministic unit count/IDs/speed profile and HUD rounding rules (`< 60 s`, `>= 1000 m`). |
| **N3** | **Add Google Maps API Key Restrictions** | Explicitly require HTTP referrer restrictions and hard daily quota caps if Google Photorealistic 3D Tiles are ever enabled (L22). |
| **N4** | **Minor Prose & Prompt Cleanup** | Introduce `AR "Rayos X"` on first mention (L9); remove persona filler (*"Actuá como..."*, L148), *"verificaciones rápidas"* (L17), *"liviano/a"* (L27/123), and *"para dev sin red"* (L39). |

---

## 2. Traceability Matrix

| Action ID | Stage 5 (Zoom Out) | Stage 6 (Comprehension) | Stage 7 (Design / Structural / Style) | Stage 8 (Int. Zoom Out) | Stage 9 (Readiness / Codebase / Style) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **B1** | #1 | #2 | Design #5 | §1 #1 | Readiness #3; Codebase #8 |
| **B2** | #3 | #1 | Design #3; Style #3 | §1 #2 | Readiness #1; Codebase #2 |
| **B3** | #2, #4, #5 | #3 | Design #10 | §1 #3, §2 #1 | Readiness #4 |
| **B4** | — | — | Design #1, #2, #4; Structural #1, #2, #3 | §2 #1 | — |
| **B5** | #6 | #4 | Design #6; Structural #7 | §2 #2 | Readiness #1; Codebase #1, #9 |
| **B6** | — | #5 | Design #6 | — | Readiness #2; Codebase #4 |
| **B7** | #3 | — | Design #9 | §2 #1 | Readiness #5 |
| **B8** | — | #7 | — | — | Readiness #4; Codebase #3, #6 |
| **M1** | #2, #4 | — | Design #4; Structural #4 | §2 #1 | — |
| **M2** | #6 | #3 | Design #13; Structural #5 | §2 #3 | — |
| **M3** | — | — | — | — | Readiness #6, #8; Codebase #5, #7 |
| **M4** | #5 | #7 | Design #8 | §1 #3 | Readiness #7 |
| **M5** | — | — | Design #7, #11 | §2 #1 | — |
| **M6** | — | #6 | Style #2 | — | Codebase #6 |
| **M7** | #4 | #3 | — | §2 #2 | Codebase #5 |
| **M8** | — | — | Style #1–#7 | — | Style #1, #2 |
| **N1** | — | — | Structural #6, #7 | — | — |
| **N2** | — | — | — | — | Readiness #9 |
| **N3** | — | — | Design #12 | — | — |
| **N4** | — | #8 | Style #8–#11 | — | Style #3–#8 |

---

## 3. Stage Reports Generated
- [zoom_out_report.md](file:///c:/Users/I-MAG/proyectos%20AI/Esta%C2%B4Ja%C3%AD/zoom_out_report.md)
- [comprehension_report.md](file:///c:/Users/I-MAG/proyectos%20AI/Esta%C2%B4Ja%C3%AD/comprehension_report.md)
- [critic_report.md](file:///c:/Users/I-MAG/proyectos%20AI/Esta%C2%B4Ja%C3%AD/critic_report.md)
- [intermediate_zoom_out_report.md](file:///c:/Users/I-MAG/proyectos%20AI/Esta%C2%B4Ja%C3%AD/intermediate_zoom_out_report.md)
- [implementation_readiness_report.md](file:///c:/Users/I-MAG/proyectos%20AI/Esta%C2%B4Ja%C3%AD/implementation_readiness_report.md)
