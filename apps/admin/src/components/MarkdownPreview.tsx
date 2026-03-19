import { marked } from "marked"

interface MarkdownPreviewProps {
  content: string | null
  className?: string
}

/**
 * Renders Markdown content as HTML for admin preview.
 * Uses the same `marked` library as the Astro generator so the output is consistent.
 * Styles headings, paragraphs, and lists inline — no Tailwind Typography plugin needed.
 */
export function MarkdownPreview({ content, className }: MarkdownPreviewProps) {
  if (!content) return <span className="text-muted-foreground">—</span>

  const html = marked(content) as string

  return (
    <div
      className={[
        "text-sm text-foreground leading-relaxed",
        "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1",
        "[&_p]:mb-3 [&_p:last-child]:mb-0",
        "[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-3",
        "[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-3",
        "[&_li]:mb-1",
        "[&_strong]:font-semibold",
        className ?? "",
      ].join(" ")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
