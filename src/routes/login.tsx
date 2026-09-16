import { createFileRoute } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { LoginPanel } from "@/components/director/login-panel";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-12 text-fg">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Clapperboard className="size-5" />
          <p className="font-display text-3xl tracking-tight">Director</p>
        </div>
        <p className="mb-6 text-sm text-muted">Sign in to keep reels and takes with your account.</p>
        <LoginPanel callbackURL="/" />
      </div>
    </main>
  );
}
