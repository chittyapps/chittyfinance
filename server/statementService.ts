import { storage } from "./storage";
import { Statement, InsertStatement, TaxImplication, InsertTaxImplication } from "@shared/schema";

export interface StatementPeriod {
  startDate: Date;
  endDate: Date;
}

export interface StatementSummary {
  beginningBalance: number;
  endingBalance: number;
  totalPaymentsReceived: number;
  totalInterestAccrued: number;
  numberOfPayments: number;
  onTimePayments: number;
  latePayments: number;
  missedPayments: number;
}

export interface TaxEstimate {
  interestIncome: number;
  interestPaid: number;
  estimatedTaxLiability: number;
  taxBracket: number;
  deductibleInterest: number;
}

export class StatementService {
  
  // Generate 30-day statement for a loan
  async generateStatement(loanId: string): Promise<Statement> {
    const loan = await storage.getLoanWithPayments(loanId);
    if (!loan) {
      throw new Error("Loan not found");
    }

    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago

    // Check if statement already exists for this period
    const existingStatement = await storage.getStatementForPeriod(loanId, periodStart, periodEnd);
    if (existingStatement) {
      return existingStatement;
    }

    // Calculate statement summary
    const summary = await this.calculateStatementSummary(loan, periodStart, periodEnd);
    
    // Create new statement
    const statementData: InsertStatement = {
      loanId,
      statementPeriodStart: periodStart,
      statementPeriodEnd: periodEnd,
      beginningBalance: summary.beginningBalance.toString(),
      endingBalance: summary.endingBalance.toString(),
      totalPaymentsReceived: summary.totalPaymentsReceived.toString(),
      totalInterestAccrued: summary.totalInterestAccrued.toString(),
      totalFeesCharged: "0",
      numberOfPayments: summary.numberOfPayments,
      onTimePayments: summary.onTimePayments,
      latePayments: summary.latePayments,
      missedPayments: summary.missedPayments,
      status: "generated",
    };

    const statement = await storage.createStatement(statementData);

    // Create timeline event
    await storage.createTimelineEvent({
      loanId,
      eventType: "statement_generated",
      description: `30-day statement generated for period ${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`,
      createdBy: loan.lenderId,
    });

    return statement;
  }

  // Calculate summary for statement period
  private async calculateStatementSummary(loan: any, startDate: Date, endDate: Date): Promise<StatementSummary> {
    const payments = loan.payments?.filter((p: any) => {
      const paymentDate = new Date(p.paymentDate);
      return paymentDate >= startDate && paymentDate <= endDate && p.status === 'completed';
    }) || [];

    const totalPaymentsReceived = payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
    
    // Calculate interest accrued during period
    const dailyRate = parseFloat(loan.interestRate) / 100 / 365;
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const avgBalance = parseFloat(loan.remainingBalance); // Simplified - could be more accurate
    const totalInterestAccrued = avgBalance * dailyRate * days;

    // Calculate beginning balance (current balance + payments made in period)
    const beginningBalance = parseFloat(loan.remainingBalance) + totalPaymentsReceived;
    const endingBalance = parseFloat(loan.remainingBalance);

    // Payment timing analysis
    const onTimePayments = payments.filter((p: any) => p.status === 'completed' && new Date(p.paymentDate) <= new Date(p.dueDate)).length;
    const latePayments = payments.filter((p: any) => p.status === 'completed' && new Date(p.paymentDate) > new Date(p.dueDate)).length;
    const missedPayments = 0; // Would need due date tracking

    return {
      beginningBalance,
      endingBalance,
      totalPaymentsReceived,
      totalInterestAccrued,
      numberOfPayments: payments.length,
      onTimePayments,
      latePayments,
      missedPayments,
    };
  }

  // Auto-generate statements for all active loans (called by cron job)
  async generateAllStatements(): Promise<void> {
    const activeLoans = await storage.getActiveLoans();
    
    for (const loan of activeLoans) {
      try {
        await this.generateStatement(loan.id);
        console.log(`Generated statement for loan ${loan.id}`);
      } catch (error) {
        console.error(`Failed to generate statement for loan ${loan.id}:`, error);
      }
    }
  }
}

export class TaxCalculationService {
  
