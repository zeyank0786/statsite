import NextAuth from 'next-auth';
import { getAuthOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

let handler: ReturnType<typeof NextAuth>;

async function initHandler() {
  if (!handler) {
    const authOptions = await getAuthOptions();
    handler = NextAuth(authOptions);
  }
  return handler;
}

export async function GET(req: any, ctx: any) {
  const h = await initHandler();
  return h(req, ctx);
}

export async function POST(req: any, ctx: any) {
  const h = await initHandler();
  return h(req, ctx);
}
