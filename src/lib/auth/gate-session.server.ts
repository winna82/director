import type { BetterAuthPlugin } from "better-auth";

export const GATE_PROVIDER_ID = "grok-gate";

export function gateIdentitySessions(): BetterAuthPlugin {
  return { id: "gate-identity-sessions" };
}
