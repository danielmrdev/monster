"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

export type ProductFormState = {
  errors?: {
    asin?: string[];
    title?: string[];
    slug?: string[];
    category_ids?: string[];
    detailed_description?: string[];
    pros?: string[];
    cons?: string[];
    user_opinions_summary?: string[];
    meta_description?: string[];
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

export async function createProduct(
  siteId: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const asin = (formData.get("asin") as string | null)?.trim().toUpperCase() ?? "";
  const title = (formData.get("title") as string | null)?.trim() || null;
  const slugRaw = (formData.get("slug") as string | null)?.trim() ?? "";
  const slug = slugRaw || (title ? slugify(title) : asin.toLowerCase());
  const current_price_raw = (formData.get("current_price") as string | null)?.trim();
  const current_price = current_price_raw ? parseFloat(current_price_raw) : null;
  const rating_raw = (formData.get("rating") as string | null)?.trim();
  const rating = rating_raw ? parseFloat(rating_raw) : null;
  const review_count_raw = (formData.get("review_count") as string | null)?.trim();
  const review_count = review_count_raw ? parseInt(review_count_raw, 10) : null;
  const is_prime = formData.get("is_prime") === "true";
  const source_image_url = (formData.get("source_image_url") as string | null)?.trim() || null;
  const focus_keyword = (formData.get("focus_keyword") as string | null)?.trim() || null;
  const category_ids = formData.getAll("category_ids") as string[];

  const errors: NonNullable<ProductFormState>["errors"] = {};
  if (!asin) errors.asin = ["ASIN is required"];
  if (Object.keys(errors).length) return { errors };

  const supabase = createServiceClient();

  // Upsert product (ASIN is unique per site)
  const { data: product, error } = await supabase
    .from("tsa_products")
    .insert({
      site_id: siteId,
      asin,
      title,
      slug,
      current_price,
      rating,
      review_count,
      is_prime,
      source_image_url,
      focus_keyword,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return { errors: { asin: ["This ASIN already exists in this site"] } };
    return { errors: { _form: [error.message] } };
  }

  // Link to categories
  if (category_ids.length > 0 && product) {
    const links = category_ids.map((cid, idx) => ({
      category_id: cid,
      product_id: product.id,
      position: idx,
    }));
    await supabase.from("category_products").insert(links);
  }

  revalidatePath(`/sites/${siteId}`);
  return { success: true };
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateProduct(
  siteId: string,
  productId: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const title = (formData.get("title") as string | null)?.trim() || null;
  const slugRaw = (formData.get("slug") as string | null)?.trim() ?? "";
  const slug = slugRaw || (title ? slugify(title) : null);
  const current_price_raw = (formData.get("current_price") as string | null)?.trim();
  const current_price = current_price_raw ? parseFloat(current_price_raw) : null;
  const rating_raw = (formData.get("rating") as string | null)?.trim();
  const rating = rating_raw ? parseFloat(rating_raw) : null;
  const review_count_raw = (formData.get("review_count") as string | null)?.trim();
  const review_count = review_count_raw ? parseInt(review_count_raw, 10) : null;
  const is_prime = formData.get("is_prime") === "true";
  const source_image_url = (formData.get("source_image_url") as string | null)?.trim() || null;
  const focus_keyword = (formData.get("focus_keyword") as string | null)?.trim() || null;
  const category_ids = formData.getAll("category_ids") as string[];

  // Content fields
  const detailed_description =
    (formData.get("detailed_description") as string | null)?.trim() || null;
  const user_opinions_summary =
    (formData.get("user_opinions_summary") as string | null)?.trim() || null;
  const meta_description = (formData.get("meta_description") as string | null)?.trim() || null;

  // Serialize pros/cons: split by newline, filter empty lines → JSONB {pros: string[], cons: string[]}
  const prosRaw = (formData.get("pros") as string | null) ?? "";
  const consRaw = (formData.get("cons") as string | null) ?? "";
  const prosArr = prosRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const consArr = consRaw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const pros_cons = { pros: prosArr, cons: consArr };

  const supabase = createServiceClient();

  const { error } = await supabase
    .from("tsa_products")
    .update({
      title,
      slug,
      current_price,
      rating,
      review_count,
      is_prime,
      source_image_url,
      focus_keyword,
      detailed_description,
      pros_cons,
      user_opinions_summary,
      meta_description,
    })
    .eq("id", productId)
    .eq("site_id", siteId);

  if (error) return { errors: { _form: [error.message] } };

  // Replace category links
  await supabase.from("category_products").delete().eq("product_id", productId);
  if (category_ids.length > 0) {
    const links = category_ids.map((cid, idx) => ({
      category_id: cid,
      product_id: productId,
      position: idx,
    }));
    await supabase.from("category_products").insert(links);
  }

  revalidatePath(`/sites/${siteId}`);
  return { success: true };
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteProduct(siteId: string, productId: string) {
  const supabase = createServiceClient();
  // category_products rows deleted via cascade (FK)
  await supabase.from("tsa_products").delete().eq("id", productId).eq("site_id", siteId);
  revalidatePath(`/sites/${siteId}`);
}
