import OpenAI from "openai";
import { shouldBlockPredicted, recordUsage, getBudgetStatus, approximateTokens } from "./openaiBudget";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "demo-key" });

// Configurable knobs (env overrides)
const MODEL = process.env.OPENAI_MODEL || "gpt-4o"; // keep default per project note
const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini";
const ALLOW_FALLBACK_MODEL = (process.env.OPENAI_ALLOW_FALLBACK_MODEL || "false").toLowerCase() === "true";
const TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE ?? 0.2);
const CONCISE = (process.env.OPENAI_CONCISE || "true").toLowerCase() === "true";

const MAX_TOKENS_ADVICE = Number(process.env.OPENAI_MAX_TOKENS_ADVICE ?? 320);
const MAX_TOKENS_PLAN = Number(process.env.OPENAI_MAX_TOKENS_PLAN ?? 560);
const MAX_TOKENS_TREND = Number(process.env.OPENAI_MAX_TOKENS_TREND ?? 320);

function truncate(text: string, maxChars: number): string {
  if (!text) return text;
  return text.length <= maxChars ? text : text.slice(-maxChars);
}

function concisePrefix(): string {
  if (!CONCISE) return "";
  return "Rules: Be concise. Use bullets. Avoid preambles and conclusions. Prioritize actionable steps.";
}

function buildAdviceSystemPrompt(values: { cashOnHand: number; monthlyRevenue: number; monthlyExpenses: number; outstandingInvoices: number; }): string {
  const { cashOnHand, monthlyRevenue, monthlyExpenses, outstandingInvoices } = values;
  // Compact prompt to reduce tokens
  return [
    "You are an AI CFO.",
    `Data: cash=$${cashOnHand.toFixed(2)}, revenue=$${monthlyRevenue.toFixed(2)}, expenses=$${monthlyExpenses.toFixed(2)}, ar=$${outstandingInvoices.toFixed(2)}.`,
    "Task: Provide practical next steps and risks.",
    "Format: 5-8 bullets; <=18 words each.",
    concisePrefix()
  ].join(" ");
}

function buildPlanSystemPrompt(values: { cashOnHand: number; monthlyRevenue: number; monthlyExpenses: number; }): string {
  const { cashOnHand, monthlyRevenue, monthlyExpenses } = values;
  return [
    "You are an AI CFO.",
    `Data: cash=$${cashOnHand.toFixed(2)}, revenue=$${monthlyRevenue.toFixed(2)}, expenses=$${monthlyExpenses.toFixed(2)}.`,
    "Task: Create a 30-60 day cost reduction plan with concrete actions and owners.",
    "Format: Headline + 6-10 bullets; each with action, impact, ETA.",
    concisePrefix()
  ].join(" ");
}

function buildTrendSystemPrompt(formattedData: string): string {
  return [
    "You are an AI CFO.",
    "Analyze monthly revenue/expense trends.",
    "Task: Identify patterns and give actions.",
    "Format: 3 sections (Trends, Risks, Actions) using bullets.",
    "Data:\n" + formattedData,
    concisePrefix()
  ].join(" ");
}

// Lightweight non-LLM fallback to avoid budget overrun
function fallbackAdvice(values: { cashOnHand: number; monthlyRevenue: number; monthlyExpenses: number; outstandingInvoices: number; }, userQuery?: string): string {
  const { cashOnHand, monthlyRevenue, monthlyExpenses, outstandingInvoices } = values;
  const net = monthlyRevenue - monthlyExpenses;
  const burn = net < 0 ? -net : 0;
  const runwayMonths = burn > 0 ? (cashOnHand / burn) : Infinity;
  const arDays = monthlyRevenue > 0 ? Math.min(120, Math.max(0, (outstandingInvoices / monthlyRevenue) * 30)) : 0;
  const bullets = [
    burn > 0 ? `Runway ~${runwayMonths === Infinity ? 'N/A' : runwayMonths.toFixed(1)} months; target >= 6 months.` : `Operating profitable by $${net.toFixed(0)}/mo; reinvest or build reserve.`,
    `Cap expenses at ${(monthlyRevenue * 0.8).toFixed(0)} to keep >=20% margin.`,
    outstandingInvoices > 0 ? `Tighten AR: collect $${Math.min(outstandingInvoices, monthlyRevenue*0.5).toFixed(0)}; DSO ~${arDays.toFixed(0)}d.` : `AR healthy; keep net 15 terms for key clients.`,
    `Freeze non-essential spend; review top 5 vendors for 10–20% cuts.`,
    `Delay discretionary projects until reserve >= 3 months OPEX.`,
  ];
  if (userQuery) bullets.unshift(`Regarding: ${truncate(userQuery, 120)}`);
  return bullets.map(b => `• ${b}`).join("\n");
}

