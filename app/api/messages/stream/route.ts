import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authOptions = await getAuthOptions();
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stream = new ReadableStream({
      start(controller) {
        // Send initial connection message
        controller.enqueue('data: {"type": "connected"}\n\n');

        // Keep connection alive with heartbeat
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue('data: {"type": "heartbeat"}\n\n');
          } catch (error) {
            clearInterval(heartbeat);
            controller.close();
          }
        }, 30000);

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          clearInterval(heartbeat);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Stream error:', error);
    return NextResponse.json(
      { error: 'Failed to establish stream' },
      { status: 500 }
    );
  }
}
