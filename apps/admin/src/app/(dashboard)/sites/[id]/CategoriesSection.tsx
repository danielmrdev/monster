"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { DeleteCategoryButton } from "./categories/DeleteCategoryButton";
import { reorderCategory } from "./actions";

interface Category {
  id: string;
  name: string;
  slug: string;
  focus_keyword: string | null;
  keywords: string[] | null;
  seo_text: string | null;
  description: string | null;
  productCount: number;
  sort_order: number;
}

interface Props {
  siteId: string;
  categories: Category[];
}

export function CategoriesSection({ siteId, categories }: Props) {
  const [items, setItems] = useState<Category[]>(categories);
  const [reorderError, setReorderError] = useState<string | null>(null);

  // Sync local state when server revalidation delivers new props
  useEffect(() => {
    setItems(categories);
  }, [categories]);

  const handleReorder = useCallback(
    async (categoryId: string, direction: "up" | "down") => {
      setReorderError(null);

      // Optimistic update
      setItems((prev) => {
        const idx = prev.findIndex((c) => c.id === categoryId);
        if (idx === -1) return prev;
        const targetIdx = direction === "up" ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= prev.length) return prev;

        const next = [...prev];
        // Swap positions
        const temp = next[idx];
        next[idx] = next[targetIdx];
        next[targetIdx] = temp;
        return next;
      });

      const result = await reorderCategory(siteId, categoryId, direction);
      if (result?.error) {
        setReorderError(result.error);
        // Revert optimistic update on error
        setItems(categories);
      }
    },
    [siteId, categories],
  );

  return (
    <div id="categories" className="rounded-xl border border-border bg-card px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Categories
          {items.length > 0 && (
            <span className="ml-2 font-normal normal-case text-foreground/60">{items.length}</span>
          )}
        </h2>
        <Link
          href={`/sites/${siteId}/categories/new`}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <span className="text-base leading-none">+</span> Add Category
        </Link>
      </div>

      {reorderError && (
        <p className="mb-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400 ring-1 ring-red-500/20">
          Reorder failed: {reorderError}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No categories yet.{" "}
          <Link
            href={`/sites/${siteId}/categories/new`}
            className="text-foreground underline underline-offset-2 hover:no-underline"
          >
            Add your first category
          </Link>{" "}
          to organize products.
        </p>
      ) : (
        <div className="divide-y divide-border -mx-6">
          {items.map((cat, index) => (
            <Link
              key={cat.id}
              href={`/sites/${siteId}/categories/${cat.id}`}
              className="px-6 py-3 flex items-start justify-between gap-4 hover:bg-muted/10 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{cat.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">/{cat.slug}</span>
                  {cat.focus_keyword && (
                    <span className="inline-flex items-center rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-400 ring-1 ring-violet-500/30">
                      {cat.focus_keyword}
                    </span>
                  )}
                  <span className="inline-flex items-center rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400 ring-1 ring-blue-500/30">
                    {cat.productCount} products
                  </span>
                </div>
                {cat.description ? (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {cat.description}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/40 mt-1 italic">No description</p>
                )}
              </div>
              <div
                className="flex items-center gap-3 shrink-0"
                onClick={(e) => e.preventDefault()}
              >
                {/* Reorder buttons */}
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="Move category up"
                    disabled={index === 0}
                    className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleReorder(cat.id, "up");
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="Move category down"
                    disabled={index === items.length - 1}
                    className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleReorder(cat.id, "down");
                    }}
                  >
                    ↓
                  </button>
                </div>
                <Link
                  href={`/sites/${siteId}/categories/${cat.id}/edit`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Edit
                </Link>
                <DeleteCategoryButton
                  siteId={siteId}
                  categoryId={cat.id}
                  categoryName={cat.name}
                />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
