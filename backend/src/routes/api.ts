import type { LineCode } from "@recreo/shared";
import type { FastifyInstance } from "fastify";
import type { RouteStore } from "../engine/routeStore.js";

const VALID_LINES = new Set<LineCode>(["recreo", "recreo_semirrapido", "linea_c"]);

export function parseLineQuery(raw?: string): LineCode | undefined {
  if (!raw) return undefined;
  return VALID_LINES.has(raw as LineCode) ? (raw as LineCode) : undefined;
}

export function registerApiRoutes(app: FastifyInstance, store: RouteStore): void {
  app.get("/api/health", async () => ({ status: "ok", serverTimeMs: Date.now() }));

  app.get("/api/lines", async () => ({
    lines: store.getLines()
  }));

  app.get<{ Querystring: { line?: string } }>("/api/stops", async (req, reply) => {
    const line = parseLineQuery(req.query.line);
    if (req.query.line && !line) {
      return reply.code(400).send({ error: "Invalid lineCode" });
    }
    return { stops: store.getStops(line) };
  });

  app.get<{ Querystring: { line?: string } }>("/api/routes", async (req, reply) => {
    const line = parseLineQuery(req.query.line);
    if (req.query.line && !line) {
      return reply.code(400).send({ error: "Invalid lineCode" });
    }
    return store.getRouteGeoJSON(line);
  });
}