  // Calculate tax implications for a user for the current tax year
  async calculateTaxImplications(userId: string, taxYear?: number): Promise<TaxImplication> {
    const currentYear = taxYear || new Date().getFullYear();
    
    // Check if calculation already exists
    const existing = await storage.getTaxImplication(userId, currentYear);
    if (existing) {
      return existing;
    }

    const userLoans = await storage.getUserLoans(userId);
    
    let totalInterestIncome = 0;
    let totalInterestPaid = 0;
    let totalBadDebtWrite = 0;
    let totalDeductibleInterest = 0;

    // Calculate for loans where user is lender
    const lenderLoans = userLoans.filter(loan => loan.lenderId === userId);
    for (const loan of lenderLoans) {
      const yearPayments = await storage.getPaymentsByYear(loan.id, currentYear);
      const interestReceived = yearPayments
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => {
          // Calculate interest portion of payment
          const interestPortion = this.calculateInterestPortion(loan, parseFloat(p.amount));
          return sum + interestPortion;
        }, 0);
      
      totalInterestIncome += interestReceived;
      
      // Check for bad debt (defaulted loans)
      if (loan.status === 'defaulted') {
        totalBadDebtWrite += parseFloat(loan.remainingBalance);
      }
    }

    // Calculate for loans where user is borrower
    const borrowerLoans = userLoans.filter(loan => loan.borrowerId === userId);
    for (const loan of borrowerLoans) {
      const yearPayments = await storage.getPaymentsByYear(loan.id, currentYear);
      const interestPaid = yearPayments
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => {
          const interestPortion = this.calculateInterestPortion(loan, parseFloat(p.amount));
          return sum + interestPortion;
        }, 0);
      
      totalInterestPaid += interestPaid;
      
      // Determine deductible interest (simplified - depends on loan purpose)
      if (loan.purpose && (loan.purpose.includes('business') || loan.purpose.includes('investment'))) {
        totalDeductibleInterest += interestPaid;
      }
    }

    // Estimate tax liability (simplified calculation)
    const estimatedTaxRate = 0.22; // Assume 22% tax bracket
    const estimatedTaxLiability = totalInterestIncome * estimatedTaxRate;
    const estimatedTaxSavings = totalDeductibleInterest * estimatedTaxRate;

    const calculationNotes = this.generateTaxNotes(totalInterestIncome, totalInterestPaid, totalBadDebtWrite, totalDeductibleInterest);

    const taxData: InsertTaxImplication = {
      userId,
      taxYear: currentYear,
      totalInterestIncome: totalInterestIncome.toString(),
      totalBadDebtWrite: totalBadDebtWrite.toString(),
      totalInterestPaid: totalInterestPaid.toString(),
      totalDeductibleInterest: totalDeductibleInterest.toString(),
      estimatedTaxLiability: estimatedTaxLiability.toString(),
      estimatedTaxSavings: estimatedTaxSavings.toString(),
      calculationNotes,
    };

    return await storage.createTaxImplication(taxData);
  }

  // Calculate interest portion of a payment (simplified)
  private calculateInterestPortion(loan: any, paymentAmount: number): number {
    const monthlyRate = parseFloat(loan.interestRate) / 100 / 12;
    const balance = parseFloat(loan.remainingBalance);
    const interestPortion = balance * monthlyRate;
    
    return Math.min(interestPortion, paymentAmount);
  }

  // Generate tax calculation notes
  private generateTaxNotes(interestIncome: number, interestPaid: number, badDebt: number, deductible: number): string {
    const notes = [
      "** TAX ESTIMATE DISCLAIMER **",
      "This is an automated estimate only. Consult a tax professional for accurate advice.",
      "",
      "CALCULATIONS BASED ON:",
      `• Interest Income (lender): $${interestIncome.toFixed(2)}`,
      `• Interest Paid (borrower): $${interestPaid.toFixed(2)}`,
      `• Bad Debt Write-offs: $${badDebt.toFixed(2)}`,
      `• Potentially Deductible Interest: $${deductible.toFixed(2)}`,
      "",
      "ASSUMPTIONS:",
      "• 22% marginal tax rate used for estimates",
      "• Business/investment loans may have deductible interest",
      "• Personal loans typically have non-deductible interest",
      "• Bad debt write-offs may be deductible as capital losses",
      "",
      "IMPORTANT:",
      "• Interest income is generally taxable",
      "• Interest deductibility depends on loan purpose",
      "• Consult IRS Publication 535 for business interest",
      "• Consult a CPA or tax attorney for complex situations"
    ];
    
    return notes.join('\n');
  }
}

export const statementService = new StatementService();
export const taxCalculationService = new TaxCalculationService();