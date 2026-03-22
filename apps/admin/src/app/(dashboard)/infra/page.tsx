import { InfraService, type FleetHealth } from "@monster/deployment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TestConnectionButton from "./TestConnectionButton";
import ProvisionSection from "./ProvisionSection";

export const dynamic = "force-dynamic";

export default async function InfraPage() {
  let fleet: FleetHealth;

  // InfraService.getFleetHealth() never throws by contract, but we wrap with
  // try/catch as a defensive measure against unexpected errors.
  try {
    const infra = new InfraService();
    fleet = await infra.getFleetHealth();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return (
      <div className="space-y-8">
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">
              Fleet Health Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive font-mono">{message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground mt-1">
          Live health status of all registered servers — fetched at{" "}
          {new Date(fleet.fetchedAt).toLocaleString("en-GB", {
            dateStyle: "short",
            timeStyle: "medium",
          })}
        </p>
      </div>

      <ProvisionSection />

      {/* Fleet health table */}
      {fleet.servers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No active servers registered yet. Provision a server to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Server Fleet</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 font-medium">Name</th>
                  <th className="text-left py-2 font-medium">Reachable</th>
                  <th className="text-left py-2 font-medium">Caddy</th>
                  <th className="text-left py-2 font-medium">Disk</th>
                  <th className="text-left py-2 font-medium">Memory</th>
                </tr>
              </thead>
              <tbody>
                {fleet.servers.map((s) => (
                  <tr key={s.serverId} className="border-b last:border-0">
                    <td className="py-2 font-medium">{s.serverName}</td>
                    <td className={`py-2 ${s.reachable ? "text-green-500" : "text-red-500"}`}>
                      {s.reachable ? "Yes" : "No"}
                    </td>
                    <td className={`py-2 ${s.caddyActive ? "text-green-500" : "text-red-500"}`}>
                      {s.caddyActive ? "Active" : "Inactive"}
                    </td>
                    <td className="py-2">{s.diskUsedPct != null ? `${s.diskUsedPct}%` : "—"}</td>
                    <td className="py-2">
                      {s.memUsedMb != null && s.memTotalMb != null
                        ? `${s.memUsedMb} / ${s.memTotalMb} MB`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Test connection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Deploy Connection</CardTitle>
        </CardHeader>
        <CardContent>
          <TestConnectionButton />
        </CardContent>
      </Card>
    </div>
  );
}
