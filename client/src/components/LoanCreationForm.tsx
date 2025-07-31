import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";

const loanFormSchema = z.object({
  borrowerEmail: z.string().email("Please enter a valid email address"),
  amount: z.string().min(1, "Amount is required").refine(
    (val) => !isNaN(Number(val)) && Number(val) > 0,
    "Amount must be a positive number"
  ),
  interestRate: z.string().min(1, "Interest rate is required").refine(
    (val) => !isNaN(Number(val)) && Number(val) >= 0,
    "Interest rate must be a non-negative number"
  ),
  termMonths: z.string().min(1, "Term is required").refine(
    (val) => !isNaN(Number(val)) && Number(val) > 0,
    "Term must be a positive number"
  ),
  purpose: z.string().optional(),
  relationship: z.string().min(1, "Please select relationship type"),
});

type LoanFormData = z.infer<typeof loanFormSchema>;

interface LoanCreationFormProps {
  onSuccess: () => void;
}

export default function LoanCreationForm({ onSuccess }: LoanCreationFormProps) {
  const { toast } = useToast();
  const [suggestedRate, setSuggestedRate] = useState<{
    suggestedRate: number;
    marketRate: number;
    irsRate: number;
    reasoning: string;
  } | null>(null);

  const form = useForm<LoanFormData>({
    resolver: zodResolver(loanFormSchema),
    defaultValues: {
      borrowerEmail: "",
      amount: "",
      interestRate: "",
      termMonths: "36",
      purpose: "",
      relationship: "",
    },
  });

  // Calculate monthly payment
  const calculateMonthlyPayment = (principal: number, rate: number, months: number) => {
    const monthlyRate = rate / 100 / 12;
    const payment = (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) / 
                   (Math.pow(1 + monthlyRate, months) - 1);
    return isNaN(payment) ? 0 : payment;
  };

  // Get AI rate suggestion
  const getAISuggestion = async () => {
    const amount = parseFloat(form.getValues("amount"));
    const termMonths = parseInt(form.getValues("termMonths"));
    const relationship = form.getValues("relationship");

    if (!amount || !termMonths || !relationship) {
      toast({
        title: "Missing Information",
        description: "Please fill in amount, term, and relationship type to get AI suggestions.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/ai/suggest-rate", {
        amount,
        termMonths,
        relationship,
      });
      const data = await response.json();
      setSuggestedRate(data);
      form.setValue("interestRate", data.suggestedRate.toString());
    } catch (error) {
      toast({
        title: "AI Suggestion Failed",
        description: "Could not get rate suggestions. Please set the rate manually.",
        variant: "destructive",
      });
    }
  };

  const loanMutation = useMutation({
    mutationFn: async (data: LoanFormData) => {
      const amount = parseFloat(data.amount);
      const interestRate = parseFloat(data.interestRate);
      const termMonths = parseInt(data.termMonths);
      const monthlyPayment = calculateMonthlyPayment(amount, interestRate, termMonths);

      // In a real app, you'd create/find the borrower user first
      // For now, we'll use a placeholder borrower ID
      const loanData = {
        borrowerId: "placeholder-borrower-id", // This would be resolved from email
        amount: data.amount,
        interestRate: data.interestRate,
        termMonths: data.termMonths,
        monthlyPayment: monthlyPayment.toString(),
        purpose: data.purpose || null,
        status: 'pending' as const,
      };

      await apiRequest("POST", "/api/loans", loanData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/loans"] });
      toast({
        title: "Loan Created",
        description: "Your loan has been successfully created!",
      });
      onSuccess();
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to create loan. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: LoanFormData) => {
    loanMutation.mutate(data);
  };

  const watchedValues = form.watch();
  const monthlyPayment = calculateMonthlyPayment(
    parseFloat(watchedValues.amount) || 0,
    parseFloat(watchedValues.interestRate) || 0,
    parseInt(watchedValues.termMonths) || 0
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Borrower Information */}
        <Card className="loan-card">
          <CardHeader>
            <CardTitle>Borrower Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="borrowerEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Borrower Email</FormLabel>
                  <FormControl>
                    <Input placeholder="borrower@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="relationship"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Relationship</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select relationship type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="family">Family Member</SelectItem>
                      <SelectItem value="friend">Friend</SelectItem>
                      <SelectItem value="colleague">Colleague</SelectItem>
                      <SelectItem value="neighbor">Neighbor</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Loan Terms */}
        <Card className="loan-card">
          <CardHeader>
            <CardTitle>Loan Terms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Loan Amount ($)</FormLabel>
                    <FormControl>
                      <Input placeholder="15000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="termMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Term (Months)</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select term" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="12">12 months</SelectItem>
                        <SelectItem value="24">24 months</SelectItem>
                        <SelectItem value="36">36 months</SelectItem>
                        <SelectItem value="48">48 months</SelectItem>
                        <SelectItem value="60">60 months</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex items-end space-x-4">
              <FormField
                control={form.control}
                name="interestRate"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>Interest Rate (%)</FormLabel>
                    <FormControl>
                      <Input placeholder="4.5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button 
                type="button" 
                onClick={getAISuggestion}
                variant="outline"
                className="mb-2"
              >
                <i className="fas fa-lightbulb mr-2"></i>
                Get AI Suggestion
              </Button>
            </div>

            <FormField
              control={form.control}
              name="purpose"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Loan Purpose (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="e.g., Car purchase, home improvement, business startup..."
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* AI Recommendation */}
        {suggestedRate && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <i className="fas fa-lightbulb text-blue-600 text-xl"></i>
                <h4 className="font-semibold text-blue-800">AI Recommendation</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-blue-700">Suggested Rate</p>
                  <p className="font-bold text-blue-900">{suggestedRate.suggestedRate}%</p>
                </div>
                <div>
                  <p className="text-blue-700">Market Rate</p>
                  <p className="font-bold text-blue-900">{suggestedRate.marketRate}%</p>
                </div>
                <div>
                  <p className="text-blue-700">IRS Rate</p>
                  <p className="font-bold text-blue-900">{suggestedRate.irsRate}%</p>
                </div>
              </div>
              <p className="text-blue-700 text-sm mt-2">{suggestedRate.reasoning}</p>
            </CardContent>
          </Card>
        )}

        {/* Payment Preview */}
        {monthlyPayment > 0 && (
          <Card className="loan-card">
            <CardHeader>
              <CardTitle>Payment Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <p className="text-sm text-neutral-600 mb-2">Monthly Payment</p>
                <p className="text-3xl font-bold text-neutral-800">
                  ${monthlyPayment.toFixed(2)}
                </p>
                <p className="text-sm text-neutral-600 mt-2">
                  Total Amount: ${(monthlyPayment * parseInt(watchedValues.termMonths || "0")).toFixed(2)}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <div className="flex justify-end space-x-4">
          <Button 
            type="button" 
            variant="outline"
            onClick={() => form.reset()}
          >
            Reset
          </Button>
          <Button 
            type="submit" 
            disabled={loanMutation.isPending}
            className="hero-gradient text-white px-8"
          >
            {loanMutation.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Creating Loan...
              </>
            ) : (
              <>
                <i className="fas fa-check mr-2"></i>
                Create Loan Agreement
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
