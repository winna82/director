export type PeerInfo = { id: string };
export type P2PRoomOptions = Record<string, unknown>;
export type SignalKind = string;
export type PeerRow = Record<string, unknown>;
export type SignalRow = Record<string, unknown>;
export type RtcPollResponse = Record<string, unknown>;
export const defaultIceServers: { urls: string }[] = [];
export class P2PRoom {
  constructor(_opts?: P2PRoomOptions) {}
}
