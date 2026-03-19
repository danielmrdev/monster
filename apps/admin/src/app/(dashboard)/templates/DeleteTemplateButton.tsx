"use client";

import { deleteTemplate } from "./actions";

export function DeleteTemplateButton({ id, title }: { id: string; title: string }) {
  return (
    <button
      type="button"
      className="text-xs text-destructive/70 hover:text-destructive transition-colors"
      onClick={async () => {
        if (!confirm(`Delete "${title}"?`)) return;
        await deleteTemplate(id);
      }}
    >
      Delete
    </button>
  );
}
