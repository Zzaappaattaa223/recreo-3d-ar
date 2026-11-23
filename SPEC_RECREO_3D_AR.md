# Especificación Técnica — Seguimiento 3D y AR "Rayos X" para Colectivos Recreo (Santa Fe)

Documento de arquitectura y plan de implementación para construir una Aplicación Web Progresiva (PWA) modular de seguimiento de transporte urbano en Santa Fe, Argentina, optimizando el consumo de iteraciones mediante etapas acotadas y minimizando cambios en el núcleo al escalar hacia una aplicación móvil nativa.

---

## 1. Planteo del problema

Los usuarios de las líneas **Recreo** y **Recreo Semirrápido** en Santa Fe dependen actualmente de listados textuales de ETA por parada en portales 2D tradicionales (como Cuando Pasa SFC), que no ofrecen orientación espacial intuitiva en la vía pública ni estiman el avance de las unidades cuando atraviesan **zonas ciegas de cobertura GPS** o sufren demoras por clima y tránsito.

El sistema propuesto resuelve esta brecha mediante:
1. Un **Mapa 3D** interactivo con la traza y posición de las unidades sobre la ciudad.
2. Una vista de realidad aumentada web (**AR "Rayos X" / RX**), que superpone sobre la cámara trasera del dispositivo la silueta y trayectoria elevada de los colectivos que se aproximan, permitiendo identificar su dirección y distancia aproximada incluso a través de edificaciones.
3. Una **heurística de zonas ciegas** en el backend para mantener estimaciones continuas cuando la señal GPS de una unidad se interrumpe temporalmente.

---

## 2. Alcance, objetivos y no-objetivos (Non-Goals)

### 2.1 Objetivos de Fase 1 (MVP)

