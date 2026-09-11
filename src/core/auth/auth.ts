import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { unscopedPrisma as prisma } from '@/core/db/tenant';
import { authConfig } from './auth.config';
import { isLockedOut, recordFailure, recordSuccess } from './rate-limit';

const credentialsSchema = z.object({
  tenantCode: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
});

/**
 * Full Auth.js instance (Node runtime). Reuses the edge-safe callbacks from
 * authConfig and adds the Credentials provider that hits the database.
 * Used by route handlers and server actions — NOT by middleware.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { tenantCode: {}, username: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { tenantCode, username, password } = parsed.data;

        // Lockout key is per lab: one tenant cannot lock out another's user.
        const lockKey = `${tenantCode}:${username}`;
        if (isLockedOut(lockKey)) return null;

        // Cross-tenant by necessity — this is how we discover the tenant.
        const tenant = await prisma.tenant.findUnique({
          where: { code: tenantCode },
          select: { id: true, code: true, name: true, isActive: true },
        });
        if (!tenant || !tenant.isActive) {
          recordFailure(lockKey);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { tenantId_username: { tenantId: tenant.id, username } },
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
            branch: true,
          },
        });
        if (!user || !user.isActive) {
          recordFailure(lockKey);
          return null;
        }

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
          recordFailure(lockKey);
          return null;
        }
        recordSuccess(lockKey);
        // Lets an owner see at a glance which accounts are actually in use.
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        return {
          id: user.id,
          tenantId: tenant.id,
          tenantCode: tenant.code,
          tenantName: tenant.name,
          name: user.fullName,
          username: user.username,
          role: user.role.name,
          branchId: user.branchId ?? null,
          branchName: user.branch?.name ?? null,
          partnerLabId: user.partnerLabId ?? null,
          doctorId: user.doctorId ?? null,
          permissions: user.role.permissions.map((rp) => rp.permission.code),
        };
      },
    }),
  ],
});
