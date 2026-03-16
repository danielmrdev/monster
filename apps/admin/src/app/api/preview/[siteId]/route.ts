import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const GENERATOR_ROOT = join(process.cwd(), '..', 'generator');

function slugify(domain: string): string {
  return domain.replace(/\./g, '-');
}

function rewriteHtml(html: string, proxyBase: string): string {
  return html.replace(/(href|src|action)="(\/(?!\/)[^"]*)"/g, (_, attr, path) => {
    if (path === '/') return `${attr}="${proxyBase}"`;
    return `${attr}="${proxyBase}${path.replace(/^\//, '')}"`;
  });
}

interface RouteParams {
  params: Promise<{ siteId: string }>;
}

/**
 * Serve the site index.html for /api/preview/{siteId} (no trailing slash).
 * Next.js strips trailing slashes before routing, so the [...path] catch-all
 * can't handle the root — this route handles it directly.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { siteId } = await params;

  const supabase = createServiceClient();
  const { data: site, error } = await supabase
    .from('sites')
    .select('id, domain')
    .eq('id', siteId)
    .single();

  if (error || !site) {
    return new NextResponse('Site not found', { status: 404 });
  }

  if (!site.domain) {
    return new NextResponse(
      '<html><body style="font-family:sans-serif;padding:2rem"><h2>No domain set</h2></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const slug = slugify(site.domain);
  const indexPath = join(GENERATOR_ROOT, '.generated-sites', slug, 'dist', 'index.html');

  if (!existsSync(indexPath)) {
    return new NextResponse(
      '<html><body style="font-family:sans-serif;padding:2rem"><h2>Site not generated yet</h2><p>Run <strong>Generate Site</strong> first.</p></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const html = await readFile(indexPath, 'utf-8');
  const proxyBase = `/api/preview/${siteId}/`;
  const rewritten = rewriteHtml(html, proxyBase);

  return new NextResponse(rewritten, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
}
