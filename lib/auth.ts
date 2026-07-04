import { compare } from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  const globalForPrisma = global as unknown as { prisma: PrismaClient };
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  prisma = globalForPrisma.prisma;
}

export async function getAuthOptions(): Promise<NextAuthOptions> {
  return {
    providers: [
      CredentialsProvider({
        name: 'Credentials',
        credentials: {
          email: { label: 'Email', type: 'email' },
          password: { label: 'Password', type: 'password' },
        },
        async authorize(credentials) {
          try {
            if (!credentials?.email || !credentials?.password) {
              throw new Error('Missing email or password');
            }

            const user = await prisma.user.findUnique({
              where: { email: credentials.email },
              include: { player: true },
            });

            if (!user) {
              throw new Error('No user found with that email');
            }

            const passwordMatch = await compare(credentials.password, user.password);
            if (!passwordMatch) {
              throw new Error('Invalid password');
            }

            return {
              id: user.id,
              email: user.email,
              playerId: user.playerId,
              playerUsername: user.username,
            };
          } catch (error: any) {
            console.error('Auth error:', error.message);
            throw new Error(error.message || 'Authentication failed');
          }
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.playerId = (user as any).playerId;
          token.playerUsername = (user as any).playerUsername;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          (session.user as any).playerId = token.playerId;
          (session.user as any).playerUsername = token.playerUsername;
        }
        return session;
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
    session: {
      strategy: 'jwt',
    },
  };
}
