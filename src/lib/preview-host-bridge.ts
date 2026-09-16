export function collectRoutePathsFromTree(tree: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const rec = node as { fullPath?: string; path?: string; children?: unknown[] };
    const p = rec.fullPath ?? rec.path;
    if (typeof p === "string" && p.startsWith("/")) out.push(p);
    if (Array.isArray(rec.children)) rec.children.forEach(walk);
  };
  walk(tree);
  return [...new Set(out)];
}

export function installPreviewHostBridge(_opts: {
  navigate: (path: string) => void;
  getRoutePaths: () => string[];
}): () => void {
  return () => {};
}
