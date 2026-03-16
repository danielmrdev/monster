import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

// Generator root is two levels up from admin: monorepo/apps/generator
const GENERATOR_ROOT = join(process.cwd(), '..', 'generator');

function slugify(domain: string): string {
  return domain.replace(/\./g, '-');
}

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    css:  'text/css; charset=utf-8',
    js:   'application/javascript; charset=utf-8',
    mjs:  'application/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg:  'image/svg+xml',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif:  'image/gif',
    ico:  'image/x-icon',
    woff: 'font/woff',
    woff2:'font/woff2',
    ttf:  'font/ttf',
    txt:  'text/plain; charset=utf-8',
    xml:  'application/xml',
    map:  'application/json',
  };
  return map[ext] ?? 'application/octet-stream';
}

/**
 * Rewrite absolute paths in HTML so they route through the preview proxy.
 *
 * Astro generates absolute paths like /_astro/main.css, /categories/foo/,
 * /products/bar/ etc. The <base> tag only affects relative URLs, so we must
 * rewrite absolute ones explicitly.
 *
 * Strategy: replace href="/" and src="/" occurrences where the path starts
 * with "/" (but not "//", which would be protocol-relative) with the proxy prefix.
 */
function rewriteHtml(html: string, proxyBase: string): string {
  // Rewrite href="/..." and src="/..." attributes (not href="//..." or href="http...")
  return html
    .replace(/(href|src|action)="(\/(?!\/)[^"]*)"/g, (_, attr, path) => {
      // Don't rewrite anchor-only links
      if (path.startsWith('/#') || path === '/') {
        return `${attr}="${proxyBase}"`;
      }
      return `${attr}="${proxyBase}${path.replace(/^\//, '')}"`;
    });
}

interface RouteParams {
  params: Promise<{ siteId: string; path: string[] }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { siteId, path: pathSegments } = await params;

  // ── 1. Resolve site slug from DB ─────────────────────────────────────────
  const supabase = createServiceClient();
  const { data: site, error } = await supabase
    .from('sites')
    .select('id, domain, name')
    .eq('id', siteId)
    .single();

  if (error || !site) {
    return new NextResponse('Site not found', { status: 404 });
  }

  if (!site.domain) {
    return new NextResponse(
      '<html><body style="font-family:sans-serif;padding:2rem"><h2>No domain set</h2><p>Set a domain for this site before previewing.</p></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const slug = slugify(site.domain);
  const distDir = join(GENERATOR_ROOT, '.generated-sites', slug, 'dist');

  if (!existsSync(distDir)) {
    return new NextResponse(
      '<html><body style="font-family:sans-serif;padding:2rem"><h2>Site not generated yet</h2><p>Run <strong>Generate Site</strong> first to build the static files.</p></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  // ── 2. Resolve file path ──────────────────────────────────────────────────
  // pathSegments: e.g. [] → index.html, ['_astro','main.css'] → _astro/main.css
  let relativePath = pathSegments.join('/');

  // Try exact path first, then with /index.html appended for directory-style routes
  const candidates = [
    join(distDir, relativePath),
    join(distDir, relativePath, 'index.html'),
    join(distDir, 'index.html'), // fallback root
  ].filter(Boolean);

  let resolvedPath: string | null = null;
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      resolvedPath = candidate;
      break;
    }
  }

  if (!resolvedPath) {
    return new NextResponse('Not found', { status: 404 });
  }

  // ── 3. Read and serve ─────────────────────────────────────────────────────
  const content = await readFile(resolvedPath);
  const mimeType = getMimeType(resolvedPath);
  const isHtml = mimeType.startsWith('text/html');

  const headers = new Headers({ 'Content-Type': mimeType });
  // Allow iframe embedding from same origin (admin panel)
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  // Cache static assets, not HTML
  if (!isHtml) {
    headers.set('Cache-Control', 'public, max-age=3600, immutable');
  }

  if (isHtml) {
    const proxyBase = `/api/preview/${siteId}/`;
    const rewritten = rewriteHtml(content.toString('utf-8'), proxyBase);
    return new NextResponse(rewritten, { headers });
  }

  return new NextResponse(content, { headers });
}
