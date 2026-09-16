export type ConnectorWaitStatus = "idle" | "waiting" | "timed_out" | "not_embedded";

export function useRefetchWhenConnectorReady(
  waiting: boolean,
  _refetch: () => unknown,
): ConnectorWaitStatus {
  if (!waiting) return "idle";
  return "not_embedded";
}
