import { DoorLoop } from "./doorloop.js";
import { storage } from "../storage.js";

export async function syncDoorLoopFull(userId: string, tenantId?: string) {
  const [props, leases, payments] = await Promise.all([
    DoorLoop.properties() as Promise<{ data?: any[] }>,
    DoorLoop.leases() as Promise<{ data?: any[] }>,
    DoorLoop.payments() as Promise<{ data?: any[] }>,
  ]);

  for (const lease of leases?.data ?? []) {
    const ledger = await DoorLoop.ledger(lease.id) as { data?: any[] };

    for (const e of ledger?.data ?? []) {
      const amount = e.amount ?? e.debit ?? e.credit ?? 0;

      await (storage as any).createTransaction({
        userId,
        tenantId,
        source: "doorloop",
        externalId: e.id?.toString?.() ?? undefined,
        amount,
        date: e.date ?? e.createdAt ?? null,
        type: e.type ?? "doorloop_ledger",
        description: e.description ?? e.memo ?? null,
      });
    }
  }

  return {
    properties: props?.data ?? [],
    leases: leases?.data ?? [],
    payments: payments?.data ?? [],
  };
}
