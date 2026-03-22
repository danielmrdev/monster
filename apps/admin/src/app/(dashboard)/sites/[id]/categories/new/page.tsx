import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { CategoryForm } from "../CategoryForm";
import { createCategory } from "../actions";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NewCategoryPage({ params }: PageProps) {
  const { id: siteId } = await params;
  const supabase = createServiceClient();

  const { data: site } = await supabase.from("sites").select("id, name").eq("id", siteId).single();

  if (!site) notFound();

  const action = createCategory.bind(null, siteId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/sites/${siteId}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← {site.name}
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card px-6 py-5">
        <CategoryForm siteId={siteId} action={action} mode="create" />
      </div>
    </div>
  );
}
