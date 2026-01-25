import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Integration } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { getServiceColor, getServiceIcon, formatTimeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export default function ConnectedServices() {
  const { data: integrations, isLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3 border-b border-gray-200 dark:border-gray-700">
        <CardTitle className="text-lg font-medium">Connected Services</CardTitle>
      </CardHeader>
      
      <CardContent className="px-6 py-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            // Skeleton loading state
            <>
              <ServiceCardSkeleton />
              <ServiceCardSkeleton />
              <ServiceCardSkeleton />
            </>
          ) : (
            // Display integrations
            integrations?.map((integration) => (
              <ServiceCard key={integration.id} integration={integration} />
            ))
          )}
        </div>
        
        <div className="mt-6">
          <Button variant="outline" className="text-primary bg-primary/10 hover:bg-primary/20 border-transparent">
            <Plus className="mr-2 -ml-1 h-5 w-5" />
            Connect New Service
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface ServiceCardProps {
  integration: Integration;
}

function ServiceCard({ integration }: ServiceCardProps) {
  // Get service icon and color based on service type
  const serviceColor = getServiceColor(integration.serviceType);
  const serviceIcon = getServiceIcon(integration.serviceType);

  return (
    <div className="connection-card bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className={`h-10 w-10 rounded-md ${serviceColor} flex items-center justify-center`}>
                <span className="text-white font-bold text-lg">{serviceIcon}</span>
              </div>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">{integration.name}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">{integration.description}</p>
            </div>
          </div>
          <div className="ml-4 flex-shrink-0">
            <Badge variant={integration.connected ? "outline" : "secondary"} className={integration.connected 
              ? "bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"
              : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
            }>
              {integration.connected ? "Connected" : "Disconnected"}
            </Badge>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">Last synced:</span>
            <span className="text-gray-900 dark:text-white">
              {integration.lastSynced ? formatTimeAgo(integration.lastSynced) : "Never"}
            </span>
          </div>
        </div>
      </div>
      <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 text-right">
        <Button variant="link" className="text-xs font-medium text-primary hover:text-primary-dark p-0 h-auto">
          Configure
        </Button>
      </div>
    </div>
  );
}

function ServiceCardSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="p-4">
        <div className="flex items-start">
          <Skeleton className="h-10 w-10 rounded-md" />
          <div className="ml-3 flex-1">
            <Skeleton className="h-4 w-24 mb-1" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="ml-2 h-5 w-20 rounded-full" />
        </div>
        <div className="mt-3">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
      <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 text-right">
        <Skeleton className="h-4 w-16 ml-auto" />
      </div>
    </div>
  );
}
