# Stage 5 — Initial Zoom Out Review (`SPEC_RECREO_3D_AR.md`)

**Overall Verdict: FAIL (Over-engineered / Severe YAGNI & Sequencing Risk)**
The specification designs a multi-tier, multi-view (3D + AR + VR) monorepo with a stateful 1 Hz backend streaming/map-matching engine and a 3-phase native ARCore roadmap **before** validating whether the single upstream data source (`cuandopasa.smartmovepro.net`) even exposes vehicle GPS coordinates.

---

### Findings

#### 1. [Blocker] Designing Full Architecture Before Validating Upstream Data Capability
* **Affected Scope:** Section 2 (`Fase 0`, lines 15–23) vs. Sections 3, 4, 5, 7 (lines 27–163)
* **Simplicity Rationale:** Line 21 explicitly states that Fase 0 must check *"si devuelve coordenadas directas de unidades o solo ETA por parada"*. Yet Sections 3–7 immediately specify `RawVehiclePing` (`lat`, `lon`, `rawSpeedMps`), `mapMatcher.ts`, a 1 Hz kinematic `interpolator.ts`, 3D bus models, and AR "Rayos X" projection. If `cuandopasa.smartmovepro.net` only exposes stop-level ETAs (or heavily quantized/delayed positions), the entire kinematic/spatial architecture is invalid. Fase 0 must be a hard gate before committing to any backend engine or 3D/AR contract.

#### 2. [Blocker] Speculative VR WebXR Mode in Phase 1 MVP
* **Affected Scope:** Section 1 (line 9), Section 3 (`VrModeBridge.tsx`, line 61), Section 6 (line 141), Section 7 (lines 148, 159)
* **Simplicity Rationale:** Classic **YAGNI** violation. Including VR (WebXR) in an MVP for tracking local commuter buses ("Recreo" / "Recreo Semirrápido") has no clear user need in the stated problem context (checking where a bus is in Santa Fe). Supporting three distinct rendering modes (3D Map + WebAR + WebXR) in Phase 1 multiplies frontend complexity and testing surface without serving the core use case.

#### 3. [Major] Stateful 1 Hz Backend Streaming & Contradictory Per-User ETA in Broadcast Stream
* **Affected Scope:** Section 1 (line 11), Section 3 (`interpolator.ts`, `etaCalculator.ts`, `stream.ts`, `server.ts`, lines 41–48), Section 4.2 (lines 91–114), Section 7 (line 153)
* **Simplicity Rationale:**
  * **Premature Optimization / Complexity:** Upstream GPS updates every 10–30 s (line 21). Running a stateful 1 Hz SSE loop and kinematic interpolation on the backend forces persistent server connections and continuous backend compute, preventing simple stateless caching or static PWA hosting. Interpolating smoothly between 15-second pings is a trivial 10-line client-side `lerp` / `requestAnimationFrame` concern.
  * **Architectural Contradiction:** `server.ts` proposes a *"caché único de polling"* (line 48) and `GET /api/stream?line=recreo` (line 91), yet the emitted payload includes user-specific fields `distanceToUserMeters` and `etaSeconds` (lines 108–109). Computing per-user distance/ETA on the backend requires streaming every user's live GPS coordinates back to the server on a per-session basis, breaking shared caching and adding unnecessary privacy and state-management overhead.

#### 4. [Major] Premature Multi-Engine 3D Abstraction & Speculative Multi-Phase Roadmap
* **Affected Scope:** Section 1 (lines 10–11), Section 2 (line 22), Section 3 (`lineaCAdapter.ts`, line 40; `Map3DView.tsx`, line 59), Section 5 (lines 129–131), Section 7 (lines 152, 154)
* **Simplicity Rationale:**
  * Decoupling the 3D map layer so it can swap between **MapLibre GL + OSM 3D**, **CesiumJS + OSM Buildings**, and **Google Photorealistic 3D Tiles** (lines 22, 59, 152) introduces an expensive abstraction over incompatible camera/scene APIs for a speculative future switch.
  * Pre-building `lineaCAdapter.ts` stubs (line 40) and designing around Phase 2 (Capacitor) and Phase 3 (native Kotlin/Unity + ARCore Geospatial Streetscape Geometry, lines 129–131) violates **YAGNI**. Solve Recreo in one concrete, working stack first.

#### 5. [Major] High-Risk Custom WebAR Engine Without Justifying Why 2D/2.5D Map Isn't Sufficient
* **Affected Scope:** Section 1 (line 9), Section 3 (`ArXrayView.tsx`, `orientationSensor.ts`, lines 57, 60), Section 5 (lines 123–127)
* **Simplicity Rationale:** **Root Problem Focus** gap. The spec assumes a custom Three.js WebAR "Rayos X" view (equirectangular ENU math, low-pass compass filtering, manual `±20°` magnetic drift slider, camera permissions over HTTPS) is needed for the MVP. In practice, urban GPS error (±15–30 m) + mobile magnetometer drift makes "through-building" AR alignment unreliable, while a standard MapLibre 2D/2.5D map + stop ETA solves ~95% of the transit-tracking problem at a fraction of the complexity. If AR "Rayos X" is an explicit creative goal rather than pure utility, it should be isolated as an optional Phase 2 experiment after the core tracker works.

#### 6. [Nit] Altitude Drops & Missing Contract Definitions
* **Affected Scope:** Section 3 (line 33), Section 4 (lines 70–118), Section 7 (line 157)
* **Simplicity Rationale:** The document mixes high-level architecture with low-level file trees, exact TypeScript interfaces (`RawVehiclePing`), and operational Antigravity prompting (Sections 6–7), yet omits the actual shared contract `VehicleState`, `RouteGeoJSON`, and `Stop` referenced in `shared/types/transit.ts` (line 33) and Stage 1 (line 157).

---

### Simpler Alternative to Achieve the Core Goal
1. **Gate 0 (5 min):** Verify `cuandopasa.smartmovepro.net` XHR responses and confirm whether live vehicle coordinates exist.
2. **Backend (Stateless Proxy/Cache):** A single lightweight endpoint (`GET /api/vehicles?line=recreo`) that polls/caches the upstream feed every 15 s and returns normalized JSON. No 1 Hz SSE loop, no backend map-matching, no user GPS uploaded to server.
3. **Frontend MVP:** A single-view **MapLibre GL JS** PWA (2D/2.5D) that interpolates vehicle positions smoothly on the client, computes distance/ETA to the user's selected stop locally, and ships without WebXR VR, Capacitor, or ARCore abstractions. Once validated in the real world on Recreo, evaluate AR "Rayos X" as a standalone feature.