function fallbackPlan(values: { cashOnHand: number; monthlyRevenue: number; monthlyExpenses: number; }): string {
  const { monthlyExpenses } = values;
  const targetCut = Math.max(0, monthlyExpenses * 0.1);
  const bullets = [
    `Cancel unused SaaS and consolidate licenses (save ~$${(targetCut*0.25).toFixed(0)}/mo).`,
    `Renegotiate top 3 vendors for 8–15% discounts (save ~$${(targetCut*0.35).toFixed(0)}/mo).`,
    `Implement spend approvals > $500 and pre-paid cards per team.`,
    `Shift variable work to on-demand contractors; pause backfills for 30 days.`,
    `Cut low-ROI marketing; reallocate to highest CAC:LTV channels.`,
    `Tighten AR: deposit + milestone billing; auto-reminders (reduce DSO by 7–10d).`
  ];
  return [`30–60 Day Cost Reduction Plan (target ~$${targetCut.toFixed(0)}/mo)`, ...bullets.map(b => `• ${b}`)].join("\n");
}

interface FinancialAdviceParams {
  cashOnHand: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  outstandingInvoices: number;
  previousAdvice?: string;
  userQuery?: string;
userId?: number;
}




export async function getFinancialAdvice({
  cashOnHand,
  monthlyRevenue,
  monthlyExpenses,
  outstandingInvoices,
  previousAdvice,
  userQuery,
userId
}: FinancialAdviceParams): Promise<string> {
  try {
    const system = buildAdviceSystemPrompt({ cashOnHand, monthlyRevenue, monthlyExpenses, outstandingInvoices });
    const messages: Array<{ role: "system"|"user"|"assistant"; content: string }> = [
      { role: "system", content: system },
    ];

    if (previousAdvice) {
      messages.push({ role: "assistant", content: truncate(previousAdvice, 600) });
    }

    if (userQuery) {
      messages.push({ role: "user", content: truncate(userQuery, 400) });
    } else {
      messages.push({ role: "user", content: "Provide actionable next steps now." });
    }

    const predicted = approximateTokens(messages) + MAX_TOKENS_ADVICE;
    if (await shouldBlockPredicted(predicted, userId)) {
      const status = await getBudgetStatus(userId);
      return fallbackAdvice({ cashOnHand, monthlyRevenue, monthlyExpenses, outstandingInvoices }, userQuery) +
        `\n\n(Budget safe mode active: ${status.used}/${status.budget} tokens used this week)`;
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: messages as any,
      max_tokens: MAX_TOKENS_ADVICE,
      temperature: TEMPERATURE,
    });

    // Record usage if available
    const usageTotal = (response as any).usage?.total_tokens as number | undefined;
    if (typeof usageTotal === "number") await recordUsage(usageTotal, MODEL, userId);

    return response.choices[0].message.content || "I couldn't generate advice at this time.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    // Optional fallback
    return fallbackAdvice({ cashOnHand, monthlyRevenue, monthlyExpenses, outstandingInvoices }, userQuery);
  }
}

