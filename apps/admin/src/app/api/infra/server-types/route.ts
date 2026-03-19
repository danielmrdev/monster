import { NextResponse } from "next/server";
import { HetznerClient } from "@monster/deployment";

const ALLOWED_TYPES = ["cx22", "cx32"];
const FALLBACK_SERVER_TYPES = ["cx22", "cx32"];

export async function GET() {
  try {
    const client = new HetznerClient();
    const all = await client.listServerTypes();
    const filtered = all.map((t) => t.name).filter((name) => ALLOWED_TYPES.includes(name));
    return NextResponse.json({
      serverTypes: filtered.length > 0 ? filtered : FALLBACK_SERVER_TYPES,
    });
  } catch {
    return NextResponse.json({ serverTypes: FALLBACK_SERVER_TYPES });
  }
}
