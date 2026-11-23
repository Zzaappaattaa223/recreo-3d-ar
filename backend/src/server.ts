import path from "node:path";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import type { SourceHealth, TransitSourceAdapter } from "@recreo/shared";
import { MockTransitAdapter } from "./adapters/mockAdapter.js";
import { BlindZoneHeuristic } from "./engine/blindZoneHeuristic.js";
import { VehicleInterpolator } from "./engine/interpolator.js";
import { RouteStore } from "./engine/routeStore.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerStreamRoutes } from "./routes/stream.js";

export interface ServerConfig {
  port?: number;
  pollIntervalMs?: number;
  maxSseClients?: number;
  allowedOrigins?: string[];
  adapter?: TransitSourceAdapter;
  routesPath?: string;
  profilesPath?: string;
}

export async function buildServer(config: ServerConfig = {}): Promise<{
  app: FastifyInstance;
  store: RouteStore;
  interpolator: VehicleInterpolator;
  pollOnce: () => Promise<void>;
  stopPolling: () => void;
}> {
  const app = Fastify({ logger: false });

  const allowedOrigins = config.allowedOrigins ?? ["http://localhost:5173", "http://127.0.0.1:5173"];
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("CORS origin not allowed"), false);
    }
  });

  // Lightweight per-IP rate limiter (120 req/min)
  const ipHits = new Map<string, { count: number; resetAt: number }>();
  app.addHook("onRequest", async (req, reply) => {
    const now = Date.now();
    const ip = req.ip || "unknown";
    const entry = ipHits.get(ip);
    if (!entry || now > entry.resetAt) {
      ipHits.set(ip, { count: 1, resetAt: now + 60_000 });
      return;
    }
    entry.count += 1;
    if (entry.count > 120) {
      return reply.code(429).send({ error: "Rate limit exceeded" });
    }
  });

  const store = RouteStore.fromFile(config.routesPath ?? RouteStore.defaultPath());
  const blindZone = BlindZoneHeuristic.fromFile(
    config.profilesPath ?? BlindZoneHeuristic.defaultPath()
  );
  const interpolator = new VehicleInterpolator(store, blindZone);
  const adapter = config.adapter ?? new MockTransitAdapter(store);

  let sourceHealth: SourceHealth = adapter.sourceName === "mock-deterministic" ? "simulated" : "live";

  const pollOnce = async () => {
    try {
      const [recreoPings, semiPings] = await Promise.all([
        adapter.fetchActiveVehicles("recreo"),
        adapter.fetchActiveVehicles("recreo_semirrapido")
      ]);
      interpolator.ingestPings([...recreoPings, ...semiPings]);
      sourceHealth = adapter.sourceName === "mock-deterministic" ? "simulated" : "live";
    } catch {
      sourceHealth = "stale";
    }
  };

  await pollOnce();
  const pollIntervalMs = config.pollIntervalMs ?? Number(process.env.POLL_INTERVAL_MS ?? 15000);
  const pollTimer = setInterval(() => {
    void pollOnce();
  }, pollIntervalMs);

  const stopPolling = () => clearInterval(pollTimer);
  app.addHook("onClose", async () => {
    stopPolling();
  });

  registerApiRoutes(app, store);
  registerStreamRoutes(app, {
    interpolator,
    getSourceHealth: () => sourceHealth,
    maxSseClients: config.maxSseClients ?? 200
  });

  return { app, store, interpolator, pollOnce, stopPolling };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);

if (isMain) {
  const port = Number(process.env.PORT ?? 3001);
  const { app } = await buildServer({ port });
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Backend listening on http://localhost:${port}`);
}
