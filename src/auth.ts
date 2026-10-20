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

function rejectSignIn(reason: string) {
  // Auth.js turns a null return into CredentialsSignin and logs a stack trace.
  // The reason is the useful line; the stack is suppressed in `logger` below.
  console.warn(`[auth] sign-in rejected: ${reason}`);
  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  logger: {
    error(error) {
      if (error.name === "CredentialsSignin") return;
      console.error(`[auth][error] ${error.name}: ${error.message}`);
      if (error.stack) console.error(error.stack);
    },
  },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return rejectSignIn("email or password missing or invalid");
        const { email, password } = parsed.data;
        const normalizedEmail = email.toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { role: true },
        });
        if (!user) return rejectSignIn(`no user for ${normalizedEmail}`);
        if (!user.isActive) return rejectSignIn(`user inactive: ${normalizedEmail}`);

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return rejectSignIn(`password mismatch for ${normalizedEmail}`);

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
