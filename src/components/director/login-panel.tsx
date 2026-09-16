import { useState } from "react";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";

export function LoginPanel({ callbackURL = "/" }: { callbackURL?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const path = mode === "up" ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email";
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: email.trim().split("@")[0] || "Director",
          callbackURL,
        }),
      });
      const raw = await res.text();
      let payload: { message?: string } = {};
      try {
        payload = JSON.parse(raw) as { message?: string };
      } catch {
        payload = {};
      }
      if (!res.ok) {
        const hint =
          payload.message ||
          (res.status === 403
            ? "Invalid origin — set BETTER_AUTH_URL to this site’s https URL (no trailing slash)."
            : res.status === 401
              ? "Wrong email or password. Create an account first if you haven’t."
              : res.status >= 500
                ? "Server error — Postgres tables may be missing. Redeploy so migrate runs at boot."
                : raw.slice(0, 180) || `HTTP ${res.status}`);
        throw new Error(hint);
      }
      window.location.assign(callbackURL);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  if (!authEnabled) {
    return <p className="text-sm text-muted">Sign-in is disabled.</p>;
  }

  const showGrokOAuth =
    typeof window !== "undefined" &&
    (window.location.hostname.endsWith(".grok-sandbox.com") ||
      window.location.hostname.endsWith(".grok.me") ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");

  return (
    <div className="flex flex-col gap-3">
      {showGrokOAuth
        ? GROK_PROVIDERS.map((p) => (
            <Button
              key={p.providerId}
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => signIn(p.providerId, { callbackURL })}
            >
              Continue with {p.label}
            </Button>
          ))
        : null}
      {showGrokOAuth ? (
        <div className="flex items-center gap-3 py-2">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase tracking-widest text-subtle">or email</span>
          <span className="h-px flex-1 bg-border" />
        </div>
      ) : null}
      <form className="flex flex-col gap-3" onSubmit={onEmail}>
        <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-widest text-subtle">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-md border border-border bg-paper px-3 text-sm font-normal normal-case tracking-normal text-paper-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-widest text-subtle">
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-md border border-border bg-paper px-3 text-sm font-normal normal-case tracking-normal text-paper-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Working\u2026" : mode === "up" ? "Create account" : "Sign in"}
        </Button>
      </form>
      <button
        type="button"
        className="text-sm text-muted hover:text-fg"
        onClick={() => setMode(mode === "up" ? "in" : "up")}
      >
        {mode === "up" ? "Have an account? Sign in" : "New here? Create an account"}
      </button>
    </div>
  );
}
