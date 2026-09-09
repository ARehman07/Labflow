import type { DefaultSession } from 'next-auth';

// Augment Auth.js types with our custom user fields.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      tenantCode: string;
      tenantName: string;
      username: string;
      role: string;
      branchId: string | null;
      branchName: string | null;
      permissions: string[];
    } & DefaultSession['user'];
  }

  interface User {
    tenantId: string;
    tenantCode: string;
    tenantName: string;
    username: string;
    role: string;
    branchId: string | null;
    branchName: string | null;
    permissions: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    tenantId?: string;
    tenantCode?: string;
    tenantName?: string;
    role?: string;
    username?: string;
    branchId?: string | null;
    branchName?: string | null;
    permissions?: string[];
  }
}
