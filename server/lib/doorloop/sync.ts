// @ts-nocheck - TODO: Add proper types
import { storage } from "../../storage.js";
import { listProperties, listLeases, listPayments } from "../../integrations/doorloopClient.js";
import { normalizeDoorloopTransaction } from "./normalize.js";

export async function syncDoorloop() {
  const apiKey = process.env.DOORLOOP_API_KEY!;

  // Fetch all DoorLoop data
  const [properties, leases, payments] = await Promise.all([
    listProperties(apiKey),
    listLeases(apiKey),
    listPayments(apiKey),
  ]);

  // Normalize payments → ChittyFinance transactions
  const normalized = [];
  for (const p of payments.data || []) {
    normalized.push(normalizeDoorloopTransaction(p));
  }

  // Insert into ChittyFinance DB
  for (const tx of normalized) {
    await storage.createTransaction({
      userId: 1,  // demo user
      ...tx,
    });
  }

  // Log sync event
  const payload = { properties, leases, payments };
  const eventId = `doorloop-sync-${new Date().toISOString()}`;

  await storage.recordWebhookEvent({
    source: "doorloop",
    eventId,
    payload: payload as any,
  });

  return {
    eventId,
    counts: {
      properties: properties?.data?.length ?? 0,
      leases: leases?.data?.length ?? 0,
      payments: payments?.data?.length ?? 0,
      normalizedTransactions: normalized.length,
    },
  };
}
