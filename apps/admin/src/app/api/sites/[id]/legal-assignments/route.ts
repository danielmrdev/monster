import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/sites/[id]/legal-assignments
 * Body: { assignments: Record<string, string> }  (templateType → templateId | '')
 *
 * Upserts non-empty assignments; deletes empty ones (= "Default").
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: siteId } = await params;

  let body: { assignments?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const assignments = body.assignments ?? {};
  const legalTypes = ["privacy", "terms", "cookies", "contact"];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  // Verify site exists
  const { data: site } = await createServiceClient()
    .from("sites")
    .select("id")
    .eq("id", siteId)
    .single();
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  for (const type of legalTypes) {
    const templateId = assignments[type]?.trim() ?? "";
    if (templateId) {
      // Upsert assignment
      const { error } = await supabase
        .from("legal_template_assignments")
        .upsert(
          { site_id: siteId, template_type: type, template_id: templateId },
          { onConflict: "site_id,template_type" },
        );
      if (error) {
        return NextResponse.json(
          { error: `Failed to assign ${type}: ${error.message}` },
          { status: 500 },
        );
      }
    } else {
      // Delete assignment (restore to default)
      await supabase
        .from("legal_template_assignments")
        .delete()
        .eq("site_id", siteId)
        .eq("template_type", type);
    }
  }

  return NextResponse.json({ ok: true });
}
