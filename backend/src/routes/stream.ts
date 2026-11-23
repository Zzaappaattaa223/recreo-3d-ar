import type { LineCode, SourceHealth, StreamEvent } from "@recreo/shared";
import type { FastifyInstance } from "fastify";
import type { VehicleInterpolator } from "../engine/interpolator.js";
import { parseLineQuery } from "./api.js";

export interface StreamDependencies {
  interpolator: VehicleInterpolator;
  getSourceHealth: () => SourceHealth;
  maxSseClients: number;
  tickIntervalMs?: number;
}

export function registerStreamRoutes(app: FastifyInstance, deps: StreamDependencies): void {
  let activeClients = 0;
  const tickMs = deps.tickIntervalMs ?? 1000;

  app.get<{ Querystring: { line?: string } }>("/api/stream", async (req, reply) => {
    const line: LineCode = parseLineQuery(req.query.line) ?? "recreo";
    if (req.query.line && !parseLineQuery(req.query.line)) {
      return reply.code(400).send({ error: "Invalid lineCode" });
    }

    if (activeClients >= deps.maxSseClients) {
      return reply.code(503).send({ error: "SSE client limit reached" });
    }

    activeClients += 1;
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    });

    const emitFrame = () => {
      const payload: StreamEvent = {
        serverTimeMs: Date.now(),
        sourceHealth: deps.getSourceHealth(),
        vehicles: deps.interpolator.getStatesAt(Date.now(), line)
      };
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    emitFrame();
    const timer = setInterval(emitFrame, tickMs);
    const maxStreamMs = process.env.VERCEL ? 25_000 : 0;
    const closeTimer =
      maxStreamMs > 0
        ? setTimeout(() => {
            clearInterval(timer);
            activeClients = Math.max(0, activeClients - 1);
            reply.raw.end();
          }, maxStreamMs)
        : null;

    req.raw.on("close", () => {
      clearInterval(timer);
      if (closeTimer) clearTimeout(closeTimer);
      activeClients = Math.max(0, activeClients - 1);
    });

    return reply;
  });
}
