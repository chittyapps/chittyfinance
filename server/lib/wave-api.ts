/**
 * Wave Accounting GraphQL API Client
 *
 * Documentation: https://developer.waveapps.com/hc/en-us/articles/360019968212-API-Reference
 * OAuth Guide: https://developer.waveapps.com/hc/en-us/articles/360019493652-OAuth-Guide
 *
 * Requirements:
 * - Wave Pro or Wave Advisor subscription
 * - OAuth 2 credentials (CLIENT_ID, CLIENT_SECRET)
 * - Access token obtained through OAuth flow
 */

const WAVE_GRAPHQL_ENDPOINT = 'https://gql.waveapps.com/graphql/public';
const WAVE_OAUTH_AUTHORIZE_URL = 'https://api.waveapps.com/oauth2/authorize/';
const WAVE_OAUTH_TOKEN_URL = 'https://api.waveapps.com/oauth2/token/';

export interface WaveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface WaveTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface WaveBusiness {
  id: string;
  name: string;
  currency: {
    code: string;
  };
}

export interface WaveInvoice {
  id: string;
  invoiceNumber: string;
  total: {
    value: string;
    currency: {
      code: string;
    };
  };
  amountDue: {
    value: string;
  };
  status: string;
  customer: {
    name: string;
  };
  invoiceDate: string;
  dueDate: string;
}

export interface WaveExpense {
  id: string;
  description: string;
  total: {
    value: string;
    currency: {
      code: string;
    };
  };
  vendor: {
    name: string;
  } | null;
  transactionDate: string;
}

export interface WaveTransaction {
  id: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  date: string;
  category?: string;
}

/**
 * Wave API Client
 */
export class WaveAPIClient {
  private config: WaveConfig;
  private accessToken: string | null = null;

  constructor(config: WaveConfig) {
    this.config = config;
  }

  /**
   * Set access token for authenticated requests
   */
  setAccessToken(token: string) {
    this.accessToken = token;
  }

  /**
   * Generate OAuth authorization URL
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      state,
    });
    return `${WAVE_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<WaveTokens> {
    const response = await fetch(WAVE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Wave OAuth token exchange failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<WaveTokens> {
    const response = await fetch(WAVE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Wave token refresh failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Execute GraphQL query
   */
  private async graphql<T = any>(query: string, variables?: Record<string, any>): Promise<T> {
    if (!this.accessToken) {
      throw new Error('Wave API: Access token not set. Call setAccessToken() first.');
    }

    const response = await fetch(WAVE_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Wave GraphQL request failed: ${error}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`Wave GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  }

  /**
   * Get user's businesses
   */
  async getBusinesses(): Promise<WaveBusiness[]> {
    const query = `
      query {
        user {
          businesses(page: 1, pageSize: 10) {
            edges {
              node {
                id
                name
                currency {
                  code
                }
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{ user: { businesses: { edges: Array<{ node: WaveBusiness }> } } }>(query);
    return data.user.businesses.edges.map(edge => edge.node);
  }

  /**
   * Get invoices for a business
   */
  async getInvoices(businessId: string, page: number = 1, pageSize: number = 20): Promise<WaveInvoice[]> {
    const query = `
      query GetInvoices($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          invoices(page: $page, pageSize: $pageSize) {
            edges {
              node {
                id
                invoiceNumber
                total {
                  value
                  currency {
                    code
                  }
                }
                amountDue {
                  value
                }
                status
                customer {
                  name
                }
                invoiceDate
                dueDate
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{ business: { invoices: { edges: Array<{ node: WaveInvoice }> } } }>(
      query,
      { businessId, page, pageSize }
    );

    return data.business.invoices.edges.map(edge => edge.node);
  }

  /**
   * Get expenses for a business
   */
  async getExpenses(businessId: string, page: number = 1, pageSize: number = 50): Promise<WaveExpense[]> {
    const query = `
      query GetExpenses($businessId: ID!, $page: Int!, $pageSize: Int!) {
        business(id: $businessId) {
          expenses(page: $page, pageSize: $pageSize) {
            edges {
              node {
                id
                description
                total {
                  value
                  currency {
                    code
                  }
                }
                vendor {
                  name
                }
                transactionDate
              }
            }
          }
        }
      }
    `;

    const data = await this.graphql<{ business: { expenses: { edges: Array<{ node: WaveExpense }> } } }>(
      query,
      { businessId, page, pageSize }
    );

    return data.business.expenses.edges.map(edge => edge.node);
  }

  /**
   * Calculate financial summary from invoices and expenses
   */
  async getFinancialSummary(businessId: string): Promise<{
    monthlyRevenue: number;
    monthlyExpenses: number;
    outstandingInvoices: number;
    transactions: WaveTransaction[];
  }> {
    const [invoices, expenses] = await Promise.all([
      this.getInvoices(businessId, 1, 50),
      this.getExpenses(businessId, 1, 50),
    ]);

    // Calculate current month's revenue (paid invoices)
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let monthlyRevenue = 0;
    let outstandingInvoices = 0;
    const revenueTransactions: WaveTransaction[] = [];

    for (const invoice of invoices) {
      const invoiceDate = new Date(invoice.invoiceDate);
      const amount = parseFloat(invoice.total.value);

      if (invoice.status === 'PAID' &&
          invoiceDate.getMonth() === currentMonth &&
          invoiceDate.getFullYear() === currentYear) {
        monthlyRevenue += amount;
      }

      if (invoice.status !== 'PAID') {
        outstandingInvoices += parseFloat(invoice.amountDue.value);
      }

      revenueTransactions.push({
        id: invoice.id,
        description: `Invoice ${invoice.invoiceNumber} - ${invoice.customer.name}`,
        amount,
        type: 'income',
        date: invoice.invoiceDate,
        category: 'Invoice',
      });
    }

    // Calculate current month's expenses
    let monthlyExpenses = 0;
    const expenseTransactions: WaveTransaction[] = [];

    for (const expense of expenses) {
      const expenseDate = new Date(expense.transactionDate);
      const amount = parseFloat(expense.total.value);

      if (expenseDate.getMonth() === currentMonth &&
          expenseDate.getFullYear() === currentYear) {
        monthlyExpenses += amount;
      }

      expenseTransactions.push({
        id: expense.id,
        description: expense.vendor ? `${expense.description} - ${expense.vendor.name}` : expense.description,
        amount: -amount,
        type: 'expense',
        date: expense.transactionDate,
        category: 'Expense',
      });
    }

    // Combine and sort transactions
    const transactions = [...revenueTransactions, ...expenseTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20); // Return most recent 20 transactions

    return {
      monthlyRevenue,
      monthlyExpenses,
      outstandingInvoices,
      transactions,
    };
  }
}

/**
 * Create Wave API client instance
 */
export function createWaveClient(config: WaveConfig): WaveAPIClient {
  return new WaveAPIClient(config);
}
