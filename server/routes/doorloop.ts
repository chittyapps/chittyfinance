// @ts-nocheck - This file uses Fastify but the project uses Express. Needs migration.
import type { FastifyInstance } from "fastify";
import { listProperties, listLeases, listPayments } from "../integrations/doorloopClient.js";

export default async function doorloopRoutes(app: FastifyInstance) {
  app.get("/doorloop/properties", async (req: any, res: any) => {
    const apiKey = process.env.DOORLOOP_API_KEY;
    const data = await listProperties(apiKey);
    return res.send(data);
  });

  app.get("/doorloop/leases", async (req: any, res: any) => {
    const apiKey = process.env.DOORLOOP_API_KEY;
    const data = await listLeases(apiKey);
    return res.send(data);
  });

  app.get("/doorloop/payments", async (req: any, res: any) => {
    const apiKey = process.env.DOORLOOP_API_KEY;
    const data = await listPayments(apiKey);
    return res.send(data);
  });
}
