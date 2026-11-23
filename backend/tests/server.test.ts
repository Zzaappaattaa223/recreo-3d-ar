import http from "node:http";
import type { StreamEvent } from "@recreo/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

describe("Etapa 1 — Fastify REST & SSE /api/stream", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    const { app } = await buildServer({ port: 0, pollIntervalMs: 60_000 });
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    baseUrl = address;
    closeServer = () => app.close();
  });

  afterAll(async () => {
    await closeServer();
  });

  it("serves /api/lines, /api/stops, and /api/routes", async () => {
    const linesRes = await fetch(`${baseUrl}/api/lines`);
    expect(linesRes.status).toBe(200);
    const linesBody = (await linesRes.json()) as { lines: Array<{ lineCode: string }> };
    expect(linesBody.lines.map((l) => l.lineCode)).toContain("recreo");

    const stopsRes = await fetch(`${baseUrl}/api/stops?line=recreo`);
    expect(stopsRes.status).toBe(200);
    const stopsBody = (await stopsRes.json()) as { stops: Array<{ stopId: string }> };
    expect(stopsBody.stops.length).toBeGreaterThan(0);

    const routesRes = await fetch(`${baseUrl}/api/routes?line=recreo`);
    expect(routesRes.status).toBe(200);
    const routesBody = (await routesRes.json()) as { type: string; features: unknown[] };
    expect(routesBody.type).toBe("FeatureCollection");
    expect(routesBody.features.length).toBeGreaterThan(0);
  });

  it("emits user-agnostic StreamEvent frames on GET /api/stream?line=recreo", async () => {
    const event = await new Promise<StreamEvent>((resolve, reject) => {
      const req = http.get(`${baseUrl}/api/stream?line=recreo`, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/event-stream");
        let buffer = "";
        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString("utf-8");
          const match = buffer.match(/data: (.+)\n\n/);
          if (match) {
            req.destroy();
            resolve(JSON.parse(match[1]) as StreamEvent);
          }
        });
      });
      req.on("error", reject);
    });

    expect(event.sourceHealth).toBe("simulated");
    expect(event.vehicles.length).toBe(2);
    expect(event.vehicles[0]).toHaveProperty("routeProgressMeters");
    expect(event.vehicles[0]).not.toHaveProperty("distanceToUserMeters");
    expect(event.vehicles[0]).not.toHaveProperty("etaSeconds");
  });
});
