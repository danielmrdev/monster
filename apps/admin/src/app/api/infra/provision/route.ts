import { type NextRequest, NextResponse } from 'next/server';
import { ProvisioningService } from '@monster/deployment';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const datacenter = typeof body.datacenter === 'string' ? body.datacenter.trim() : '';
  const serverType = typeof body.serverType === 'string' ? body.serverType.trim() : '';
  const tailscaleKey = typeof body.tailscaleKey === 'string' ? body.tailscaleKey.trim() : '';
  const sshPublicKey = typeof body.sshPublicKey === 'string' ? body.sshPublicKey.trim() : '';

  if (!name || !datacenter || !serverType || !tailscaleKey || !sshPublicKey) {
    return NextResponse.json(
      { ok: false, error: 'name, datacenter, serverType, tailscaleKey, and sshPublicKey are required' },
      { status: 400 },
    );
  }

  console.log(`[infra/provision] starting provision for "${name}" (${serverType} in ${datacenter})`);

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: object) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        const service = new ProvisioningService();
        const server = await service.provision(
          { name, datacenter, serverType, tailscaleKey, sshPublicKey },
          (step, message) => {
            send({ type: 'progress', step, message });
          },
        );
        send({ type: 'done', ok: true, serverId: server.id });
        console.log(`[infra/provision] completed — server id=${server.id}`);
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`[infra/provision] failed:`, error);
        send({ type: 'error', error });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
