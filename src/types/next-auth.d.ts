import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    roleId: string;
    roleName: string;
    teamId: string | null;
    permissions: string[];
  }

  interface Session {
    user: {
      id: string;
      roleId: string;
      roleName: string;
      teamId: string | null;
      permissions: string[];
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    roleId: string;
    roleName: string;
    teamId: string | null;
    permissions: string[];
    refreshedAt?: number;
  }
}
