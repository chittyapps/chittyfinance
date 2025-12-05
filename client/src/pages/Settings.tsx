import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { Integration, User } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getServiceColor, getServiceIcon } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import MercuryAccounts from "@/components/integrations/MercuryAccounts";

export default function Settings() {
  const { toast } = useToast();
  type MercuryAccount = { id: string; name: string; last4?: string; type?: string; currency?: string };
  // Get user data
  const { data: user, isLoading: isLoadingUser } = useQuery<User>({
    queryKey: ["/api/session"],
  });

  // Get integrations
  const { data: integrations, isLoading: isLoadingIntegrations } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

// Fetch Mercury accounts (for tooltips / labels)
  const { data: mercuryAccounts } = useQuery<MercuryAccount[]>({
    queryKey: ["/api/mercury/accounts"],
  });
  return (
    <div className="py-6">
      {/* Page Header */}
      <div className="px-4 sm:px-6 md:px-8">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200">
          Settings
        </h1>

        <div className="mt-2 flex items-center text-sm text-gray-500 dark:text-gray-400">
          <span>Configure your account, integrations, and preferences.</span>
        </div>
      </div>

      {/* Settings Content */}
      <div className="px-4 sm:px-6 md:px-8 mt-8">
        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-3 md:flex md:space-x-2">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>
                  Update your account information and preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isLoadingUser ? (
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="name">Display Name</Label>
                      <Input id="name" defaultValue={user?.displayName} placeholder="Your name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" defaultValue={user?.email} placeholder="Your email" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Role</Label>
                      <Input id="role" defaultValue={user?.role} placeholder="Your role" />
                    </div>
                    <div className="pt-4">
                      <Button>Save Changes</Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Service Integrations</CardTitle>
                <CardDescription>
                  Manage connections to your financial services and productivity tools.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingIntegrations ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-full rounded-md" />
                    <Skeleton className="h-16 w-full rounded-md" />
                    <Skeleton className="h-16 w-full rounded-md" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {integrations?.map((integration) => (
                      <div key={integration.id} className="flex items-center justify-between border p-4 rounded-md">
                        <div className="flex items-center">
                          <div className={`h-10 w-10 rounded-md ${getServiceColor(integration.serviceType)} flex items-center justify-center mr-3`}>
                            <span className="text-white font-bold text-lg">{getServiceIcon(integration.serviceType)}</span>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium">{integration.name}</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {integration.description}
                              {integration.serviceType === "mercury_bank" && (
                                <span className="ml-2 text-[11px] text-orange-600 dark:text-orange-400">Managed via ChittyConnect</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {integration.serviceType === "mercury_bank" && (() => {
                            const selected: string[] = ((integration.credentials as any)?.selectedAccountIds || []) as string[];
                            const names = (mercuryAccounts || [])
                              .filter(a => selected.includes(a.id))
                              .map(a => `${a.name}${a.last4 ? ` • ${a.last4}` : ''}`);
                            const count = selected.length || 0;
                            return (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="secondary" className="mr-1 cursor-default">
                                      {count} {count === 1 ? 'account' : 'accounts'}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="max-w-xs whitespace-pre-line">
                                      {names.length > 0 ? names.join('\n') : 'No account details available'}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })()}
                          <div className="flex items-center space-x-2 mr-2">
                            <Switch id={`integration-${integration.id}`} checked={integration.connected ?? false} />
                            <Label htmlFor={`integration-${integration.id}`}>
                              {integration.connected ? "Connected" : "Disconnected"}
                            </Label>
                          </div>
                          {integration.serviceType === "mercury_bank" && (
                            <>
                              <a href="/connect" target="_blank" rel="noreferrer">
                                <Button variant="outline" size="sm">Connect</Button>
                              </a>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30"
                                onClick={() => {
                                  const el = document.getElementById("mercury-accounts");
                                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                                  toast({ title: "Mercury", description: "Jumped to accounts section." });
                                }}
                              >
                                Manage accounts
                              </Button>
                            </>
                          )}
                          <Button variant="outline" size="sm" className="hover:bg-orange-50 dark:hover:bg-orange-950/30">Tweak It</Button>
                        </div>
                      </div>
                    ))}

                    <Button className="mt-4" variant="outline">
                      Add New Integration
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="mt-6">
              <MercuryAccounts />
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Control when and how you want to be notified.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">Financial Alerts</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Receive alerts for unusual financial activity.
                      </p>
                    </div>
                    <Switch id="financial-alerts" defaultChecked />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">Invoice Reminders</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Get notified when invoices are coming due.
                      </p>
                    </div>
                    <Switch id="invoice-reminders" defaultChecked />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">AI CFO Insights</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Proactive financial advice from your AI assistant.
                      </p>
                    </div>
                    <Switch id="ai-insights" defaultChecked />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">Account Activity</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Be notified about significant account activity.
                      </p>
                    </div>
                    <Switch id="account-activity" defaultChecked />
                  </div>

                  <div className="pt-4">
                    <Button>Save Preferences</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}