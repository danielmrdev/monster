import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import sharp from "sharp";
import pLimit from "p-limit";

// ---------------------------------------------------------------------------
// downloadAndConvertImage
//
// Downloads a remote image and converts it to WebP (quality 80) at `destPath`.
// Returns true on success or if the file already exists (idempotent).
// Returns false on any fetch or conversion error — never throws.
//
// Observability: logs [ImagePipeline] prefixed lines per file.
// ---------------------------------------------------------------------------

export async function downloadAndConvertImage(
  imageUrl: string,
  destPath: string,
): Promise<boolean> {
  // Idempotency: skip if already downloaded
  if (existsSync(destPath)) {
    console.log(`[ImagePipeline] skipped (exists): ${basename(destPath)}`);
    return true;
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) {
      console.log(`[ImagePipeline] fetch failed (${response.status}): ${imageUrl}`);
      return false;
    }

    if (!response.body) {
      console.log(`[ImagePipeline] fetch failed (no body): ${imageUrl}`);
      return false;
    }

    const { Readable } = await import("node:stream");
    const readable = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);

    await new Promise<void>((resolve, reject) => {
      const transformer = sharp().webp({ quality: 80 });
      transformer.toFile(destPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
      readable.pipe(transformer);
      readable.on("error", reject);
    });

    console.log(`[ImagePipeline] downloaded: ${basename(destPath)}`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[ImagePipeline] conversion failed: ${message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// processImages
//
// Downloads and converts images for a list of products, with max 5 concurrent
// Sharp operations (p-limit). Returns a Map from ASIN to local WebP path array.
// Failed downloads produce an empty array for that ASIN — non-fatal.
//
// Observability:
//   - [ImagePipeline] downloaded/skipped/failed per file
//   - Returned map: empty [] for failed ASINs, ['/images/products/<asin>-0.webp'] for success
// ---------------------------------------------------------------------------

export async function processImages(
  products: Array<{ asin: string; imageUrl: string | null }>,
  publicDir: string,
): Promise<Map<string, string[]>> {
  const imagesDir = join(publicDir, "images", "products");
  mkdirSync(imagesDir, { recursive: true });

  const limit = pLimit(5);
  const results = new Map<string, string[]>();

  const tasks = products
    .filter((p) => p.imageUrl !== null)
    .map((p) => {
      const destPath = join(imagesDir, `${p.asin}-0.webp`);
      const localPath = `/images/products/${p.asin}-0.webp`;
      return limit(async () => {
        const ok = await downloadAndConvertImage(p.imageUrl as string, destPath);
        results.set(p.asin, ok ? [localPath] : []);
      });
    });

  // Products with null imageUrl get empty array
  for (const p of products) {
    if (p.imageUrl === null) {
      results.set(p.asin, []);
    }
  }

  await Promise.all(tasks);
  return results;
}
