import React, { useState, useContext } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Building, CreditCard, DollarSign, BarChart4, Home, CreditCard as CreditCardIcon } from "lucide-react";
import { AuthContext } from "../App";

// Service connection card component
interface ServiceCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  onConnect: () => void;
}

function ServiceCard({ name, description, icon, connected, onConnect }: ServiceCardProps) {
  return (
    <Card className="border border-zinc-800 bg-zinc-900 hover:border-lime-500/50 transition duration-300">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 flex items-center justify-center rounded-full bg-zinc-800 text-lime-400">
              {icon}
            </div>
            <div>
              <h3 className="text-lg font-medium text-zinc-200">{name}</h3>
              <p className="text-sm text-zinc-400">{description}</p>
            </div>
          </div>
          <Button 
            variant={connected ? "outline" : "default"}
            className={connected ? "border-lime-500 text-lime-500" : "bg-lime-500 text-black hover:bg-lime-600"}
            onClick={onConnect}
          >
            {connected ? "Connected" : "Connect"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConnectAccounts() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState("banking");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [connectedServices, setConnectedServices] = useState<string[]>([
    "mercury_bank", "doorloop" // Default connected services
  ]);

  // Redirect to login if not authenticated
  React.useEffect(() => {
    if (!isAuthenticated && !loading) {
      setLocation("/login");
    }
  }, [isAuthenticated, loading, setLocation]);

  const handleConnect = async (serviceType: string) => {
    if (!apiKey && !connectedServices.includes(serviceType)) {
      toast({
        title: "API Key Required",
        description: "Please enter an API key to connect this service.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Connect to the service
      const response = await apiRequest("POST", "/api/integrations", {
        serviceType,
        name: getServiceName(serviceType),
        description: getServiceDescription(serviceType),
        connected: true,
        lastSynced: new Date(),
        credentials: {
          apiKey: apiKey || "demo-key"
        }
      });

      if (response.ok) {
        // Add to connected services
        if (!connectedServices.includes(serviceType)) {
          setConnectedServices([...connectedServices, serviceType]);
        }

        toast({
          title: "Connection Successful",
          description: `Successfully connected to ${getServiceName(serviceType)}.`,
        });

        // Clear API key field
        setApiKey("");
      } else {
        throw new Error("Failed to connect");
      }
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: "There was an error connecting to this service. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper functions to get service information
  const getServiceName = (serviceType: string): string => {
    const names: Record<string, string> = {
      "mercury_bank": "Mercury Bank",
      "stripe": "Stripe Payments",
      "quickbooks": "QuickBooks",
      "xero": "Xero Accounting",
      "wavapps": "WavApps",
      "doorloop": "DoorLoop",
      "brex": "Brex",
      "gusto": "Gusto Payroll"
    };
    return names[serviceType] || serviceType;
  };

  const getServiceDescription = (serviceType: string): string => {
    const descriptions: Record<string, string> = {
      "mercury_bank": "Business Banking Platform",
      "stripe": "Payment Processing",
      "quickbooks": "Accounting Software",
      "xero": "Global Accounting Platform",
      "wavapps": "Financial Software",
      "doorloop": "Property Management",
      "brex": "Business Credit & Expenses",
      "gusto": "Payroll & HR"
    };
    return descriptions[serviceType] || "";
  };

  const getServiceIcon = (serviceType: string, size = 24) => {
    switch (serviceType) {
      case "mercury_bank":
        return <Building size={size} />;
      case "stripe":
        return <CreditCard size={size} />;
      case "quickbooks":
        return <BarChart4 size={size} />;
      case "wavapps":
        return <BarChart4 size={size} />;
      case "brex":
        return <CreditCardIcon size={size} />;
      case "doorloop":
        return <Home size={size} />;
      case "xero":
        return <BarChart4 size={size} />;
      case "gusto":
        return <DollarSign size={size} />;
      default:
        return <CreditCard size={size} />;
    }
  };

  // If loading or not authenticated, show loading state
  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="animate-spin w-8 h-8 border-4 border-lime-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-zinc-100">Connect Your Accounts</h1>
          <p className="mt-2 text-zinc-400">Link your financial services to get AI-powered insights and recommendations</p>
        </div>

        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="banking" className="data-[state=active]:bg-lime-500 data-[state=active]:text-black">
              Banking
            </TabsTrigger>
            <TabsTrigger value="accounting" className="data-[state=active]:bg-lime-500 data-[state=active]:text-black">
              Accounting
            </TabsTrigger>
            <TabsTrigger value="payments" className="data-[state=active]:bg-lime-500 data-[state=active]:text-black">
              Payments & Payroll
            </TabsTrigger>
          </TabsList>

          {/* Banking Integrations */}
          <TabsContent value="banking" className="space-y-4">
            <ServiceCard
              name="Mercury Bank"
              description="Business Banking Platform"
              icon={getServiceIcon("mercury_bank", 28)}
              connected={connectedServices.includes("mercury_bank")}
              onConnect={() => handleConnect("mercury_bank")}
            />
            <ServiceCard
              name="Brex"
              description="Business Credit & Expenses"
              icon={getServiceIcon("brex", 28)}
              connected={connectedServices.includes("brex")}
              onConnect={() => handleConnect("brex")}
            />
          </TabsContent>

          {/* Accounting Integrations */}
          <TabsContent value="accounting" className="space-y-4">
            <ServiceCard
              name="QuickBooks"
              description="Accounting Software"
              icon={getServiceIcon("quickbooks", 28)}
              connected={connectedServices.includes("quickbooks")}
              onConnect={() => handleConnect("quickbooks")}
            />
            <ServiceCard
              name="Xero"
              description="Global Accounting Platform"
              icon={getServiceIcon("xero", 28)}
              connected={connectedServices.includes("xero")}
              onConnect={() => handleConnect("xero")}
            />
            <ServiceCard
              name="WavApps"
              description="Financial Software"
              icon={getServiceIcon("wavapps", 28)}
              connected={connectedServices.includes("wavapps")}
              onConnect={() => handleConnect("wavapps")}
            />
            <ServiceCard
              name="DoorLoop"
              description="Property Management"
              icon={getServiceIcon("doorloop", 28)}
              connected={connectedServices.includes("doorloop")}
              onConnect={() => handleConnect("doorloop")}
            />
          </TabsContent>

          {/* Payments & Payroll Integrations */}
          <TabsContent value="payments" className="space-y-4">
            <ServiceCard
              name="Stripe"
              description="Payment Processing"
              icon={getServiceIcon("stripe", 28)}
              connected={connectedServices.includes("stripe")}
              onConnect={() => handleConnect("stripe")}
            />
            <ServiceCard
              name="Gusto"
              description="Payroll & HR"
              icon={getServiceIcon("gusto", 28)}
              connected={connectedServices.includes("gusto")}
              onConnect={() => handleConnect("gusto")}
            />
          </TabsContent>
        </Tabs>

        <div className="mt-10 pt-6 border-t border-zinc-800">
          <div className="mb-6">
            <h2 className="text-lg font-medium text-zinc-200">API Key for Connection</h2>
            <p className="text-sm text-zinc-500">Enter the API key for the service you're connecting</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="api-key" className="text-zinc-300">API Key</Label>
              <Input 
                id="api-key" 
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key" 
                className="bg-zinc-900 border-zinc-700 text-zinc-200"
              />
              <p className="mt-1 text-xs text-zinc-500">For demo purposes, you can leave this empty.</p>
            </div>
            
            <div className="flex justify-between">
              <Button 
                variant="outline"
                onClick={() => setLocation("/")}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Return to Dashboard
              </Button>
              
              <Button 
                onClick={() => {
                  toast({
                    title: "Accounts Connected",
                    description: "Your financial accounts have been successfully connected.",
                  });
                  setLocation("/");
                }}
                className="bg-lime-500 text-black hover:bg-lime-600"
              >
                Finish Setup
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}