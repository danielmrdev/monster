"use client";

import Link from "next/link";
import { DeleteCategoryButton } from "./categories/DeleteCategoryButton";

interface Category {
  id: string;
  name: string;
  slug: string;
  focus_keyword: string | null;
  keywords: string[] | null;
  seo_text: string | null;
  description: string | null;
  productCount: number;
}

interface Props {
  siteId: string;
  categories: Category[];
}

export function CategoriesSection({ siteId, categories }: Props) {
  return (
    <div id="categories" className="rounded-xl border border-border bg-card px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Categories
          {categories.length > 0 && (
            <span className="ml-2 font-normal normal-case text-foreground/60">
              {categories.length}
            </span>
          )}
        </h2>
        <Link
          href={`/sites/${siteId}/categories/new`}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <span className="text-base leading-none">+</span> Add Category
        </Link>
      </div>

      {categories.length === 0 ? (
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
          {categories.map((cat) => (
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
              <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.preventDefault()}>
                <Link
                  href={`/sites/${siteId}/categories/${cat.id}/edit`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  Edit
                </Link>
                <DeleteCategoryButton siteId={siteId} categoryId={cat.id} categoryName={cat.name} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
