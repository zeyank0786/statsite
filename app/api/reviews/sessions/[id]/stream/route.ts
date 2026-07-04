import { NextResponse } from 'next/server';
import { registerClient } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const stream = new ReadableStream({
    start(controller) {
      // Register this client
      const cleanup = registerClient(id, {
        write: (data: string) => {
          try {
            controller.enqueue(new TextEncoder().encode(data));
          } catch (error) {
            cleanup();
          }
        },
      });

      // Send initial connection confirmation
      const initialMessage = `data: ${JSON.stringify({ type: 'connected' })}\n\n`;
      controller.enqueue(new TextEncoder().encode(initialMessage));

      // Cleanup on disconnect
      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
