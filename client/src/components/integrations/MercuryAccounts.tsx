import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type MercuryAccount = {
  id: string;
  name: string;
  last4?: string;
  type?: string;
  currency?: string;
};

export default function MercuryAccounts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch integrations to get existing selection
  const { data: integrations } = useQuery<any[]>({ queryKey: ["/api/integrations"] });
  const mercury = useMemo(() => integrations?.find((i) => i.serviceType === "mercury_bank"), [integrations]);
  const preselected: string[] = (mercury?.credentials?.selectedAccountIds as string[]) || [];

  const { data, isLoading, error } = useQuery<MercuryAccount[]>({
    queryKey: ["/api/mercury/accounts"],
  });

  const [selected, setSelected] = useState<string[]>(preselected);
  useEffect(() => setSelected(preselected), [preselected.join(",")]);

  const saveMutation = useMutation({
    mutationFn: async (accountIds: string[]) => {
      const res = await fetch("/api/mercury/select-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds }),
      });
      if (!res.ok) throw new Error("Failed to save account selection");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Mercury accounts updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onError: () => toast({ title: "Error", description: "Could not save selection.", variant: "destructive" }),
  });

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));
  };

  return (
    <Card id="mercury-accounts">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Mercury Bank Accounts</CardTitle>
            <CardDescription>Select which accounts to sync. Use ChittyConnect to manage linking.</CardDescription>
          </div>
          <a href="/connect" target="_blank" rel="noreferrer">
            <Button variant="outline">Connect via ChittyConnect</Button>
          </a>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="text-sm text-muted-foreground">
            Unable to list accounts. Ensure ChittyConnect API token is configured on the server.
          </div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted-foreground">No accounts found. Try Connect.</div>
        ) : (
          <div className="space-y-3">
            {data.map((acct) => {
              const id = acct.id;
              const checked = selected.includes(id);
              return (
                <label key={id} className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <div className="font-medium">{acct.name}</div>
                    <div className="text-xs text-muted-foreground">{acct.type || "Account"} {acct.last4 ? `• ${acct.last4}` : ""} {acct.currency ? `(${acct.currency})` : ""}</div>
                  </div>
                  <Checkbox checked={checked} onCheckedChange={(v) => toggle(id, Boolean(v))} />
                </label>
              );
            })}

            <div className="pt-2">
              <Button onClick={() => saveMutation.mutate(selected)} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save selection"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
