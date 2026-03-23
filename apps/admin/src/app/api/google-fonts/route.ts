import { NextResponse } from "next/server";

interface GoogleFontItem {
  family: string;
  category: string;
}

type FontCategory = "sans-serif" | "serif" | "display" | "monospace" | "handwriting";

let cachedFonts: GoogleFontItem[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

const CATEGORY_MAP: Record<string, FontCategory> = {
  "sans-serif": "sans-serif",
  serif: "serif",
  display: "display",
  monospace: "monospace",
  handwriting: "display",
};

async function fetchGoogleFonts(): Promise<GoogleFontItem[]> {
  if (cachedFonts && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedFonts;
  }

  const res = await fetch("https://fonts.google.com/metadata/fonts", {
    next: { revalidate: 86400 },
  });

  if (!res.ok) {
    throw new Error(`Google Fonts metadata fetch failed: ${res.status}`);
  }

  const text = await res.text();
  // Google metadata has a ")]}'" prefix that must be stripped
  const json = JSON.parse(text.replace(/^\)\]\}'[\s]*\n/, ""));

  const fonts: GoogleFontItem[] = json.familyMetadataList.map(
    (f: { family: string; category: string }) => ({
      family: f.family,
      category: CATEGORY_MAP[f.category] ?? "sans-serif",
    }),
  );

  cachedFonts = fonts;
  cacheTimestamp = Date.now();
  return fonts;
}

export async function GET() {
  try {
    const fonts = await fetchGoogleFonts();
    return NextResponse.json(fonts, {
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    });
  } catch {
    // Fallback: return empty array, component will use its built-in fallback list
    return NextResponse.json([], { status: 502 });
  }
}
