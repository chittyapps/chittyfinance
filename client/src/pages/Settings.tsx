import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useSeasonalTheme } from "@/hooks/useSeasonalTheme";
import { useDynamicTerms } from "@/hooks/useDynamicTerms";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const settingsSchema = z.object({
  creditorTerm: z.string().min(1, "Creditor term is required").max(20, "Must be 20 characters or less"),
  debtorTerm: z.string().min(1, "Debtor term is required").max(20, "Must be 20 characters or less"),
  seasonalTheme: z.enum(["spring", "summer", "fall", "winter"]),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export default function Settings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const seasonalTheme = useSeasonalTheme();
  const terms = useDynamicTerms();

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      creditorTerm: user?.creditorTerm || "Lender",
      debtorTerm: user?.debtorTerm || "Borrower",
      seasonalTheme: (user?.seasonalTheme as any) || "spring",
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: SettingsForm) => {
      const res = await apiRequest("PUT", "/api/user/settings", data);
      return await res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/user"], updatedUser);
      toast({
        title: "Settings updated!",
        description: "Your preferences have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SettingsForm) => {
    updateSettingsMutation.mutate(data);
  };

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-800 mb-2">Settings</h1>
        <p className="text-neutral-600">
          Customize your Close Lender experience with dynamic terms and seasonal themes
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Form */}
        <div className="lg:col-span-2">
          <Card className="loan-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <i className="fas fa-cog text-primary"></i>
                Preferences
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {/* Dynamic Terms Section */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-800 mb-2">Dynamic Terms</h3>
                      <p className="text-sm text-neutral-600 mb-4">
                        Customize how you refer to the parties in lending relationships. These terms will appear throughout the app.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="creditorTerm"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Money Provider Term</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Lender, Creditor, Helper"
                                {...field}
                                disabled={updateSettingsMutation.isPending}
                              />
                            </FormControl>
                            <FormDescription>
                              What you call the person lending money
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="debtorTerm"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Money Receiver Term</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g., Borrower, Debtor, Friend"
                                {...field}
                                disabled={updateSettingsMutation.isPending}
                              />
                            </FormControl>
                            <FormDescription>
                              What you call the person receiving money
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-900 mb-2">Preview</h4>
                      <p className="text-sm text-blue-800">
                        "Create a new loan where you are the <strong>{form.watch("creditorTerm")}</strong> 
                        and John is the <strong>{form.watch("debtorTerm")}</strong>."
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Seasonal Theme Section */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-neutral-800 mb-2">Seasonal Theme</h3>
                      <p className="text-sm text-neutral-600 mb-4">
                        Choose your preferred season. The app will evolve and grow as you make payments on time!
                      </p>
                    </div>

                    <FormField
                      control={form.control}
                      name="seasonalTheme"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preferred Season</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a season" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="spring">🌱 Spring - Growth & New Beginnings</SelectItem>
                              <SelectItem value="summer">☀️ Summer - Flourishing & Energy</SelectItem>
                              <SelectItem value="fall">🍂 Fall - Harvest & Abundance</SelectItem>
                              <SelectItem value="winter">❄️ Winter - Strength & Endurance</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Your tree will grow and change with your payment performance
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full hero-gradient text-white"
                    disabled={updateSettingsMutation.isPending}
                  >
                    {updateSettingsMutation.isPending ? (
                      <>
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        Saving...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-save mr-2"></i>
                        Save Settings
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {/* Preview Panel */}
        <div className="space-y-6">
          {/* Seasonal Preview */}
          <Card className="loan-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <i className={seasonalTheme.iconClass + " text-primary"}></i>
                Your Growth
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="text-6xl mb-4">
                {seasonalTheme.treeStage}
              </div>
              <div>
                <h4 className="font-semibold text-neutral-800 capitalize">
                  {seasonalTheme.season} Theme
                </h4>
                <p className="text-sm text-neutral-600 mt-1">
                  Tree Growth: {user.treeGrowthLevel || 0}%
                </p>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full bg-gradient-to-r ${seasonalTheme.gradientFrom} ${seasonalTheme.gradientTo}`}
                  style={{ width: `${user.treeGrowthLevel || 0}%` }}
                ></div>
              </div>
              <p className="text-xs text-neutral-600 italic">
                {seasonalTheme.motivationalMessage}
              </p>
            </CardContent>
          </Card>

          {/* Legal Disclaimer */}
          <Card className="loan-card border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-800">
                <i className="fas fa-exclamation-triangle"></i>
                Important Notice
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-amber-800 space-y-2">
              <p><strong>We are not a bank.</strong> We do not guarantee loans or act as a financial institution.</p>
              <p><strong>No guarantees.</strong> We provide tools but make no promises about loan outcomes.</p>
              <p><strong>Use at your own risk.</strong> Always consult an attorney before entering loan agreements.</p>
              <p><strong>Free basic tracking.</strong> Premium features like certified mail and AI-generated notices require payment.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}