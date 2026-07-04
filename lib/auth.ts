import { compare } from 'bcryptjs';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { queryOne } from './db';

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

            const user = await queryOne(
              'SELECT u.id, u.email, u.password, u.playerId, p.username FROM User u LEFT JOIN Player p ON u.playerId = p.id WHERE u.email = ?',
              [credentials.email]
            );

            if (!user) {
              throw new Error('No user found with that email');
            }

            const passwordMatch = await compare(credentials.password, String(user.password));
            if (!passwordMatch) {
              throw new Error('Invalid password');
            }

            return {
              id: String(user.id),
              email: String(user.email),
              playerId: user.playerId ? String(user.playerId) : null,
              playerUsername: user.username ? String(user.username) : null,
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
          token.id = (user as any).id;
          token.playerId = (user as any).playerId;
          token.playerUsername = (user as any).playerUsername;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          (session.user as any).id = token.id;
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
