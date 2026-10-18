import { Radar } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in - Outbound Engine" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Radar className="size-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Outbound Engine</h1>
          <p className="text-sm text-muted-foreground">Sign in to your lead workspace</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
