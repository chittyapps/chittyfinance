async fetchMercuryData(): Promise<any> {
    try {
      // Use production Mercury API keys from environment
      const mercuryApiKey = process.env.MERCURY_MGMT_API_KEY || this.config.mercury.apiKey;

      const response = await fetch(`${this.config.mercury.baseUrl}/accounts`, {
        headers: {
          'Authorization': mercuryApiKey,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.warn(`Mercury API error: ${response.statusText}, falling back to mock data`);
        return this.getMockMercuryData();
      }

      const data = await response.json();

      // Transform Mercury data to our format
      return {
        accounts: data.accounts?.map((account: any) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          balance: account.currentBalance,
          currency: 'USD'
        })) || [],
        transactions: data.transactions?.map((tx: any) => ({
          id: tx.id,
          date: tx.createdAt,
          description: tx.note || tx.counterpartyName,
          amount: tx.amount,
          category: tx.dashboardCategory,
          account: tx.accountId
        })) || [],
        totalBalance: data.accounts?.reduce((sum: number, acc: any) => sum + acc.currentBalance, 0) || 0
      };
    } catch (error) {
      console.error('Mercury API error:', error);
      // Return mock data as fallback
      return this.getMockMercuryData();
    }
  }