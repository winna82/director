export function isConnectorTokenReady(): boolean {
  return false;
}

export async function callConnectorTool(): Promise<{
  ok: false;
  data: null;
  errorMessage: string;
}> {
  return { ok: false, data: null, errorMessage: "Connectors are not used by Director." };
}
