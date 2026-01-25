import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { apiRequest } from '@/lib/queryClient';
import { CreditCard, Calendar, AlertCircle, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types for API responses
interface ChargeDetails {
  id: string;
  merchantName: string;
  amount: number;
  date: Date;
  category: string;
  recurring: boolean;
  nextChargeDate?: Date;
  subscriptionId?: string;
}

interface OptimizationRecommendation {
  chargeId: string;
  merchantName: string;
  currentAmount: number;
  suggestedAction: 'cancel' | 'downgrade' | 'consolidate' | 'negotiate';
  potentialSavings: number;
  reasoning: string;
  alternativeOptions?: string[];
}

export default function ChargeAutomation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState('recurring');
  const [selectedCharge, setSelectedCharge] = useState<ChargeDetails | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // Fetch recurring charges
  const { data: recurringCharges, isLoading: isLoadingCharges } = useQuery<ChargeDetails[]>({
    queryKey: ['/api/charges/recurring'],
  });
  
  // Fetch optimization recommendations
  const { data: optimizations, isLoading: isLoadingOptimizations } = useQuery<OptimizationRecommendation[]>({
    queryKey: ['/api/charges/optimizations'],
  });
  
  // Manage recurring charge mutation
  const manageMutation = useMutation({
    mutationFn: async ({ chargeId, action }: { chargeId: string; action: 'cancel' | 'modify' }) => {
      return apiRequest('POST', '/api/charges/manage', { chargeId, action })
        .then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/charges/recurring'] });
      toast({
        title: "Success!",
        description: "The subscription has been updated successfully.",
      });
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "There was a problem updating the subscription.",
        variant: "destructive",
      });
    }
  });
  
  const handleCancelSubscription = (charge: ChargeDetails) => {
    setSelectedCharge(charge);
    setIsDialogOpen(true);
  };
  
  const confirmCancelSubscription = () => {
    if (selectedCharge) {
      manageMutation.mutate({ 
        chargeId: selectedCharge.id, 
        action: 'cancel' 
      });
    }
  };
  
  // Calculate savings
  const calculateTotalSavings = () => {
    if (!optimizations) return 0;
    return optimizations.reduce((sum, opt) => sum + opt.potentialSavings, 0);
  };
  
  return (
    <Card className="card">
      <CardHeader className="card-header">
        <CardTitle className="text-lg font-medium text-lime-400">Charge Automation</CardTitle>
      </CardHeader>
      
      <Tabs defaultValue="recurring" onValueChange={setSelectedTab}>
        <div className="px-4 py-3 border-b border-zinc-800">
          <TabsList className="grid w-full grid-cols-2 bg-zinc-800 p-1">
            <TabsTrigger 
              value="recurring" 
              className="data-[state=active]:bg-lime-400 data-[state=active]:text-black data-[state=active]:shadow-none text-zinc-300"
            >
              Recurring Charges
            </TabsTrigger>
            <TabsTrigger 
              value="optimizations"
              className="data-[state=active]:bg-lime-400 data-[state=active]:text-black data-[state=active]:shadow-none text-zinc-300"
            >
              Optimizations 
              {optimizations && optimizations.length > 0 && (
                <Badge className="ml-2 bg-zinc-900 text-lime-400 border border-lime-500/20">
                  {optimizations.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>
        
        <CardContent className="px-6 py-4">
          <TabsContent value="recurring" className="m-0">
            <div className="space-y-4">
              {isLoadingCharges ? (
                // Loading state
                <>
                  <ChargeItemSkeleton />
                  <ChargeItemSkeleton />
                  <ChargeItemSkeleton />
                </>
              ) : recurringCharges && recurringCharges.length > 0 ? (
                recurringCharges.map(charge => (
                  <div 
                    key={charge.id} 
                    className="p-4 rounded-lg border border-zinc-700 bg-zinc-800"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-zinc-900 border border-lime-500/20 text-lime-400 flex items-center justify-center mr-3">
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-medium text-zinc-100">
                            {charge.merchantName}
                          </h4>
                          <p className="text-sm text-zinc-400">
                            {charge.category}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-lime-400">
                          {formatCurrency(charge.amount)}
                        </p>
                        <p className="text-sm text-zinc-400">
                          Last charged on {formatDate(charge.date)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="mt-3 pt-3 border-t border-zinc-700 flex justify-between items-center">
                      <div className="flex items-center text-sm text-zinc-400">
                        <Calendar className="h-4 w-4 mr-1 text-lime-400" />
                        Next charge: {charge.nextChargeDate ? formatDate(charge.nextChargeDate) : 'Unknown'}
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="text-red-400 border-red-800/30 hover:bg-red-900/20 hover:text-red-300"
                        onClick={() => handleCancelSubscription(charge)}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Cancel Subscription
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <p className="text-zinc-500">No recurring charges found.</p>
                </div>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="optimizations" className="m-0">
            <div className="mb-4 p-4 rounded-lg bg-zinc-800 border border-lime-500/10">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-lime-400 mr-2" />
                <div>
                  <h3 className="font-medium text-zinc-200">
                    Potential Monthly Savings
                  </h3>
                  <p className="text-2xl font-bold gradient-text">
                    {formatCurrency(calculateTotalSavings())}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              {isLoadingOptimizations ? (
                // Loading state
                <>
                  <OptimizationItemSkeleton />
                  <OptimizationItemSkeleton />
                </>
              ) : optimizations && optimizations.length > 0 ? (
                optimizations.map(optimization => (
                  <div 
                    key={optimization.chargeId} 
                    className="p-4 rounded-lg border border-zinc-700 bg-zinc-800"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-zinc-100">
                          {optimization.merchantName}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge className="bg-zinc-900 text-lime-400 border border-lime-500/20">
                            {optimization.suggestedAction.toUpperCase()}
                          </Badge>
                          <p className="text-sm text-zinc-400">
                            {optimization.reasoning}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-zinc-300">
                          Current: {formatCurrency(optimization.currentAmount)}
                        </p>
                        <p className="text-sm font-medium text-lime-400">
                          Potential Savings: {formatCurrency(optimization.potentialSavings)}
                        </p>
                      </div>
                    </div>
                    
                    {optimization.alternativeOptions && optimization.alternativeOptions.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-zinc-700">
                        <p className="text-sm font-medium text-lime-400 mb-1">
                          Alternative Options:
                        </p>
                        <ul className="list-disc list-inside text-sm text-zinc-400">
                          {optimization.alternativeOptions.map((option, index) => (
                            <li key={index}>{option}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    <div className="mt-3 pt-3 border-t border-zinc-700 flex justify-end">
                      <Button 
                        variant="default" 
                        size="sm"
                        className="mr-2 bg-lime-400 text-black hover:bg-lime-500"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Apply Recommendation
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-zinc-600 text-zinc-300 hover:bg-zinc-700"
                      >
                        Ignore
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <p className="text-zinc-500">No optimization recommendations available.</p>
                </div>
              )}
            </div>
          </TabsContent>
        </CardContent>
      </Tabs>
      
      {/* Cancel Subscription Dialog */}
      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent className="bg-zinc-900 border border-zinc-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lime-400">Cancel Subscription</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-300">
              Are you sure you want to cancel your subscription to {selectedCharge?.merchantName}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700 hover:text-zinc-200">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmCancelSubscription}
              className="bg-red-900 hover:bg-red-800 text-red-200 border border-red-700"
            >
              Yes, Cancel Subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ChargeItemSkeleton() {
  return (
    <div className="p-4 rounded-lg border border-zinc-700 bg-zinc-800">
      <div className="flex justify-between items-start">
        <div className="flex items-center">
          <Skeleton className="h-10 w-10 rounded-full mr-3 bg-zinc-700" />
          <div>
            <Skeleton className="h-5 w-36 mb-1 bg-zinc-700" />
            <Skeleton className="h-4 w-24 bg-zinc-700" />
          </div>
        </div>
        <div className="text-right">
          <Skeleton className="h-5 w-24 mb-1 ml-auto bg-zinc-700" />
          <Skeleton className="h-4 w-32 ml-auto bg-zinc-700" />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-zinc-700 flex justify-between items-center">
        <Skeleton className="h-4 w-40 bg-zinc-700" />
        <Skeleton className="h-8 w-32 bg-zinc-700" />
      </div>
    </div>
  );
}

function OptimizationItemSkeleton() {
  return (
    <div className="p-4 rounded-lg border border-zinc-700 bg-zinc-800">
      <div className="flex justify-between items-start">
        <div>
          <Skeleton className="h-5 w-36 mb-1 bg-zinc-700" />
          <Skeleton className="h-4 w-64 mt-1 bg-zinc-700" />
        </div>
        <div className="text-right">
          <Skeleton className="h-5 w-28 mb-1 ml-auto bg-zinc-700" />
          <Skeleton className="h-4 w-36 ml-auto bg-zinc-700" />
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-zinc-700">
        <Skeleton className="h-4 w-32 mb-1 bg-zinc-700" />
        <Skeleton className="h-4 w-full max-w-md mb-1 bg-zinc-700" />
        <Skeleton className="h-4 w-full max-w-sm bg-zinc-700" />
      </div>
      <div className="mt-3 pt-3 border-t border-zinc-700 flex justify-end">
        <Skeleton className="h-8 w-32 mr-2 bg-zinc-700" />
        <Skeleton className="h-8 w-20 bg-zinc-700" />
      </div>
    </div>
  );
}