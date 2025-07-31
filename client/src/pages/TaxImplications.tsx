import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { CalendarIcon, DollarSignIcon, AlertTriangleIcon, FileTextIcon } from "lucide-react";
import { useDynamicTerms } from "@/hooks/useDynamicTerms";
import { TaxImplication } from "@shared/schema";

interface TaxSummaryCardProps {
  title: string;
  amount: number;
  description: string;
  type: "income" | "deduction" | "liability" | "savings";
}

function TaxSummaryCard({ title, amount, description, type }: TaxSummaryCardProps) {
  const colorMap = {
    income: "text-red-600 dark:text-red-400",
    deduction: "text-green-600 dark:text-green-400", 
    liability: "text-orange-600 dark:text-orange-400",
    savings: "text-blue-600 dark:text-blue-400"
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${colorMap[type]}`}>
          ${amount.toFixed(2)}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function TaxImplications() {
  const { creditor, debtor } = useDynamicTerms();
  const currentYear = new Date().getFullYear();

  const { data: taxData, isLoading, error } = useQuery<TaxImplication>({
    queryKey: ["/api/tax/implications", currentYear],
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertTriangleIcon className="h-4 w-4" />
          <AlertDescription>
            Failed to load tax implications. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const interestIncome = parseFloat(taxData?.totalInterestIncome || "0");
  const interestPaid = parseFloat(taxData?.totalInterestPaid || "0");
  const deductibleInterest = parseFloat(taxData?.totalDeductibleInterest || "0");
  const estimatedLiability = parseFloat(taxData?.estimatedTaxLiability || "0");
  const estimatedSavings = parseFloat(taxData?.estimatedTaxSavings || "0");
  const badDebtWrite = parseFloat(taxData?.totalBadDebtWrite || "0");

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tax Implications {currentYear}</h1>
          <p className="text-muted-foreground">
            Estimated tax implications for your {creditor.toLowerCase()}/{debtor.toLowerCase()} activities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            <CalendarIcon className="h-3 w-3 mr-1" />
            {currentYear}
          </Badge>
        </div>
      </div>

      {/* Legal Disclaimer */}
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
        <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          <strong>Tax Estimate Disclaimer:</strong> These are automated estimates only. 
          Tax implications vary by individual circumstances. Consult a qualified tax professional 
          or CPA for accurate advice. We are not a bank and provide no tax guarantees.
        </AlertDescription>
      </Alert>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <TaxSummaryCard
          title="Interest Income"
          amount={interestIncome}
          description={`As ${creditor.toLowerCase()}: Taxable income`}
          type="income"
        />
        <TaxSummaryCard
          title="Interest Paid"
          amount={interestPaid}
          description={`As ${debtor.toLowerCase()}: Total paid`}
          type="deduction"
        />
        <TaxSummaryCard
          title="Estimated Tax Liability"
          amount={estimatedLiability}
          description="At estimated 22% rate"
          type="liability"
        />
        <TaxSummaryCard
          title="Potential Tax Savings"
          amount={estimatedSavings}
          description="From deductible interest"
          type="savings"
        />
      </div>

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lender Perspective */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSignIcon className="h-5 w-5 text-green-600" />
              As {creditor}
            </CardTitle>
            <CardDescription>
              Tax implications when you lend money to others
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span>Interest Income (Taxable)</span>
              <span className="font-semibold text-red-600">${interestIncome.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Bad Debt Write-offs</span>
              <span className="font-semibold text-green-600">${badDebtWrite.toFixed(2)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center font-semibold">
              <span>Net Taxable Income</span>
              <span className="text-red-600">${(interestIncome - badDebtWrite).toFixed(2)}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              * Interest received is generally taxable income
              <br />
              * Bad debt losses may be deductible as capital losses
            </div>
          </CardContent>
        </Card>

        {/* Borrower Perspective */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSignIcon className="h-5 w-5 text-blue-600" />
              As {debtor}
            </CardTitle>
            <CardDescription>
              Tax implications when you borrow money from others
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span>Total Interest Paid</span>
              <span className="font-semibold">${interestPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Potentially Deductible</span>
              <span className="font-semibold text-green-600">${deductibleInterest.toFixed(2)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-center font-semibold">
              <span>Estimated Tax Savings</span>
              <span className="text-green-600">${estimatedSavings.toFixed(2)}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              * Personal loan interest is typically NOT deductible
              <br />
              * Business/investment loan interest may be deductible
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tax Notes */}
      {taxData?.calculationNotes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileTextIcon className="h-5 w-5" />
              Tax Calculation Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap text-muted-foreground">
              {taxData.calculationNotes}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline">
          Export Tax Summary
        </Button>
        <Button variant="outline">
          Download 1099 Forms
        </Button>
        <Button>
          Consult Tax Professional
        </Button>
      </div>
    </div>
  );
}