export async function generateCostReductionPlan({
  cashOnHand,
  monthlyRevenue,
  monthlyExpenses,
  userId
}: {
  cashOnHand: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  userId?: number;
}): Promise<string> {
  try {
    const system = buildPlanSystemPrompt({ cashOnHand, monthlyRevenue, monthlyExpenses });
    const messages: Array<{ role: "system"|"user"; content: string }> = [
      { role: "system", content: system },
      { role: "user", content: "Create the plan now." },
    ];

    const predicted = approximateTokens(messages) + MAX_TOKENS_PLAN;
    if (await shouldBlockPredicted(predicted, userId)) {
      const status = await getBudgetStatus(userId);
      return fallbackPlan({ cashOnHand, monthlyRevenue, monthlyExpenses }) +
        `\n\n(Budget safe mode active: ${status.used}/${status.budget} tokens used this week)`;
    }

    const modelToUse = ALLOW_FALLBACK_MODEL ? FALLBACK_MODEL : MODEL;
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: messages as any,
      max_tokens: MAX_TOKENS_PLAN,
      temperature: TEMPERATURE,
    });

    const usageTotal = (response as any).usage?.total_tokens as number | undefined;
    if (typeof usageTotal === "number") await recordUsage(usageTotal, modelToUse, userId);

    return response.choices[0].message.content || "I couldn't generate a cost reduction plan at this time.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return fallbackPlan({ cashOnHand, monthlyRevenue, monthlyExpenses });
  }
}

export async function analyzeFinancialTrend(
  historicalData: {
    month: string;
    revenue: number;
    expenses: number;
  }[]
  , userId?: number
): Promise<string> {
  try {
    // Format the historical data for the prompt
    const formattedData = historicalData
      .map(item => `${item.month}: Revenue $${item.revenue.toFixed(2)}, Expenses $${item.expenses.toFixed(2)}`)
      .join('\n');

    const system = buildTrendSystemPrompt(formattedData);
    const messages: Array<{ role: "system"|"user"; content: string }> = [
      { role: "system", content: system },
      { role: "user", content: "Provide trends, risks, and actions." },
    ];

    const predicted = approximateTokens(messages) + MAX_TOKENS_TREND;
    if (await shouldBlockPredicted(predicted, userId)) {
      // Lightweight heuristic trend: compare last two months
      const last = historicalData[historicalData.length - 1];
      const prev = historicalData[historicalData.length - 2];
      const revDelta = last && prev ? last.revenue - prev.revenue : 0;
      const expDelta = last && prev ? last.expenses - prev.expenses : 0;
      const bullets = [
        `Revenue ${revDelta >= 0 ? 'up' : 'down'} $${Math.abs(revDelta).toFixed(0)} vs prior month.`,
        `Expenses ${expDelta >= 0 ? 'up' : 'down'} $${Math.abs(expDelta).toFixed(0)} vs prior month.`,
        `Action: double‑down on positive channels; cap rising cost categories.`
      ];
      const status = await getBudgetStatus(userId);
      return bullets.map(b => `• ${b}`).join("\n") +
        `\n\n(Budget safe mode active: ${status.used}/${status.budget} tokens used this week)`;
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: messages as any,
      max_tokens: MAX_TOKENS_TREND,
      temperature: TEMPERATURE,
    });

    const usageTotal = (response as any).usage?.total_tokens as number | undefined;
    if (typeof usageTotal === "number") await recordUsage(usageTotal, MODEL, userId);

    return response.choices[0].message.content || "I couldn't analyze the financial trends at this time.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    // Minimal heuristic fallback
    if (historicalData.length >= 2) {
      const last = historicalData[historicalData.length - 1];
      const prev = historicalData[historicalData.length - 2];
      const revDelta = last.revenue - prev.revenue;
      const expDelta = last.expenses - prev.expenses;
      return [
        `• Revenue ${revDelta >= 0 ? 'up' : 'down'} $${Math.abs(revDelta).toFixed(0)} MoM`,
        `• Expenses ${expDelta >= 0 ? 'up' : 'down'} $${Math.abs(expDelta).toFixed(0)} MoM`,
        '• Action: prioritize profitable segments; cap cost growth < revenue growth.'
      ].join("\n");
    }
    return "Insufficient data to analyze trends.";
  }
}