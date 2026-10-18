"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
    return undefined;
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: err.type === "CredentialsSignin" ? "Invalid email or password." : "Could not sign you in." };
    }
    // Next.js uses a thrown error to perform the redirect; re-throw it.
    throw err;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
