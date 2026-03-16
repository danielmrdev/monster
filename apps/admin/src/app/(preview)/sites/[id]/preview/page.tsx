'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { use } from 'react';

interface PreviewPageProps {
  params: Promise<{ id: string }>;
}

export default function SitePreviewPage({ params }: PreviewPageProps) {
  const { id } = use(params);
  const [currentPath, setCurrentPath] = useState('/');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // No trailing slash — Next.js 308-redirects trailing slashes away, causing load failures
  const iframeSrc = `/api/preview/${id}`;

  function handleLoad() {
    try {
      const iframeUrl = iframeRef.current?.contentWindow?.location?.pathname ?? '/';
      const sitePath = iframeUrl.replace(`/api/preview/${id}`, '') || '/';
      setCurrentPath(sitePath || '/');
    } catch {
      // Same-origin but be safe
    }
  }

  function openInTab() {
    window.open(iframeSrc, '_blank');
  }

  function reload() {
    if (iframeRef.current) {
      // Force reload by resetting src
      const src = iframeRef.current.src;
      iframeRef.current.src = '';
      iframeRef.current.src = src;
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0">
        <Link
          href={`/sites/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
        >
          ← Site
        </Link>

        <div className="flex items-center gap-1.5 flex-1 min-w-0 rounded-md border border-border bg-muted/40 px-3 py-1.5">
          <span className="text-xs text-muted-foreground font-mono shrink-0">preview</span>
          {currentPath !== '/' && (
            <>
              <span className="text-xs text-muted-foreground shrink-0">/</span>
              <span className="text-xs font-mono text-foreground truncate">{currentPath.replace(/^\//, '')}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={reload}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Reload"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M8 16H3v5"/>
            </svg>
          </button>
          <button
            onClick={openInTab}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Open in new tab"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          </button>
        </div>
      </div>

      {/* iframe — fills remaining height */}
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        onLoad={handleLoad}
        className="flex-1 w-full border-0 bg-white"
        title="Site Preview"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </>
  );
}
