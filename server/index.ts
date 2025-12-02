/**
 * Server Entry
 * - Express API + client dev middleware (Vite in dev, static in prod)
 * - Routes registered via `server/routes.ts`
 * - Data access centralized in `server/storage.ts`
 * - Default port 5000; override with `PORT`
 */
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { tenantScope } from './middleware/tenant';
import { setupVite, serveStatic, log } from "./vite";
import { startChittyConnectKeepAlive } from './lib/tokenKeepAlive';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// Attach tenant context early so routes can read it
app.use(tenantScope);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);
  // Start background keep-alive for ChittyConnect tokens (if configured)
  startChittyConnectKeepAlive();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Default to port 5000; allow override via PORT for local conflicts
  const port = Number(process.env.PORT) || 5000;
  server.listen({
    port,
    host: "0.0.0.0",
  }, () => {
    log(`serving on port ${port}`);
  });
})();
