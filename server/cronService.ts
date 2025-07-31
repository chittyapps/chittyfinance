import { statementService } from "./statementService";

// Simple interval-based cron service for 30-day statement generation
export class CronService {
  private intervalId: NodeJS.Timeout | null = null;

  start() {
    // Run every 24 hours to check for statements that need generation
    this.intervalId = setInterval(async () => {
      try {
        console.log("Running scheduled statement generation...");
        await statementService.generateAllStatements();
        console.log("Scheduled statement generation completed.");
      } catch (error) {
        console.error("Error in scheduled statement generation:", error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours

    console.log("Statement generation cron service started");
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Statement generation cron service stopped");
    }
  }
}

export const cronService = new CronService();