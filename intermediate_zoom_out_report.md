# Stage 8 — Intermediate Zoom Out Review (`SPEC_RECREO_3D_AR.md`)

**Overall Verdict: FAIL (Unchanged — Findings Strongly Reinforced by Stages 6 & 7)**
The Comprehension (Stage 6) and Critic (Stage 7) reviews do not overturn or soften the Stage 5 Zoom Out verdict; instead, they independently confirm the core architectural contradictions and expose how much hidden complexity is required to sustain the current design. Attempting to "patch" the spec by filling in all missing edge cases (1 Hz stateful SSE scaling, backend per-user GPS/ETA, custom WebAR sensor fusion, and backend map-matching disambiguation) would severely compound the over-engineering rather than solving the root problem simply.

---

### 1. How Stages 6 & 7 Reinforce Stage 5 Zoom Out Findings

1. **[Blocker] Unvalidated Upstream Source & Missing Contingency (Reinforces Stage 5 #1)**
   * **Affected Scope:** Section 2 (`Fase 0`, L21) vs. Sections 3–7; Stage 6 #2; Stage 7 Design #5.
   * **Simplicity Rationale:** Both Stage 6 and Stage 7 confirm that the entire backend kinematic engine (`RawVehiclePing`, `mapMatcher.ts`, `interpolator.ts`) and 3D/AR/VR frontend assume direct vehicle GPS coordinates exist, with zero fallback if `cuandopasa.smartmovepro.net` only returns stop-level ETAs or blocks server-side scraping. Fase 0 must be a hard gate before any architecture is committed.

2. **[Blocker] Broadcast Cache vs. Per-User ETA Contradiction (Reinforces Stage 5 #3)**
   * **Affected Scope:** Section 1 (L11), Section 3 (`server.ts`, `stream.ts`, L44–48), Section 4.2 (L91–114); Stage 6 #1; Stage 7 Design #3 & Style #3.
   * **Simplicity Rationale:** Stage 6 and Stage 7 both flag the impossible contract where a shared `caché único de polling` on `GET /api/stream?line=recreo` emits per-user `distanceToUserMeters` and `etaSeconds` without receiving user coordinates. Resolving this *within* the current "100% backend" rule forces per-user GPS streaming, session state, and privacy controls—whereas moving distance/ETA calculation and 15 s → 1 s `lerp` interpolation to the client eliminates the stateful 1 Hz backend entirely.

3. **[Blocker] Speculative VR WebXR & Unjustified Custom WebAR (Reinforces Stage 5 #2 & #5)**
   * **Affected Scope:** Section 1 (L9), Section 3 (`VrModeBridge.tsx`, `ArXrayView.tsx`, `orientationSensor.ts`, L57–61), Section 5 (L123–127); Stage 6 #3 & #7; Stage 7 Design #8 & #10.
   * **Simplicity Rationale:** Stage 6 and Stage 7 show that VR WebXR lacks any target hardware, interaction model, or iOS Safari support, and that WebAR "Rayos X" requires cross-platform iOS/Android compass permission flows, gimbal-lock handling, ENU altitude (`U`), and compensation for urban magnetic drift exceeding `±20°`. This confirms both are premature/speculative for an MVP whose core problem is tracking Recreo buses in Santa Fe.

---

### 2. New Complexity Risks from Stage 6 & 7 Mitigations (Guardrails for Revision)

1. **[Major] Risk of "Patching" Complexity Instead of Simplifying (Stage 7 Design #1, #2, #7, #9, #11)**
   * **Affected Scope:** Proposed additions for `Alternatives Considered`, `Risks & Mitigations`, horizontal scaling, security/privacy, and map-matching edge cases.
   * **Simplicity Rationale:** Stage 7 rightly notes missing horizontal scaling, PII/location privacy, map-matching edge cases (inbound/outbound disambiguation, terminus clamping), and `Alternatives Considered`. **Warning:** Do not resolve these by adding Redis/pub-sub for stateful 1 Hz SSE, OSRM/Valhalla/PostGIS, or user-GPS privacy infrastructure. Instead, use `Problem Statement`, `Non-Goals`, and `Alternatives Considered` to **prune** the MVP:
     * **Stateless proxy/cache** (`GET /api/vehicles?line=recreo`) polling every ~15 s → eliminates SSE backpressure, horizontal scaling state, and server-side user-GPS privacy risks.
     * **Client-side interpolation & local stop ETA** → eliminates backend `interpolator.ts` and `etaCalculator.ts`.
     * **Single 2D/2.5D MapLibre GL view** → defers VR WebXR, WebAR "Rayos X", multi-engine 3D abstractions (`CesiumJS` / Google 3D Tiles), `lineaCAdapter.ts`, and Capacitor/ARCore to explicit **Non-Goals / Future Phases**.

2. **[Major] Risk of Premature Contract & Tooling Over-Specification (Stage 6 #4, #6, #7; Stage 7 Design #6)**
   * **Affected Scope:** Section 3 (`shared/types/transit.ts`), Section 4, Section 7.
   * **Simplicity Rationale:** While missing contracts (`VehicleState`, `RouteGeoJSON`, `Stop`, `sourceHealth`) must be defined if referenced, keep them minimal and strictly scoped to the stateless MVP rather than designing schedule-to-GPS adapters for Línea C or multi-renderer 3D interfaces up front.

3. **[Nit] Separating Antigravity Runbook from Feature Spec (Stage 7 Design #13, Structural #5)**
   * **Affected Scope:** Sections 6–7 (L135–163).
   * **Simplicity Rationale:** Moving Antigravity plugin/credit-saving instructions and the copy-paste prompt out of the technical spec aligns with the Zoom-Out **Anti-Weeds** standard and keeps the architecture document focused on the system itself.
