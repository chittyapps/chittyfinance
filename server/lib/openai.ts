import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "demo-key" });

interface FinancialAdviceParams {
  cashOnHand: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  outstandingInvoices: number;
  previousAdvice?: string;
  userQuery?: string;
}

export async function getFinancialAdvice({
  cashOnHand,
  monthlyRevenue,
  monthlyExpenses,
  outstandingInvoices,
  previousAdvice,
  userQuery
}: FinancialAdviceParams): Promise<string> {
  try {
    const basePrompt = `
You are an AI CFO assistant with expertise in financial analysis. Analyze this data:
- Cash on Hand: $${cashOnHand.toFixed(2)}
- Monthly Revenue: $${monthlyRevenue.toFixed(2)}
- Monthly Expenses: $${monthlyExpenses.toFixed(2)}
- Outstanding Invoices: $${outstandingInvoices.toFixed(2)}

Consider key financial metrics:
- Burn Rate: ${(monthlyExpenses / monthlyRevenue).toFixed(2)}
- Runway: ${(cashOnHand / (monthlyExpenses - monthlyRevenue)).toFixed(1)} months
- Collection Ratio: ${((outstandingInvoices / monthlyRevenue) * 30).toFixed(1)} days

Provide:
1. Strategic financial insights
2. Risk assessment
3. Growth opportunities
4. Actionable recommendations

Keep responses concise but comprehensive.
`;

    const messages = [
      { role: "system", content: basePrompt },
    ];

    if (previousAdvice) {
      messages.push({ role: "assistant", content: previousAdvice });
    }

    if (userQuery) {
      messages.push({ role: "user", content: userQuery });
    } else {
      messages.push({ 
        role: "user", 
        content: "What financial advice can you provide based on this data? Focus on practical next steps and actionable insights." 
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages as any,
      max_tokens: 500,
    });

    return response.choices[0].message.content || "I couldn't generate advice at this time.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return "I'm having trouble analyzing your financial data right now. Please try again later.";
  }
}

export async function generateCostReductionPlan({
  cashOnHand,
  monthlyRevenue,
  monthlyExpenses
}: {
  cashOnHand: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
}): Promise<string> {
  try {
    const prompt = `
You are an AI CFO assistant, tasked with creating a cost reduction plan based on the following financial data:
- Cash on Hand: $${cashOnHand.toFixed(2)}
- Monthly Revenue: $${monthlyRevenue.toFixed(2)}
- Monthly Expenses: $${monthlyExpenses.toFixed(2)}

Generate a detailed but concise cost reduction plan with specific actionable steps the company can take to reduce expenses without significantly impacting operations.
Focus on practical advice that can be implemented within 30-60 days.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Create a detailed cost reduction plan" }
      ],
      max_tokens: 800,
    });

    return response.choices[0].message.content || "I couldn't generate a cost reduction plan at this time.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return "I'm having trouble generating a cost reduction plan right now. Please try again later.";
  }
}

export async function analyzeFinancialTrend(
  historicalData: {
    month: string;
    revenue: number;
    expenses: number;
  }[]
): Promise<string> {
  try {
    // Format the historical data for the prompt
    const formattedData = historicalData
      .map(item => `${item.month}: Revenue $${item.revenue.toFixed(2)}, Expenses $${item.expenses.toFixed(2)}`)
      .join('\n');

    const prompt = `
You are an AI CFO assistant, analyzing the following monthly financial trend data:

${formattedData}

Based on this data, provide insights on:
1. Revenue and expense trends
2. Profitability patterns
3. Recommendations for financial strategy adjustments

Be concise but detailed in your analysis.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "Analyze these financial trends" }
      ],
      max_tokens: 500,
    });

    return response.choices[0].message.content || "I couldn't analyze the financial trends at this time.";
  } catch (error) {
    console.error("OpenAI API error:", error);
    return "I'm having trouble analyzing financial trends right now. Please try again later.";
  }
}
