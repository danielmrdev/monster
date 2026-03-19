import { TemplateForm } from "../TemplateForm";
import { createTemplate } from "../actions";

export default function NewTemplatePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">New Legal Template</h1>
      <div className="rounded-xl border border-border bg-card px-6 py-5">
        <TemplateForm action={createTemplate} mode="create" />
      </div>
    </div>
  );
}
