import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildServer } from "../backend/dist/server.js";

let readyAppPromise: ReturnType<typeof buildServer> | null = null;

async function getApp() {
  if (!readyAppPromise) {
    readyAppPromise = buildServer({
      pollIntervalMs: 60_000,
      allowedOrigins: ["*"],
      routesPath: path.resolve(process.cwd(), "backend/data/recreo_routes.geojson"),
      profilesPath: path.resolve(process.cwd(), "backend/data/blind_zone_profiles.json")
    }).then(async (ctx) => {
      await ctx.app.ready();
      return ctx;
    });
  }
  return readyAppPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const { app, pollOnce } = await getApp();
  await pollOnce();
  app.server.emit("request", req, res);
}
