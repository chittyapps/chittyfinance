// Weekly token budget guard for OpenAI usage
// Supports per-user persistent tracking via DB and a global in-memory fallback.
import { db } from "../db";
import { aiTokenUsage } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

export interface BudgetStatus {
  budget: number; // weekly budget in tokens
  used: number;
  remaining: number;
  pct: number; // 0..1
}

const WEEKLY_BUDGET = Number(process.env.OPENAI_WEEKLY_TOKEN_BUDGET ?? Number.POSITIVE_INFINITY);
const WARN_PCT = Number(process.env.OPENAI_BUDGET_WARN_PCT ?? 0.8);
const BLOCK_PCT = Number(process.env.OPENAI_BUDGET_BLOCK_PCT ?? 0.95);

function startOfWeekUTC(d = new Date()): number {
  // Monday 00:00 UTC
  const day = d.getUTCDay(); // 0..6 (Sun..Sat)
  const diffToMonday = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);
  return monday.getTime();
}

let periodStart = startOfWeekUTC();
let usedTokens = 0;
let warned = false;

function ensureWindow() {
  const nowStart = startOfWeekUTC();
  if (nowStart !== periodStart) {
    periodStart = nowStart;
    usedTokens = 0;
    warned = false;
  }
}

export function approximateTokens(messages: Array<{ content: string }>): number {
  // Very rough: ~4 chars per token + small overhead per message
  const chars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
  return Math.ceil(chars / 4) + messages.length * 4 + 8;
}

function hasDb(): boolean {
  // Drizzle client exposes query builders like select/insert
  return !!(db as any) && typeof (db as any).select === "function" && typeof (db as any).insert === "function";
}

async function getUserUsedTokens(userId: number, weekStartMs: number): Promise<number> {
  if (!hasDb()) return 0; // standalone mode: no per-user tracking
  const weekStart = new Date(weekStartMs);
  const rows = await db
    .select({ tokensUsed: aiTokenUsage.tokensUsed })
    .from(aiTokenUsage)
    .where(and(eq(aiTokenUsage.userId, userId), eq(aiTokenUsage.weekStart, weekStart)));
  return rows[0]?.tokensUsed ?? 0;
}

async function upsertUserUsage(userId: number, weekStartMs: number, deltaTokens: number) {
  if (!hasDb()) return; // standalone mode: skip persistence
  const weekStart = new Date(weekStartMs);
  await db
    .insert(aiTokenUsage)
    .values({ userId, weekStart, tokensUsed: Math.max(0, deltaTokens), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [aiTokenUsage.userId, aiTokenUsage.weekStart],
      set: {
        tokensUsed: sql`${aiTokenUsage.tokensUsed} + ${deltaTokens}`,
        updatedAt: new Date(),
      },
    });
}

export async function shouldBlockPredicted(predictedTotalTokens: number, userId?: number): Promise<boolean> {
  ensureWindow();
  if (!isFinite(WEEKLY_BUDGET)) return false; // unlimited
  const blockAt = WEEKLY_BUDGET * BLOCK_PCT;

  if (typeof userId === "number" && hasDb()) {
    const userUsed = await getUserUsedTokens(userId, periodStart);
    const projected = userUsed + predictedTotalTokens;
    return projected >= blockAt;
  }

  const projected = usedTokens + predictedTotalTokens;
  return projected >= blockAt;
}

export async function recordUsage(tokens: number, model?: string, userId?: number) {
  ensureWindow();
  if (!Number.isFinite(tokens)) return;
  if (typeof userId === "number" && hasDb()) {
    await upsertUserUsage(userId, periodStart, tokens);
    if (isFinite(WEEKLY_BUDGET)) {
      const userUsed = await getUserUsedTokens(userId, periodStart);
      const pct = userUsed / WEEKLY_BUDGET;
      if (!warned && pct >= WARN_PCT) {
        warned = true; // single global warn flip
        console.warn(`[OpenAI Budget] User ${userId}: ${(pct*100).toFixed(1)}% of weekly token budget used${model ? ` (model ${model})` : ""}.`);
      }
    }
    return;
  }

  // Global fallback
  usedTokens += tokens;
  if (isFinite(WEEKLY_BUDGET)) {
    const pct = usedTokens / WEEKLY_BUDGET;
    if (!warned && pct >= WARN_PCT) {
      warned = true;
      console.warn(`[OpenAI Budget] Warning: ${(pct*100).toFixed(1)}% of weekly token budget used${model ? ` (model ${model})` : ""}.`);
    }
  }
}

export async function getBudgetStatus(userId?: number): Promise<BudgetStatus> {
  ensureWindow();
  const budget = isFinite(WEEKLY_BUDGET) ? WEEKLY_BUDGET : Number.POSITIVE_INFINITY;
  if (typeof userId === "number" && hasDb()) {
    const used = await getUserUsedTokens(userId, periodStart);
    const pct = isFinite(budget) && budget > 0 ? used / budget : 0;
    return {
      budget,
      used,
      remaining: isFinite(budget) ? Math.max(0, budget - used) : Number.POSITIVE_INFINITY,
      pct,
    };
  }

  const pct = isFinite(budget) && budget > 0 ? usedTokens / budget : 0;
  return {
    budget,
    used: usedTokens,
    remaining: isFinite(budget) ? Math.max(0, budget - usedTokens) : Number.POSITIVE_INFINITY,
    pct,
  };
}
