import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/png", "image/jpeg"];

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sites/[id]/upload-category-image
 *
 * Accepts PNG or JPEG, converts to WebP via sharp (quality 80), writes to
 * public/uploads/sites/[siteId]/categories/[catId].webp.
 *
 * Body (multipart/form-data):
 *   file   — PNG or JPEG image, ≤5MB
 *   catId  — category UUID (required)
 *
 * Returns:
 *   200  { imageUrl: '/uploads/sites/[siteId]/categories/[catId].webp' }
 *   400  { error: '...' }  — missing file, missing catId, invalid type/size
 *   413  { error: '...' }  — file too large
 *   415  { error: '...' }  — unsupported file type
 *   500  { error: '...', detail: '...' }  — sharp or fs failure
 *
 * Diagnostics: logs [upload-category-image] siteId=… catId=… error: … on 500.
 */
export async function POST(req: Request, { params }: Params) {
  const { id: siteId } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid multipart request" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const catId = (formData.get("catId") as string | null)?.trim();
  if (!catId) {
    return Response.json({ error: "catId is required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return Response.json({ error: "Invalid file type. PNG or JPEG required." }, { status: 415 });
  }

  if (file.size > MAX_SIZE) {
    return Response.json({ error: "File too large. Maximum 5MB." }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const webpBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer();

    const dir = path.join(process.cwd(), "public", "uploads", "sites", siteId, "categories");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${catId}.webp`), webpBuffer);

    return Response.json({
      imageUrl: `/uploads/sites/${siteId}/categories/${catId}.webp`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[upload-category-image] siteId=${siteId} catId=${catId} error: ${message}`);
    return Response.json({ error: "Upload failed", detail: message }, { status: 500 });
  }
}
