import { type NextRequest } from "next/server";
import { ClaudeSDKClient } from "@monster/agents";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * POST /api/sites/[id]/generate-seo-text
 *
 * Streams AI-generated SEO text for a category or product.
 *
 * For category_seo_text / product_description:
 *   SSE format: `data: {"type":"text","text":"..."}` then `data: {"type":"done"}`.
 *
 * For product_all_content:
 *   SSE format: `data: {"type":"field","name":"<field>","text":"..."}` per field,
 *   then `data: {"type":"done"}`. Populates all five content textareas in one call.
 *
 * Uses ClaudeSDKClient (claude-agent-sdk) — same auth as Monster Chat (no API key needed).
 *
 * Body:
 *   field: 'category_seo_text' | 'product_description' | 'product_all_content'
 *   contextId: string  (category_id or product_id)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: siteId } = await params;

  let body: { field?: unknown; contextId?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const field = typeof body.field === "string" ? body.field : null;
  const contextId = typeof body.contextId === "string" ? body.contextId.trim() : null;

  if (!field || !contextId) {
    return new Response(JSON.stringify({ error: "field and contextId are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (
    field !== "category_seo_text" &&
    field !== "product_description" &&
    field !== "product_all_content" &&
    field !== "homepage_seo_text" &&
    field !== "homepage_all_content"
  ) {
    return new Response(JSON.stringify({ error: "Invalid field value" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createServiceClient();

  // Fetch site for language + niche context
  const { data: site, error: siteErr } = await supabase
    .from("sites")
    .select("id, name, niche, language, focus_keyword")
    .eq("id", siteId)
    .single();

  if (siteErr || !site) {
    return new Response(JSON.stringify({ error: "Site not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let prompt: string;

  if (field === "homepage_seo_text") {
    const focusKw = site.focus_keyword ? ` Focus keyword: "${site.focus_keyword}".` : "";
    prompt = `Write a ~400-word SEO-optimised homepage text for an Amazon affiliate site named "${site.name}" about "${site.niche}".${focusKw} Write in ${site.language}. Output only flowing paragraphs, no headings.`;
  } else if (field === "homepage_all_content") {
    const focusKw = site.focus_keyword ? ` Focus keyword: "${site.focus_keyword}".` : "";
    prompt = `You are an SEO copywriter. Generate homepage content for an Amazon affiliate site named "${site.name}" about "${site.niche}".${focusKw} Language: ${site.language}.

Return ONLY a JSON object with exactly these keys (no markdown, no code fences, raw JSON only):
{
  "seo_text": "350-450 word SEO text for the bottom of the homepage. Flowing paragraphs, no headings. Naturally incorporate the focus keyword 3-5 times.",
  "meta_description": "Meta description under 155 characters, compelling and keyword-rich.",
  "intro": "1-2 sentence intro shown below the H1 and above the category grid. ~150-200 characters. Engaging and keyword-rich."
}`;
  } else if (field === "category_seo_text") {
    const { data: cat, error: catErr } = await supabase
      .from("tsa_categories")
      .select("name, focus_keyword, keywords")
      .eq("id", contextId)
      .eq("site_id", siteId)
      .single();

    if (catErr || !cat) {
      return new Response(JSON.stringify({ error: "Category not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const keywordHint = cat.focus_keyword
      ? `Main keyword: "${cat.focus_keyword}".`
      : cat.keywords && Array.isArray(cat.keywords) && cat.keywords.length > 0
        ? `Related keywords: ${(cat.keywords as string[]).slice(0, 5).join(", ")}.`
        : "";

    prompt = `Write a ~400-word SEO-optimised text for the product category "${cat.name}" on an Amazon affiliate site about "${site.niche}". ${keywordHint} The text should be engaging, informative, and help users understand what to look for when buying. Write in ${site.language}. Output only the SEO text — no headings, no markdown, just flowing paragraphs.`;
  } else if (field === "product_description") {
    // product_description (legacy single-field)
    const { data: product, error: prodErr } = await supabase
      .from("tsa_products")
      .select("title, current_price, focus_keyword")
      .eq("id", contextId)
      .eq("site_id", siteId)
      .single();

    if (prodErr || !product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const priceHint = product.current_price ? ` priced at €${product.current_price}` : "";
    const kwHint = product.focus_keyword ? ` Target keyword: "${product.focus_keyword}".` : "";

    prompt = `Write a 150-250 word SEO-optimised product description for "${product.title}"${priceHint} on an Amazon affiliate site about "${site.niche}".${kwHint} Highlight key benefits and help the buyer understand why this product is a good choice. Write in ${site.language}. Output only the description — no headings, no markdown.`;
  } else {
    // product_all_content — generate all five content fields in one call
    const { data: product, error: prodErr } = await supabase
      .from("tsa_products")
      .select("title, current_price, focus_keyword")
      .eq("id", contextId)
      .eq("site_id", siteId)
      .single();

    if (prodErr || !product) {
      return new Response(JSON.stringify({ error: "Product not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const priceHint = product.current_price ? ` priced at €${product.current_price}` : "";
    const kwHint = product.focus_keyword ? ` Main keyword: "${product.focus_keyword}".` : "";

    prompt = `You are an SEO copywriter for an Amazon affiliate site about "${site.niche}". Generate content for the product "${product.title}"${priceHint}.${kwHint} Language: ${site.language}.

Return ONLY a JSON object with exactly these five keys (no markdown, no code fences, raw JSON only):
{
  "detailed_description": "300-400 word SEO-optimised description with keyword usage. Flowing paragraphs, no headings.",
  "pros": "4-6 pros, one per line, no bullet characters",
  "cons": "2-4 cons, one per line, no bullet characters",
  "user_opinions_summary": "2-3 sentence summary of what typical buyers appreciate and criticise about this type of product",
  "meta_description": "150-160 character meta description for search engine snippets"
}`;
  }

  // A unique conversation ID for this one-shot generation (not persisted)
  const ephemeralConvId = `seo-gen-${Date.now()}`;

  console.log(`[generate-seo-text] siteId=${siteId} contextId=${contextId} field=${field}`);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;

      const send = (event: object) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        const client = new ClaudeSDKClient();

        if (field === "product_all_content" || field === "homepage_all_content") {
          // Collect all text chunks, then parse JSON and emit per-field events
          let fullText = "";
          for await (const event of client.streamQuery(prompt, {
            conversationId: ephemeralConvId,
            agentSessionId: null,
          })) {
            if (event.type === "text") {
              fullText += event.text;
            } else if (event.type === "error") {
              send(event);
              return;
            }
            // ignore 'done' — we parse after
          }

          // Strip markdown code fences if Claude wrapped the JSON
          const jsonText = fullText
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```\s*$/, "")
            .trim();

          let parsed: Record<string, string>;
          try {
            parsed = JSON.parse(jsonText);
          } catch {
            console.error(
              `[generate-seo-text] JSON parse failed siteId=${siteId}:`,
              jsonText.slice(0, 200),
            );
            send({
              type: "error",
              error: "AI returned invalid JSON — please retry",
            });
            return;
          }

          const fieldNames =
            field === "homepage_all_content"
              ? (["seo_text", "meta_description", "intro"] as const)
              : ([
                  "detailed_description",
                  "pros",
                  "cons",
                  "user_opinions_summary",
                  "meta_description",
                ] as const);
          for (const name of fieldNames) {
            if (typeof parsed[name] === "string") {
              send({ type: "field", name, text: parsed[name] });
            }
          }
          send({ type: "done" });
        } else {
          // category_seo_text / product_description — stream text chunks directly
          for await (const event of client.streamQuery(prompt, {
            conversationId: ephemeralConvId,
            agentSessionId: null,
          })) {
            send(event);
            if (event.type === "done" || event.type === "error") return;
          }

          send({ type: "done" });
        }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`[generate-seo-text] siteId=${siteId} contextId=${contextId}:`, error);
        send({ type: "error", error });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
