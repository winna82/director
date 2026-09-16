import { createFileRoute } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { LoginPanel } from "@/components/director/login-panel";
import { Studio } from "@/components/director/studio";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="min-h-dvh bg-bg">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Clapperboard className="size-5 text-fg" />
          <span className="font-display text-2xl text-fg">Director</span>
        </div>
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="h-12 w-64 animate-pulse rounded-md bg-raised" />
          <div className="mt-6 h-40 max-w-md animate-pulse rounded-lg bg-raised" />
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-6 py-12 text-fg">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <Clapperboard className="size-5" />
            <p className="font-display text-3xl tracking-tight">Director</p>
          </div>
          <p className="mb-6 text-sm text-muted">
            Sign in to keep reels on your account and archive every take.
          </p>
          <LoginPanel callbackURL="/" />
        </div>
      </main>
    );
  }
  return <Studio />;
}
