import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user?: DefaultSession['user'] & {
      playerId?: string;
      playerUsername?: string;
    };
  }

  interface JWT {
    playerId?: string;
    playerUsername?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    playerId?: string;
    playerUsername?: string;
  }
}
