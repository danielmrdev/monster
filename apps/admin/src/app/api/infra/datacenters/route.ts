import { NextResponse } from "next/server";
import { HetznerClient } from "@monster/deployment";

// Hardcoded fallback when hetzner_api_token is not configured (KN005)
const FALLBACK_DATACENTERS = ["nbg1-dc3", "fsn1-dc14", "hel1-dc2"];

export async function GET() {
  try {
    const client = new HetznerClient();
    const datacenters = await client.listDatacenters();
    return NextResponse.json({ datacenters: datacenters.map((d) => d.name) });
  } catch {
    // Token absent or API unreachable — return fallback list
    return NextResponse.json({ datacenters: FALLBACK_DATACENTERS });
  }
}
