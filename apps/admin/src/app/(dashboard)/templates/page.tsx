import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { DeleteTemplateButton } from "./DeleteTemplateButton";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  privacy: "Privacy Policy",
  terms: "Terms of Use",
  cookies: "Cookie Policy",
  contact: "Contact",
};

interface Template {
  id: string;
  title: string;
  type: string;
  language: string;
  updated_at: string;
}

export default async function TemplatesPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;
  const { data: templates } = await supabase
    .from("legal_templates")
    .select("id, title, type, language, updated_at")
    .order("type", { ascending: true })
    .order("language", { ascending: true });

  const byType = (templates ?? []).reduce((acc: Record<string, Template[]>, t: Template) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Legal Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage reusable legal page templates. Assign them to sites in the site edit
            page.
          </p>
        </div>
        <Link
          href="/templates/new"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          + New Template
        </Link>
      </div>

      {Object.keys(byType).length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No templates yet.</p>
          <Link href="/templates/new" className="text-sm text-primary hover:underline mt-2 block">
            Create your first template →
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {["privacy", "terms", "cookies", "contact"].map((type) => {
            const items: Template[] = byType[type] ?? [];
            return (
              <div
                key={type}
                className="rounded-xl border border-border bg-card divide-y divide-border"
              >
                <div className="px-5 py-3">
                  <h2 className="text-sm font-semibold text-foreground">
                    {TYPE_LABELS[type] ?? type}
                  </h2>
                </div>
                {items.length === 0 ? (
                  <div className="px-5 py-4">
                    <p className="text-xs text-muted-foreground">No templates for this type.</p>
                  </div>
                ) : (
                  items.map((t: Template) => (
                    <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Language: <span className="font-mono">{t.language}</span>
                          {" · "}Updated {new Date(t.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href={`/templates/${t.id}/edit`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Edit
                        </Link>
                        <DeleteTemplateButton id={t.id} title={t.title} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
