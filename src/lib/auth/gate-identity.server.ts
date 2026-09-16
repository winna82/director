export const GATE_IDENTITY_HEADER = "x-grok-identity";
export const GATE_JWKS_PATH = "/__gate/identity-key";

export type GateIdentity = {
  sub: string;
  email: string | null;
  name: string | null;
  teamId: string | null;
};

export function gateIdentityEnabled(): boolean {
  return false;
}

export function gateIdentityFromHeaders(_headers?: Headers): GateIdentity | null {
  return null;
}

export function gateIdentityUserInfo(identity: GateIdentity) {
  return {
    id: identity.sub,
    email: identity.email,
    name: identity.name,
    image: null as string | null,
  };
}

export function sessionBoundToGateIdentity(): boolean {
  return true;
}
