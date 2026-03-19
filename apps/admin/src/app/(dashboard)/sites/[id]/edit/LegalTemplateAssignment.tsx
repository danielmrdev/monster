"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const LEGAL_TYPES = [
  { key: "privacy", label: "Privacy Policy" },
  { key: "terms", label: "Terms of Use" },
  { key: "cookies", label: "Cookie Policy" },
  { key: "contact", label: "Contact Page" },
];

interface Template {
  id: string;
  title: string;
  type: string;
  language: string;
}

interface LegalTemplateAssignmentProps {
  siteId: string;
  templates: Template[];
  currentAssignments: Record<string, string>; // templateType → templateId
}

/**
 * Legal template assignment section in the site edit page.
 * Uses a direct server action call pattern for saving assignments.
 */
export function LegalTemplateAssignment({
  siteId,
  templates,
  currentAssignments,
}: LegalTemplateAssignmentProps) {
  const [selections, setSelections] = useState<Record<string, string>>(currentAssignments);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(type: string, value: string) {
    setSelections((prev) => ({ ...prev, [type]: value }));
    setSaved(false);
  }

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/legal-assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignments: selections }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Failed to save assignments");
          return;
        }
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save assignments");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Legal Page Templates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Assign templates to legal pages. Without a template assigned, the page will have no
          content. Changes take effect on the next site generation.
        </p>

        {LEGAL_TYPES.map(({ key, label }) => {
          const options = templates.filter((t) => t.type === key);
          return (
            <div key={key} className="space-y-1.5">
              <label htmlFor={`legal-${key}`} className="text-sm font-medium text-foreground">
                {label}
              </label>
              <select
                id={`legal-${key}`}
                value={selections[key] ?? ""}
                onChange={(e) => handleChange(key, e.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">— No template assigned —</option>
                {options.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} [{t.language}]
                  </option>
                ))}
              </select>
              {options.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No {label} templates yet.{" "}
                  <a href="/templates/new" className="text-primary hover:underline">
                    Create one →
                  </a>
                </p>
              )}
            </div>
          );
        })}

        {saved && <p className="text-sm text-green-400">✓ Legal template assignments saved.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Saving…" : "Save Template Assignments"}
        </Button>
      </CardContent>
    </Card>
  );
}
