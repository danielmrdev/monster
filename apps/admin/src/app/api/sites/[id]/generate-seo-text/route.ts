import { type NextRequest } from 'next/server';
import { ClaudeSDKClient } from '@monster/agents';
import { createServiceClient } from '@/lib/supabase/service';

/**
 * POST /api/sites/[id]/generate-seo-text
 *
 * Streams AI-generated SEO text for a category or product.
 * SSE format: `data: {"type":"text","text":"..."}` and `data: {"type":"done"}`.
 *
 * Uses ClaudeSDKClient (claude-agent-sdk) — same auth as Monster Chat (no API key needed).
 *
 * Body:
 *   field: 'category_seo_text' | 'product_description'
 *   contextId: string  (category_id or product_id)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: siteId } = await params;

  let body: { field?: unknown; contextId?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const field = typeof body.field === 'string' ? body.field : null;
  const contextId = typeof body.contextId === 'string' ? body.contextId.trim() : null;

  if (!field || !contextId) {
    return new Response(JSON.stringify({ error: 'field and contextId are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (field !== 'category_seo_text' && field !== 'product_description') {
    return new Response(JSON.stringify({ error: 'field must be category_seo_text or product_description' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createServiceClient();

  // Fetch site for language + niche context
  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('id, name, niche, language')
    .eq('id', siteId)
    .single();

  if (siteErr || !site) {
    return new Response(JSON.stringify({ error: 'Site not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let prompt: string;

  if (field === 'category_seo_text') {
    const { data: cat, error: catErr } = await supabase
      .from('tsa_categories')
      .select('name, focus_keyword, keywords')
      .eq('id', contextId)
      .eq('site_id', siteId)
      .single();

    if (catErr || !cat) {
      return new Response(JSON.stringify({ error: 'Category not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const keywordHint = cat.focus_keyword
      ? `Main keyword: "${cat.focus_keyword}".`
      : cat.keywords && Array.isArray(cat.keywords) && cat.keywords.length > 0
        ? `Related keywords: ${(cat.keywords as string[]).slice(0, 5).join(', ')}.`
        : '';

    prompt = `Write a ~400-word SEO-optimised text for the product category "${cat.name}" on an Amazon affiliate site about "${site.niche}". ${keywordHint} The text should be engaging, informative, and help users understand what to look for when buying. Write in ${site.language}. Output only the SEO text — no headings, no markdown, just flowing paragraphs.`;
  } else {
    // product_description
    const { data: product, error: prodErr } = await supabase
      .from('tsa_products')
      .select('title, current_price, focus_keyword')
      .eq('id', contextId)
      .eq('site_id', siteId)
      .single();

    if (prodErr || !product) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const priceHint = product.current_price ? ` priced at €${product.current_price}` : '';
    const kwHint = product.focus_keyword ? ` Target keyword: "${product.focus_keyword}".` : '';

    prompt = `Write a 150-250 word SEO-optimised product description for "${product.title}"${priceHint} on an Amazon affiliate site about "${site.niche}".${kwHint} Highlight key benefits and help the buyer understand why this product is a good choice. Write in ${site.language}. Output only the description — no headings, no markdown.`;
  }

  // A unique conversation ID for this one-shot generation (not persisted)
  const ephemeralConvId = `seo-gen-${Date.now()}`;

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

        for await (const event of client.streamQuery(prompt, {
          conversationId: ephemeralConvId,
          agentSessionId: null,
        })) {
          send(event);
          if (event.type === 'done' || event.type === 'error') return;
        }

        send({ type: 'done' });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`[generate-seo-text] siteId=${siteId} contextId=${contextId}:`, error);
        send({ type: 'error', error });
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
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
