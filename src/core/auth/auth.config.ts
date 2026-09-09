import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe Auth.js config. Contains ONLY things that run on the Edge runtime
 * (used by middleware): pages, session shaping callbacks, trustHost.
 * The Credentials provider (which uses bcrypt + Prisma, Node-only) lives in
 * auth.ts and is spread on top of this. This split is required so middleware
 * does not pull Node-only code into the Edge bundle.
 */
export const authConfig = {
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: { signIn: '/login' },
  providers: [], // real providers added in auth.ts (Node runtime)
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId;
        token.tenantCode = user.tenantCode;
        token.tenantName = user.tenantName;
        token.role = user.role;
        token.username = user.username;
        token.branchId = user.branchId;
        token.branchName = user.branchName;
        token.permissions = user.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.tenantId = token.tenantId as string;
        session.user.tenantCode = (token.tenantCode as string) ?? '';
        session.user.tenantName = (token.tenantName as string) ?? '';
        session.user.role = (token.role as string) ?? '';
        session.user.username = (token.username as string) ?? '';
        session.user.branchId = (token.branchId as string | null) ?? null;
        session.user.branchName = (token.branchName as string | null) ?? null;
        session.user.permissions = (token.permissions as string[]) ?? [];
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
