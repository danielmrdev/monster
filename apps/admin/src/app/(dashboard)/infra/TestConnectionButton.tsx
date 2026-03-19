"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plug } from "lucide-react";

interface ConnectionResult {
  ok: boolean;
  error?: string;
}

export default function TestConnectionButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);

  async function handleTest() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/infra/test-connection", { method: "POST" });
      const json: ConnectionResult = await res.json();
      setResult(json);
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" onClick={handleTest} disabled={loading}>
        {loading ? (
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
        ) : (
          <Plug className="size-4" data-icon="inline-start" />
        )}
        {loading ? "Testing…" : "Test Deploy Connection"}
      </Button>

      {result && (
        <div className="flex items-center gap-2">
          {result.ok ? (
            <Badge variant="default" className="bg-green-600 text-white">
              ✓ Connection OK
            </Badge>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="destructive">✗ Failed</Badge>
              {result.error && (
                <span className="text-sm text-destructive font-mono">{result.error}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
