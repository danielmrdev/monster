import { createServiceClient } from "@/lib/supabase/service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertList } from "./AlertList";
import type { AlertRow } from "./AlertList";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("product_alerts")
    .select("*, sites(name), tsa_products(asin, title)")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch open alerts: ${error.message}`);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
      <Card>
        <CardHeader>
          <CardTitle>Open Alerts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <AlertList alerts={(data ?? []) as AlertRow[]} />
        </CardContent>
      </Card>
    </div>
  );
}
