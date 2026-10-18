import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Permissions / role in the JWT are refreshed from the DB at most this often. */
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          include: { role: true },
        });
        if (!user || !user.isActive) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          roleId: user.roleId,
          roleName: user.role.name,
          teamId: user.teamId,
          permissions: user.role.permissions,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id as string;
        token.roleId = user.roleId;
        token.roleName = user.roleName;
        token.teamId = user.teamId;
        token.permissions = user.permissions;
        token.refreshedAt = Date.now();
        return token;
      }

      const stale = !token.refreshedAt || Date.now() - token.refreshedAt > REFRESH_INTERVAL_MS;
      if ((stale || trigger === "update") && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id },
          include: { role: true },
        });
        if (!fresh || !fresh.isActive) {
          // Force sign-out on next request by emptying permissions.
          token.permissions = [];
          token.refreshedAt = Date.now();
          return token;
        }
        token.name = fresh.name;
        token.email = fresh.email;
        token.roleId = fresh.roleId;
        token.roleName = fresh.role.name;
        token.teamId = fresh.teamId;
        token.permissions = fresh.role.permissions;
        token.refreshedAt = Date.now();
      }
      return token;
    },
  },
});