* **Fase 1A — Núcleo backend + Mapa 3D:** Seguir en tiempo real (emisión SSE a `1 Hz`) las unidades de **Recreo** y **Recreo Semirrápido** (cubiertas por [Cuando pasa SFC](https://play.google.com/store/apps/details?id=efisat.cuandopasa&hl=es_NI) según [Aire de Santa Fe](https://www.airedesantafe.com.ar/santa-fe/atencion-santafesinos-se-conocio-la-nueva-app-cuando-pasa-disponible-nuevos-modelos-celular-n587265)) sobre **MapLibre GL + OpenStreetMap 3D**, incluyendo soporte de heurística para zonas ciegas GPS.
* **Fase 1B — Vista AR "Rayos X" (RX):** Superposición 3D en Three.js sobre la cámara trasera del dispositivo, activando el GPS local del usuario únicamente al habilitar RX para preservar la privacidad.
* **Extensibilidad de fuentes:** Abstraer la ingesta detrás de la interfaz `TransitSourceAdapter` para incorporar en fases futuras la **Línea C (Santo Tomé)** u otras fuentes sin modificar el frontend.
* **Privacidad y escalabilidad:** El polling al origen, caché compartido, ajuste a la traza (*map matching*), interpolación cinemática y heurística de zonas ciegas se ejecutan en el **backend** de forma agnóstica al usuario. El cliente nunca envía su ubicación GPS al servidor; la distancia relativa y el ETA hacia la ubicación del usuario o su parada se calculan localmente en el dispositivo.
* **Modelo de distribución abierto:** El destino final del producto (uso personal/familiar, suscripción B2C o servicio municipal B2G) permanece abierto. Por ello, Fase 1 mantiene desacoplada la ingesta (`TransitSourceAdapter`) para aceptar un futuro feed oficial/GTFS-RT municipal y evita acoplar autenticación o facturación hasta definir el modelo comercial.

### 2.2 No-Objetivos (Fuera de alcance en Fase 1)

1. **Sin modo VR WebXR (`VrModeBridge`):** Diferido a una fase posterior; se conserva la arquitectura modular de vistas para incorporarlo luego sin reescribir el núcleo.
2. **Sin empaquetado nativo (Capacitor / Kotlin / ARCore Geospatial):** Fase 1 se entrega exclusivamente como PWA web.
3. **Sin Línea C (Santo Tomé) en producción:** Solo se define la interfaz `TransitSourceAdapter` y su documentación de extensión por horarios.
4. **Sin oclusión geométrica real en WebAR:** La vista RX de Fase 1B utiliza superposición semitransparente sin malla 3D de fachadas Street View.
5. **Sin funciones ajenas al seguimiento ni gestión comercial:** Sin autenticación, facturación/suscripciones, integración de pagos/SUBE, venta de pasajes ni planificación multimodal de viajes sin conexión.

---

## 3. Fase 0 — Validación técnica previa (Gate obligatorio, costo \$0)

La **Fase 0 es un requisito bloqueante (`Gate 0`)** previo a iniciar la Etapa 2 de integración real. Permite verificar la disponibilidad del origen y las capacidades del dispositivo antes de comprometer lógica productiva:

| Verificación | Qué comprobar | Criterio de decisión y contingencia |
| :--- | :--- | :--- |
| **1. Feed de Recreo** | **Verificado en Gate 0:** `cuandopasa.smartmovepro.net` devuelve HTTP 404, `cuandopasa.santafeciudad.gov.ar` no resuelve y `smartmovepro.net/api_webservice.html` es una página estática sin endpoints públicos. | **Decisión:** usar **Alternativa 2** para prototipo/uso personal (inspección de red del cliente móvil *Cuando pasa SFC* por parte del usuario para relevar formato JSON/XML, refresco y si expone `lat`/`lon` o solo ETA) manteniendo `TransitSourceAdapter` desacoplado para migrar sin cambios a **EFISAT+ / feed municipal** al escalar. **Contingencia:** si solo expone ETA por parada o restringe acceso, el sistema opera en modo degradado (`sourceHealth: "degraded"`) con ETA por parada y proyección por horario. |
| **2. Cobertura 3D en Santa Fe** | Evaluar en paralelo la cobertura de [Photorealistic 3D Maps](https://developers.google.com/maps/documentation/javascript/3d/coverage) sobre Santa Fe Capital y Recreo frente a **OpenStreetMap 3D (MapLibre GL)**. | Fase 1A utiliza **MapLibre GL + OSM 3D** (costo \$0) como motor único para evitar abstracciones multi-motor innecesarias. Si en Fase 0 se confirma cobertura fotorrealista de Google y se decide habilitar [Photorealistic 3D Tiles](https://developers.google.com/maps/documentation/tile/3d-tiles) en una fase posterior, toda API key pública en cliente deberá configurarse con restricción por `HTTP referrer` y tope de cuota diaria en Google Cloud. |
| **3. Sensores y HTTPS** | Servir la PWA local por túnel HTTPS (Cloudflare Tunnel / ngrok) y probar en dispositivos Android e iOS. | Confirmar permisos de `Geolocation`, cámara trasera (`getUserMedia`) y orientación (`DeviceOrientationEvent`, incluyendo flujo explícito `requestPermission()` en iOS Safari). |

---

## 4. Arquitectura de carpetas y stack tecnológico

### 4.1 Stack y herramientas del monorepo

* **Entorno:** Node.js `>= 20` (ESM), **npm workspaces**, TypeScript `5.x`.
* **Backend:** `fastify` (`5.x`), `@fastify/cors`, `@fastify/rate-limit` (o límite equivalente por IP), runner de tests **Vitest**.
* **Frontend PWA:** `react` (`18.x`/`19.x`), `vite`, `maplibre-gl`, `three`, `vite-plugin-pwa`.
* **Comandos estándar de verificación:** `npm run typecheck`, `npm test`, `npm run build`.

### 4.2 Estructura de carpetas

```text
recreo-3d-ar/
├── package.json                  # Workspaces: ["shared", "backend", "frontend-pwa"]
├── tsconfig.base.json
├── shared/
│   ├── package.json
│   └── types/
│       └── transit.ts            # LineCode, SourceHealth, RawVehiclePing, VehicleState, Stop, RouteGeoJSON, StreamEvent
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── adapters/
│   │   │   ├── baseAdapter.ts    # Interfaz TransitSourceAdapter
│   │   │   ├── cuandoPasaAdapter.ts  # Implementación Recreo / Recreo Semirrápido (Etapa 2)
│   │   │   └── mockAdapter.ts    # Simulador determinístico sobre polilínea real (Etapa 1)
│   │   ├── engine/
│   │   │   ├── mapMatcher.ts     # Proyección de GPS raw sobre la polilínea del recorrido
│   │   │   ├── interpolator.ts   # Estimación cinemática a 1 Hz entre paquetes GPS
│   │   │   └── blindZoneHeuristic.ts # Heurística para zonas ciegas (velocidad, históricos, clima/tránsito)
│   │   ├── routes/
│   │   │   ├── api.ts            # GET /api/lines, GET /api/stops, GET /api/routes
│   │   │   └── stream.ts         # GET /api/stream (SSE a 1 Hz, agnóstico al usuario)
│   │   └── server.ts             # Fastify con caché único de polling, CORS y rate limiting
│   ├── data/
│   │   └── recreo_routes.geojson # Trazas ida/vuelta, paradas y polígonos/segmentos de zonas ciegas
│   └── tests/
│       └── *.test.ts             # Suites Vitest por etapa
└── frontend-pwa/
    ├── package.json
    ├── src/
    │   ├── services/
    │   │   └── transitClient.ts  # Cliente SSE + reconexión automática con jitter
    │   ├── utils/
    │   │   └── localEta.ts       # Cálculo local en cliente de distancia al usuario/parada y ETA
    │   ├── sensors/
    │   │   ├── geoSensor.ts      # GPS del usuario (activado bajo demanda en RX) + filtro de precisión
    │   │   └── orientationSensor.ts # Brújula/giroscopio iOS/Android + filtro circular + offset ±180°
    │   ├── views/
    │   │   ├── Map3DView.tsx     # Mapa 3D orbital en MapLibre GL + OSM 3D (Fase 1A)
    │   │   └── ArXrayView.tsx    # Cámara trasera + overlay Three.js "rayos X" + HUD (Fase 1B)
    │   └── App.tsx               # Selector de modo (3D / AR Rayos X) + filtro de línea
    ├── public/
    │   └── manifest.webmanifest  # Configuración instalable PWA
    └── vite.config.ts
```

---

## 5. Contratos de datos y reglas del motor

### 5.1 Tipos compartidos (`shared/types/transit.ts`)

```ts
export type LineCode = "recreo" | "recreo_semirrapido" | "linea_c";
export type Direction = "ida" | "vuelta";
export type SourceHealth = "live" | "stale" | "degraded" | "offline" | "simulated";

export interface RawVehiclePing {
  vehicleId: string;
  lineCode: LineCode;
  branch: string;
  lat: number;
  lon: number;
  reportedAtMs: number;
  rawSpeedMps?: number;
  rawBearingDeg?: number;
}

export interface TransitSourceAdapter {
  readonly sourceName: string;
  fetchActiveVehicles(lineCode: LineCode): Promise<RawVehiclePing[]>;
}

export interface VehicleState {
  vehicleId: string;
  lineCode: LineCode;
  branch: string;
  direction: Direction;
  lat: number;
  lon: number;
  bearingDeg: number;
  speedMps: number;
  routeProgressMeters: number;
  snappedToRoute: boolean;
  isInterpolated: boolean;
  isBlindZoneEstimate: boolean;
  lastRealPingAgeSec: number;
}

export interface StreamEvent {
  serverTimeMs: number;
  sourceHealth: SourceHealth;
  vehicles: VehicleState[];
}

export interface Stop {
  stopId: string;
  name: string;
  lineCode: LineCode;
  branch: string;
  direction: Direction;
  sequence: number;
  lat: number;
  lon: number;
  distanceAlongRouteMeters: number;
}

export interface RouteGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry:
      | { type: "LineString"; coordinates: Array<[number, number]> }
      | { type: "Point"; coordinates: [number, number] };
    properties:
      | {
          kind: "route";
          lineCode: LineCode;
          branch: string;
          direction: Direction;
          blindZoneSegments?: Array<{ startMeters: number; endMeters: number; zoneId: string }>;
        }
      | {
          kind: "stop";
          stopId: string;
          name: string;
          lineCode: LineCode;
          branch: string;
          direction: Direction;
          sequence: number;
        };
  }>;
}
```

* **Nota sobre futuros adaptadores por horarios (`Línea C`):** Un adaptador basado únicamente en tabla horaria proyecta el avance programado sobre la polilínea de `RouteGeoJSON` para sintetizar coordenadas virtuales `RawVehiclePing` (emitiendo con `sourceHealth: "simulated"` o `"degraded"`).

### 5.2 Endpoints REST y Stream SSE (`1 Hz`)

* `GET /api/lines`: Devuelve `{ lines: Array<{ lineCode: LineCode; label: string; branches: string[] }> }`.
* `GET /api/stops?line=recreo`: Devuelve `{ stops: Stop[] }`.
* `GET /api/routes?line=recreo`: Devuelve `RouteGeoJSON` filtrado por línea.
* `GET /api/stream?line=recreo`: Stream **SSE** único a **`1 Hz`** que emite eventos `StreamEvent` estrictamente agnósticos al usuario:

```json
{
  "serverTimeMs": 1795395600000,
  "sourceHealth": "live",
  "vehicles": [
    {
      "vehicleId": "REC-01",
      "lineCode": "recreo",
      "branch": "Recreo - Centro",
      "direction": "ida",
      "lat": -31.61042,
      "lon": -60.70815,
      "bearingDeg": 182.4,
      "speedMps": 8.3,
      "routeProgressMeters": 4120,
      "snappedToRoute": true,
      "isInterpolated": true,
      "isBlindZoneEstimate": false,
      "lastRealPingAgeSec": 8
    }
  ]
}
```

* **`lastRealPingAgeSec`** permite que la interfaz reduzca la opacidad del marcador o muestre un aviso cuando una unidad supere los `45 s` sin reporte real.
* **`mockAdapter.ts`** utiliza el mismo contrato con una semilla determinística por defecto de **2 unidades por línea (1 en sentido `ida` y 1 en sentido `vuelta`)** desplazándose a `8.3 m/s` (`30 km/h`), con opción de simular una zona ciega para validar la heurística y la interfaz sin conexión de red.

### 5.3 Reglas del motor espacial, cinemático y de zonas ciegas

* **Intervalo de polling configurable:** `POLL_INTERVAL_MS = 15000` por defecto (ajustable mediante variable de entorno según los resultados de Fase 0).
* **Ajuste a traza (`mapMatcher.ts`):** `MAX_SNAP_DISTANCE_METERS = 60`. Si la coordenada cruda supera los `60 m` respecto a la polilínea, se marca `snappedToRoute: false` y se conserva la coordenada original. En calles compartidas por `ida` y `vuelta`, se desambigua comparando la similitud de rumbo (`bearing`) respecto al ping anterior.
* **Interpolación cinemática (`interpolator.ts`):** Avance a `1 Hz` acotado dentro de `[0, routeLength]` (*terminus clamping* en cabeceras). Si falta `rawSpeedMps`, se calcula con la distancia sobre traza entre los dos últimos pings válidos. Fuera de zonas ciegas, `MAX_EXTRAPOLATION_SEC = 45`: superado ese umbral, el movimiento se detiene y la unidad pasa a estado obsoleto.
* **Heurística de zonas ciegas (`blindZoneHeuristic.ts`):** Cuando un vehículo ingresa en un segmento marcado en `blindZoneSegments` y deja de emitir pings reales, en lugar de congelarse a los `45 s`, el motor proyecta su avance sobre la polilínea combinando:
  1. La **última velocidad conocida** antes de entrar a la zona ciega.
  2. Un **factor histórico de demora** indexado por `zoneId`, día de la semana y franja horaria (tabla JSON configurable en `backend/data/`).
  3. Un **coeficiente contextual de clima y tránsito** (por defecto `1.0` en condición normal; parametrizable para lluvia/hora pico).
  4. Emite `isBlindZoneEstimate: true` para que la UI distinga visualmente una posición estimada por heurística de un ping GPS en vivo.
* **Cálculo local en cliente (`localEta.ts`):** El cliente calcula `distanceToUserMeters` (distancia sobre traza o geodésica al activar RX) y `etaSeconds` usando la velocidad reportada (con velocidad de respaldo `6.94 m/s` = `25 km/h` si `speedMps < 1`).

---

## 6. Diseño de la vista AR "Rayos X" (Fase 1B) y ruta de escalado

### 6.1 Fase 1B (PWA — WebAR en navegador sin oclusión geométrica)

* **Privacidad y activación bajo demanda:** El módulo `geoSensor.ts` permanece inactivo en el Mapa 3D y solicita la ubicación GPS del dispositivo únicamente cuando el usuario activa la vista **AR "Rayos X" (RX)**. Las coordenadas del usuario se procesan exclusivamente en memoria local y nunca se transmiten al backend. Se descartan lecturas con `accuracy > MAX_GPS_ACCURACY_METERS` (`50 m`).
* **Fondo:** Video en vivo de la cámara trasera (`facingMode: "environment"`) a pantalla completa.
* **Sensores de orientación (`orientationSensor.ts`):**
  * Flujo explícito de solicitud de permisos para iOS Safari (`DeviceOrientationEvent.requestPermission()`).
  * Normalización unificada entre `webkitCompassHeading` (iOS) y `deviceorientationabsolute` (Android).
  * Filtro pasa-bajos circular (`alpha = 0.15`) aplicado sobre componentes `sin(θ)` y `cos(θ)` para evitar saltos en el cruce `359° → 0°`.
  * Control deslizante compacto en pantalla con rango de **`±180°`** y pasos de **`1°`** (persistido en `localStorage`) para compensar la deriva magnética urbana.
* **Overlay 3D (Three.js):** Transforma la diferencia `(lat, lon)` entre el usuario y cada unidad a coordenadas locales planas ENU (Este-Norte-Arriba en metros) mediante proyección equirectangular local (error lateral `< 0.1 %` / `< 5 m` en radios `< 5 km`). Se asume altura de observador `Up = +1.5 m` y la trayectoria próxima (`300 m`) se eleva a `+4 m`.
* **Efecto "Rayos X" y HUD:** Silueta 3D en material aditivo semitransparente (cian/ámbar) con `depthTest: false` para mantener visibilidad a través de edificaciones, acompañada de un rótulo flotante (`Recreo · 640 m · ~2 min`). Reglas de formato: `< 1000 m` en metros enteros, `>= 1000 m` en kilómetros con 1 decimal (`1.2 km`), y `< 60 s` como `"< 1 min"`. Si se deniegan permisos o `lastRealPingAgeSec > 45`, se muestra un aviso de estado en el HUD.

### 6.2 Fases futuras (Escalado sin reescribir el núcleo)

* **Fase 2 (Capacitor):** Envolver `frontend-pwa` para distribución en Android/iOS y sumar notificaciones locales de proximidad.
* **Fase 3 (AR de precisión con oclusión real):** Mantener intactos el backend y los contratos de `shared/`, reemplazando únicamente `ArXrayView.tsx` por un módulo nativo Android (Kotlin) o Unity con [ARCore Geospatial API + Streetscape Geometry](https://developers.google.com/ar/develop/unity-arf/geospatial/streetscape-geometry), con escala real en metros sujeta a cobertura VPS.
* **Extensiones diferidas:** Incorporación de `VrModeBridge.tsx` (WebXR) y `lineaCAdapter.ts` (Línea C Santo Tomé) sobre la arquitectura modular existente.

---

## 7. Alternativas consideradas

| Decisión | Alternativa evaluada | Motivo de descarte en Fase 1 |
| :--- | :--- | :--- |
| **Cálculo de ETA y distancia en cliente** | Calcular distancia/ETA por usuario en el backend dentro del stream SSE. | Rompe el caché único `O(1)` del servidor, exige enviar el GPS continuo del usuario al backend (riesgo de privacidad) y escala a `O(N_usuarios × N_unidades)`. |
| **Motor 3D único (MapLibre GL + OSM 3D)** | Soportar en paralelo MapLibre GL, CesiumJS y Google Photorealistic 3D Tiles detrás de una abstracción. | Las APIs de cámara y capas son incompatibles; abstraer tres motores antes de validar cobertura en Fase 0 agrega complejidad sin valor inmediato. |
| **WebAR en navegador (Three.js + ENU)** | Construir app nativa con ARCore Geospatial desde el inicio. | Exige distribución en tiendas y validación VPS previa; WebAR permite iterar la experiencia RX directamente en la PWA. |
| **Solo Mapa 3D + RX en Fase 1** | Incluir VR WebXR (`VrModeBridge.tsx`) en el MVP. | Falta soporte WebXR en iOS Safari y MapLibre GL no expone cámara estéreo nativa; duplicaría la escena 3D sin caso de uso prioritario. |

---

## 8. Riesgos, límites y mitigaciones

| Riesgo / Límite | Impacto | Mitigación |
| :--- | :--- | :--- |
| **Cambios o bloqueos WAF en `cuandopasa.smartmovepro.net`** | Pérdida de datos en vivo o retorno exclusivo de ETA por parada. | Validación obligatoria en `Gate 0`; caché único en backend (`POLL_INTERVAL_MS = 15000`) con circuit-breaker; modo degradado (`sourceHealth: "degraded"` / `"stale"`). |
| **Zonas ciegas de señal GPS en el corredor** | Unidades desaparecen o quedan congeladas en el mapa/RX. | `blindZoneHeuristic.ts` proyecta avance con velocidad previa, históricos por día/hora y factores clima/tránsito, señalizando `isBlindZoneEstimate: true`. |
| **Deriva magnética urbana y permisos de sensores en RX** | Desalineación de la silueta AR respecto a la calle real o fallo en iOS. | Filtro pasa-bajos circular (`sin`/`cos`), calibración manual ampliada a `±180°`, flujo explícito `requestPermission()` en iOS y corte de precisión GPS a `50 m`. |
| **Abuso o saturación de conexiones SSE** | Agotamiento de sockets en Fastify. | Lista blanca CORS (`ALLOWED_ORIGINS`), límite de tasa por IP, tope de conexiones SSE concurrentes (`MAX_SSE_CLIENTS`), HTTPS obligatorio en producción y cero registro de ubicación del usuario. |

---

## Anexo: Plan de implementación por etapas y ejecución en Google Antigravity

### A.1 Configuración recomendada en Google Antigravity

1. Instalar el [Google Cloud Developer plugin](https://cloud.google.com/blog/topics/developers-practitioners/google-cloud-developer-plugin-now-available-in-antigravity-marketplace) desde el Marketplace de Antigravity (incluye el [Developer Knowledge MCP](https://codelabs.developers.google.com/developer-knowledge-mcp-antigravity) y bloqueos para evitar la activación de APIs pagas sin confirmación explícita).
2. Conectar el [Google Maps Platform Code Assist toolkit (MCP)](https://developers.google.com/maps/ai/code-assist?hl=es-419) únicamente si en Fase 0 se decide evaluar Photorealistic 3D Tiles.
3. Ejecutar el desarrollo en sesiones acotadas por etapa, validando `npm run typecheck`, `npm test` y `npm run build` antes de avanzar a la siguiente.

### A.2 Mapa de archivos y pruebas por etapa

* **Etapa 1 (Núcleo monorepo + Simulador + Stream SSE):**
  * `[Create]` `package.json`, `tsconfig.base.json`, `shared/package.json`, `shared/types/transit.ts`
  * `[Create]` `backend/package.json`, `backend/data/recreo_routes.geojson`, `backend/src/adapters/baseAdapter.ts`, `backend/src/adapters/mockAdapter.ts`, `backend/src/engine/mapMatcher.ts`, `backend/src/engine/interpolator.ts`, `backend/src/engine/blindZoneHeuristic.ts`, `backend/src/routes/api.ts`, `backend/src/routes/stream.ts`, `backend/src/server.ts`
  * `[Create]` `frontend-pwa/package.json`, `frontend-pwa/vite.config.ts`, `frontend-pwa/public/manifest.webmanifest` (scaffold mínimo compilable)
  * **Tests Vitest (Etapa 1):** ajuste a traza dentro/fuera de `60 m`, desambiguación `ida`/`vuelta`, clamping en cabeceras, congelamiento tras `45 s` fuera de zona ciega, estimación heurística dentro de zona ciega, endpoints `/api/lines`, `/api/stops`, `/api/routes` y emisión SSE `/api/stream`.
* **Etapa 2 (Ingesta real tras Gate 0):**
  * `[Create]` `backend/src/adapters/cuandoPasaAdapter.ts`
  * `[Modify]` `backend/src/server.ts` (selección de adaptador + fallback a `stale`/`degraded`)
  * **Tests Vitest (Etapa 2):** parseo de respuesta de origen, caché de polling a `15 s` y transición a estado `stale`/`degraded` ante fallo o timeout del origen.
* **Etapa 3 (Fase 1A — Mapa 3D y cálculo local):**
  * `[Create]` `frontend-pwa/src/services/transitClient.ts`, `frontend-pwa/src/utils/localEta.ts`, `frontend-pwa/src/views/Map3DView.tsx`, `frontend-pwa/src/App.tsx`
  * **Tests Vitest (Etapa 3):** cálculo local de distancia/ETA (`localEta.ts` con velocidad normal y respaldo `6.94 m/s`) y compilación `npm run build`.
* **Etapa 4 (Fase 1B — Vista AR "Rayos X"):**
  * `[Create]` `frontend-pwa/src/sensors/geoSensor.ts`, `frontend-pwa/src/sensors/orientationSensor.ts`, `frontend-pwa/src/views/ArXrayView.tsx`
  * `[Modify]` `frontend-pwa/src/App.tsx` (activación de GPS bajo demanda al entrar en RX)
  * **Tests Vitest (Etapa 4):** filtro circular `359° → 0°`, proyección ENU y reglas de formato del HUD (`< 1 min`, `m`, `km`).

### A.3 Prompt maestro para ejecutar en Google Antigravity

```text
Construí una PWA modular (preparada para empaquetarse en el futuro con Capacitor y luego escalar a un módulo nativo ARCore) para seguir las unidades de "Recreo" y "Recreo Semirrápido" en Santa Fe, Argentina, con vista de Mapa 3D (Fase 1A) y vista AR "Rayos X" / RX (Fase 1B).

RESTRICCIONES ESTRICTAS:
1. No actives APIs pagas de Google Cloud ni crees recursos en la nube sin confirmación explícita.
2. Usá MapLibre GL + OpenStreetMap 3D como único motor 3D en Fase 1 (sin abstracciones multi-motor ni VR WebXR).
3. El polling, caché compartido, map matching, interpolación a 1 Hz y la heurística de zonas ciegas (velocidad previa, históricos día/hora, clima y tránsito) se ejecutan en el backend (Fastify + TypeScript ESM + Vitest).
4. Privacidad estricta: el backend es agnóstico al usuario y nunca recibe su ubicación GPS. El cliente activa geoSensor.ts localmente solo al habilitar AR "Rayos X" (RX) y calcula distancia/ETA localmente.
5. Respetá exactamente los contratos de shared/types/transit.ts, las constantes del motor y el plan de archivos definidos en SPEC_RECREO_3D_AR.md.

PLAN DE EJECUCIÓN POR ETAPAS (DETENETE AL TERMINAR CADA ETAPA PARA REVISIÓN):
- Etapa 1 (AHORA): Crear la estructura del monorepo (`shared/`, `backend/`, `frontend-pwa/`), los contratos TypeScript en `shared/types/transit.ts`, el fixture inicial `backend/data/recreo_routes.geojson`, `mockAdapter.ts` (2 unidades por línea: 1 ida, 1 vuelta), `mapMatcher.ts`, `interpolator.ts`, `blindZoneHeuristic.ts`, los endpoints REST/SSE `/api/stream` a 1 Hz, scaffold compilable de `frontend-pwa/` y tests unitarios/integración en Vitest.
- Etapa 2 (esperar confirmación tras Gate 0): Implementar `cuandoPasaAdapter.ts` con caché configurable (`15 s`) y fallback a estado `stale`/`degraded`.
- Etapa 3 (esperar confirmación): Implementar `transitClient.ts`, `localEta.ts`, `Map3DView.tsx` (edificios 3D, polilínea y marcadores con interpolación visual entre ticks SSE) y `App.tsx`.
- Etapa 4 (esperar confirmación): Implementar `geoSensor.ts` (bajo demanda en RX), `orientationSensor.ts` (soporte iOS/Android, filtro circular y offset ±180°) y `ArXrayView.tsx` (cámara trasera + overlay semitransparente en Three.js + HUD).

Comenzá únicamente con la Etapa 1; al finalizar, mostrá el árbol de archivos creado y la salida de `npm run typecheck`, `npm test` y `npm run build`.
```
