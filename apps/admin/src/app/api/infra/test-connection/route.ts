import { NextResponse } from "next/server";
import { InfraService } from "@monster/deployment";

export async function POST() {
  try {
    const infra = new InfraService();
    const result = await infra.testDeployConnection();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[API /infra/test-connection] unexpected error: ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
