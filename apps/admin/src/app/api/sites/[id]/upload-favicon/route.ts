import AdmZip from "adm-zip";
import * as fs from "fs";
import * as path from "path";

const MAX_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = [
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
];

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/sites/[id]/upload-favicon
 *
 * Accepts a favicon.io ZIP, extracts flat entries (no subdirectories) to
 * public/uploads/sites/[id]/favicon/. Guards against path traversal.
 * Returns { faviconDir }.
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

  // Accept zip MIME types. Browsers sometimes report application/octet-stream for .zip files.
  // Also accept based on filename extension as a fallback.
  const isZipType = ALLOWED_TYPES.includes(file.type);
  const isZipName = file.name?.toLowerCase().endsWith(".zip");
  if (!isZipType && !isZipName) {
    return Response.json({ error: "Invalid file type. ZIP archive required." }, { status: 415 });
  }

  if (file.size > MAX_SIZE) {
    return Response.json({ error: "File too large. Maximum 2MB." }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    const outDir = path.join(process.cwd(), "public", "uploads", "sites", siteId, "favicon");
    fs.mkdirSync(outDir, { recursive: true });

    let written = 0;
    for (const entry of entries) {
      // Skip directories
      if (entry.isDirectory) continue;

      const name = entry.entryName;

      // Path traversal guard: reject entries containing path separators or parent references
      if (name.includes("/") || name.includes("\\") || name.includes("..")) {
        console.warn(`[upload-favicon] siteId=${siteId} skipping unsafe entry: ${name}`);
        continue;
      }

      fs.writeFileSync(path.join(outDir, name), entry.getData());
      written++;
    }

    if (written === 0) {
      return Response.json({ error: "ZIP archive contained no valid files." }, { status: 400 });
    }

    return Response.json({ faviconDir: `/uploads/sites/${siteId}/favicon` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[upload-favicon] siteId=${siteId} error: ${message}`);
    return Response.json({ error: "Upload failed", detail: message }, { status: 500 });
  }
}
