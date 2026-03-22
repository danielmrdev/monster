'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { saveCategoryImage } from '../actions';

interface Product {
  id: string;
  asin: string;
  title: string | null;
  images: string[] | null;
  source_image_url: string | null;
}

interface Props {
  siteId: string;
  categoryId: string;
  currentImage: string | null;
  products: Product[];
}

export function CategoryImagePicker({ siteId, categoryId, currentImage, products }: Props) {
  const [selected, setSelected] = useState<string | null>(currentImage);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function save(url: string | null) {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await saveCategoryImage(siteId, categoryId, url);
      if (result.error) {
        setErrorMsg(result.error);
      } else {
        setSelected(url);
      }
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    const form = new FormData();
    form.append('file', file);
    form.append('catId', categoryId);
    try {
      const res = await fetch(`/api/sites/${siteId}/upload-category-image`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json() as { imageUrl?: string; error?: string; detail?: string };
      if (!res.ok || data.error) {
        setErrorMsg(data.error ?? 'Upload failed');
        return;
      }
      if (data.imageUrl) save(data.imageUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    }
    // Reset file input so the same file can be re-uploaded after a clear
    e.target.value = '';
  }

  return (
    <div className="rounded-xl border border-border bg-card px-6 py-5 space-y-4">
      <h2 className="text-sm font-semibold">Category Image</h2>

      {/* Error display */}
      {errorMsg && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {errorMsg}
        </p>
      )}

      {/* Current image preview */}
      {selected && (
        <div className="flex items-start gap-3">
          <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-muted border border-border shrink-0">
            <Image src={selected} alt="Category image" fill className="object-cover" unoptimized />
          </div>
          <button
            type="button"
            onClick={() => save(null)}
            disabled={isPending}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors mt-1 disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}

      {/* Product image grid */}
      {products.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Choose from products</p>
          <div className="grid grid-cols-6 gap-2">
            {products.map((p) => {
              const img = p.images?.[0] ?? p.source_image_url ?? null;
              if (!img) return null;
              const isActive = selected === img;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => save(img)}
                  disabled={isPending}
                  className={`relative aspect-square rounded-lg overflow-hidden bg-muted border-2 transition-colors disabled:opacity-50 ${isActive ? 'border-primary' : 'border-transparent hover:border-border'}`}
                  title={p.title ?? undefined}
                >
                  <Image src={img} alt={p.title ?? p.asin} fill className="object-cover" unoptimized />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom upload */}
      <div>
        <p className="text-xs text-muted-foreground mb-2">Or upload a custom image (PNG/JPEG, max 5MB)</p>
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={handleUpload}
          disabled={isPending}
          className="text-xs disabled:opacity-50"
        />
      </div>

      {isPending && <p className="text-xs text-muted-foreground">Saving…</p>}
    </div>
  );
}
