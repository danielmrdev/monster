"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

export type CategoryFormState = {
  errors?: {
    name?: string[];
    slug?: string[];
    description?: string[];
    meta_description?: string[];
    seo_text?: string[];
    focus_keyword?: string[];
    keywords?: string[];
    _form?: string[];
  };
  success?: boolean;
} | null;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createCategory(
  siteId: string,
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const slugRaw = (formData.get("slug") as string | null)?.trim() ?? "";
  const slug = slugRaw || slugify(name);
  const description = (formData.get("description") as string | null)?.trim() || null;
  const seo_text = (formData.get("seo_text") as string | null)?.trim() || null;
  const focus_keyword = (formData.get("focus_keyword") as string | null)?.trim() || null;
  const keywordsRaw = (formData.get("keywords") as string | null)?.trim() || "";
  const keywords = keywordsRaw
    ? keywordsRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : null;

  const errors: NonNullable<CategoryFormState>["errors"] = {};
  if (!name) errors.name = ["Name is required"];
  if (!slug) errors.slug = ["Slug is required"];
  if (Object.keys(errors).length) return { errors };

  const supabase = createServiceClient();
  const { error } = await supabase.from("tsa_categories").insert({
    site_id: siteId,
    name,
    slug,
    description,
    seo_text,
    focus_keyword,
    keywords,
  });

  if (error) {
    if (error.code === "23505") return { errors: { slug: ["Slug already exists for this site"] } };
    return { errors: { _form: [error.message] } };
  }

  revalidatePath(`/sites/${siteId}`);
  return { success: true };
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateCategory(
  siteId: string,
  categoryId: string,
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const slugRaw = (formData.get("slug") as string | null)?.trim() ?? "";
  const slug = slugRaw || slugify(name);
  const description = (formData.get("description") as string | null)?.trim() || null;
  const meta_description = (formData.get("meta_description") as string | null)?.trim() || null;
  const seo_text = (formData.get("seo_text") as string | null)?.trim() || null;
  const focus_keyword = (formData.get("focus_keyword") as string | null)?.trim() || null;
  const keywordsRaw = (formData.get("keywords") as string | null)?.trim() || "";
  const keywords = keywordsRaw
    ? keywordsRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : null;

  const errors: NonNullable<CategoryFormState>["errors"] = {};
  if (!name) errors.name = ["Name is required"];
  if (!slug) errors.slug = ["Slug is required"];
  if (Object.keys(errors).length) return { errors };

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("tsa_categories")
    .update({
      name,
      slug,
      // meta_description (D057) maps to the `description` column; prefer it over the legacy description field
      description: meta_description ?? description,
      seo_text,
      focus_keyword,
      keywords,
    })
    .eq("id", categoryId)
    .eq("site_id", siteId);

  if (error) {
    if (error.code === "23505") return { errors: { slug: ["Slug already exists for this site"] } };
    return { errors: { _form: [error.message] } };
  }

  revalidatePath(`/sites/${siteId}`);
  return { success: true };
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteCategory(siteId: string, categoryId: string) {
  const supabase = createServiceClient();
  await supabase.from("tsa_categories").delete().eq("id", categoryId).eq("site_id", siteId);
  revalidatePath(`/sites/${siteId}`);
}

// ── Product Reorder ───────────────────────────────────────────────────────────

/**
 * Swap the `position` value of a product in `category_products` with its
 * adjacent neighbour (up = lower index, down = higher index).
 *
 * Algorithm:
 *   1. Fetch all rows for `catId` ordered by position ASC
 *   2. If all positions are identical → normalize to 0, 1, 2…
 *   3. Find the target product row, compute adjacent index
 *   4. If out of bounds → noop return {}
 *   5. Swap the two position values and update both rows
 *   6. revalidatePath for the category detail page
 *
 * Diagnostics: all error paths emit [reorderProduct] prefix for pm2 grep-ability.
 * Returns { error: string } on Supabase failure so the caller can surface it.
 */
export async function reorderProduct(
  siteId: string,
  catId: string,
  productId: string,
  direction: "up" | "down",
): Promise<{ error?: string }> {
  const supabase = createServiceClient();

  // 1. Fetch all rows ordered by position
  const { data: rows, error: fetchErr } = await supabase
    .from("category_products")
    .select("product_id, position")
    .eq("category_id", catId)
    .order("position", { ascending: true });

  if (fetchErr) {
    console.error("[reorderProduct] fetch error:", fetchErr.message, { siteId, catId, productId });
    return { error: fetchErr.message };
  }
  if (!rows || rows.length === 0) return {};

  // 2. Normalize if all positions are identical (initial DEFAULT 0 state)
  const allSame = rows.every((r) => r.position === rows[0].position);
  if (allSame) {
    for (let i = 0; i < rows.length; i++) {
      const { error: normErr } = await supabase
        .from("category_products")
        .update({ position: i })
        .eq("category_id", catId)
        .eq("product_id", rows[i].product_id);
      if (normErr) {
        console.error("[reorderProduct] normalize error:", normErr.message, {
          siteId,
          catId,
          productId: rows[i].product_id,
        });
        return { error: normErr.message };
      }
      rows[i].position = i;
    }
  }

  // 3. Find the target row
  const idx = rows.findIndex((r) => r.product_id === productId);
  if (idx === -1) return {};

  const targetIdx = direction === "up" ? idx - 1 : idx + 1;

  // 4. Out of bounds → noop
  if (targetIdx < 0 || targetIdx >= rows.length) return {};

  const posA = rows[idx].position;
  const posB = rows[targetIdx].position;

  // 5. Swap positions
  const { error: errA } = await supabase
    .from("category_products")
    .update({ position: posB })
    .eq("category_id", catId)
    .eq("product_id", productId);
  if (errA) {
    console.error("[reorderProduct] swap A error:", errA.message, { siteId, catId, productId });
    return { error: errA.message };
  }

  const { error: errB } = await supabase
    .from("category_products")
    .update({ position: posA })
    .eq("category_id", catId)
    .eq("product_id", rows[targetIdx].product_id);
  if (errB) {
    console.error("[reorderProduct] swap B error:", errB.message, {
      siteId,
      catId,
      productId: rows[targetIdx].product_id,
    });
    return { error: errB.message };
  }

  // 6. Revalidate the category detail page
  revalidatePath(`/sites/${siteId}/categories/${catId}`, "page");
  return {};
}

// ── Category Image ────────────────────────────────────────────────────────────

/**
 * Update the custom image URL for a category.
 *
 * Pass imageUrl = null to clear the custom image (resets to product-derived image).
 * On success, revalidates the category detail and edit pages.
 *
 * Diagnostics: returns { error: message } on DB failure — caller should surface
 * this to the user. Supabase error codes are forwarded verbatim for inspection.
 */
export async function saveCategoryImage(
  siteId: string,
  categoryId: string,
  imageUrl: string | null,
): Promise<{ error?: string }> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("tsa_categories")
    .update({ category_image: imageUrl })
    .eq("id", categoryId)
    .eq("site_id", siteId);
  if (error) return { error: error.message };
  revalidatePath(`/sites/${siteId}/categories/${categoryId}`);
  revalidatePath(`/sites/${siteId}/categories/${categoryId}/edit`);
  return {};
}
