# Stage 7 — Critic Review (`SPEC_RECREO_3D_AR.md`, `FeatureRange`: lines 1–143)

---

## 1. Design Critic (`egm-design`)

### Blockers
1. **Fails "The Alternatives Rule" (`SPEC_RECREO_3D_AR.md` L1–143):** Presents a single architectural path without evaluating rejected alternatives for centralized stateful Fastify 1 Hz push vs. edge/CDN polling + client interpolation, custom Three.js WebAR vs. WebXR Hit-Test/AR.js, custom Node.js map-matching vs. OSRM/Valhalla/PostGIS, or Capacitor + Kotlin/Unity ARCore vs. React Native/Flutter.
2. **Missing "Risks & Mitigations" Section (`SPEC_RECREO_3D_AR.md` L1–143):** No structured risks, constraints, failure modes, security implications, or scalability limits are documented.
3. **Architectural Contradiction Between Shared Broadcast Caching and Per-User ETA (`SPEC_RECREO_3D_AR.md` L11, L44, L47–48, L91–114):** `server.ts` specifies a single polling cache (`caché único de polling`) and `GET /api/stream?line=recreo` accepts no user coordinates or `stopId`, yet the payload includes `distanceToUserMeters` and `etaSeconds` and L11 mandates 100% backend ETA calculation.

### Majors
4. **Missing Problem Statement & Non-Goals (`SPEC_RECREO_3D_AR.md` L7–11):** Omits why 3D/AR/VR is needed over existing 2D trackers and what is explicitly out of scope.
5. **Unverified, Fragile Upstream Dependency (`cuandopasa.smartmovepro.net`, L21, L38, L75–88):** Relies on reverse-engineering third-party XHR/Fetch endpoints (WAF/Cloudflare, token rotation, rate-limit, legal/ToS risks) with no fallback architecture if it only returns stop-level ETAs.
6. **Incomplete and Loosely Typed Data Contracts (`SPEC_RECREO_3D_AR.md` L33, L50, L75–88, L91–114):** Missing schemas for `VehicleState`, `RouteGeoJSON`, `Stop`, `recreo_routes.geojson`; `fetchActiveVehicles(lineCode: string)` doesn't use the `lineCode` union type; `sourceHealth` enum values and stream heartbeat/error frames are undefined.
7. **Single-Process Stateful Fastify Limits Horizontal Scaling (L47–48):** Horizontal scaling duplicates upstream polling and breaks shared state; no backpressure, connection limits, or payload optimization for slow mobile networks.
8. **Unmitigated Mobile WebAR Sensor Drift, Cross-Platform Bugs & Missing Elevation (L23, L57, L124–127):** Urban magnetic interference (30°–180°) exceeds the `±20°` slider; iOS `DeviceOrientationEvent.requestPermission()` and `webkitCompassHeading` vs. Android `deviceorientationabsolute` and gimbal-lock are unaddressed; ENU ignores altitude (`U`).
9. **Map Matching & Kinematic Interpolation Edge Cases (L42–43, L116):** No direction/heading disambiguation for overlapping inbound/outbound streets, no terminus clamping during layovers, and no off-route threshold for `snappedToRoute: false`.
10. **Unspecified VR WebXR Scope & Feasibility (L9, L61):** No target hardware, interaction/locomotion model, or iOS Safari fallback (lacks WebXR).
11. **Missing Security, Abuse-Prevention & Location-Privacy Controls (L23, L46–48, L91–113):** No rate limiting, CORS policy, TLS/WSS enforcement, or PII/location non-persistence guarantees.

### Nits
12. **API Key Restrictions for Google Photorealistic 3D Tiles (L22):** Needs explicit HTTP referrer restrictions and hard quota caps if used.
13. **Out-of-Scope Process Notes in Feature Spec (L135–142):** Section 6 IDE/credit-saving notes should be separated from the technical architecture.

---

## 2. Structural Audit (`egm-structural`)

### Blockers
1. **Missing "Alternatives Considered" Section (L1–143):** Violates `feature-spec-standard.md` ("The Alternatives Rule").
2. **Missing "Risks & Mitigations / Limits" Section (L1–143):** Violates `feature-spec-standard.md`.
3. **Missing "Problem Statement" Section (L1–12):** Jumps directly into execution tooling and solution scope without stating the user/transit problem.

### Majors
4. **Missing Explicit "Non-Goals" in Scope (L7–12):** Required by `feature-spec-standard.md` under "Goals & Non-Goals".
5. **Misplaced Meta-Workflow Section (L135–141):** Section 6 (Antigravity plugins/credit strategy) belongs in a separate execution runbook or appendix.

### Nits
6. **Inconsistent H3 Numbering & Blank-Line Symmetry (L72, L91 vs. L123, L129):** Section 4 uses `### 4.1` / `### 4.2` with blank lines; Section 5 uses unnumbered `### Fase ...` with no blank line before lists.
7. **Contract Coverage Asymmetry (L33, L46–47 vs. L70–118):** REST endpoints and `RouteGeoJSON`/`Stop` listed in Section 3 are omitted from Section 4.

---

## 3. Style Audit (`egm-style`)

### Majors
1. **Colloquial & Unverifiable Intro Claim (L3):** *"sin desperdiciar créditos ni reescribir arquitectura"* mixes subjective/absolute phrasing; rephrase objectively.
2. **Informal Metaphors & Rate Contradiction (L11 vs. L43, L91):** *"vive en el backend"*, *"PWA hoy, ... mañana"*, and *"cada 1–2 segundos"* vs. *"1 Hz"*.
3. **Ambiguous Stream Contract (L91, L108–109):** `GET /api/stream?line=recreo` omits user location input while emitting `distanceToUserMeters` and `etaSeconds`.
4. **Unquantified Precision Claim (L125):** *"error despreciable en radios < 5 km"* should be quantified in meters/percentage.
5. **Ambiguous Term *"Slider discreto"* & Colloquial *"celular"* (L127):** Clarify whether *"discreto"* means visually compact or stepped increments; use *"dispositivo"*.
6. **Ambiguous *"precisión métrica"* & Undefined *"núcleo"* (L129, L131):** Clarify scale vs. ~1 m accuracy and explicitly name core modules.
7. **Register Shift to Informal *Voseo* (L135–141):** Sections 1–5 use impersonal infinitive/passive; Section 6 shifts to *"tu aprobación"*, *"decidís"*, *"Ejecutá"*. Also *"bloqueos"* (L139) is vague.

### Nits
8. **Subjective Adjective & Cost Imprecision (L15, L17, L22):** *"verificaciones rápidas"* and *"(costo $0)"* header vs. paid Google Cloud evaluation.
9. **Vague Adjectives / Informal Jargon (L27, L39, L123):** *"Monorepo liviano"*, *"WebAR liviana"*, *"para dev sin red"*.
10. **Wordiness & Colloquialism (L117):** *"exactamente el mismo contrato ... en casa sin depender de que un colectivo esté pasando en ese instante"*.
11. **Overloaded Sentence (L126):** >50 words with `+` in prose and imprecise *"recorrido acercándose"*.
