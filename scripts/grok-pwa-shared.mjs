export const DEFAULT_APP_NAME = "Director";
export const OG_SERVICE_URL_DEFAULT = "https://og.grok.me";
export const OG_SITE_REL_PATH = "src/lib/og/site.json";

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function appNameFromHost() {
  return DEFAULT_APP_NAME;
}
export function publicAppHost(hostHeader) {
  return String(hostHeader ?? "").split(",")[0].trim();
}
export function resolvePublicHost(hostHeader) {
  return publicAppHost(hostHeader);
}
export function isInstallQuery(url) {
  return /[?&]install=1(?:&|$)/.test(String(url ?? ""));
}
export function isDocumentPath(pathname) {
  const p = pathname ?? "/";
  return p === "/" || p.endsWith(".html") || !p.includes(".");
}
export function acceptsHtml(accept) {
  return String(accept ?? "").includes("text/html");
}
export function stripInstallParams(url) {
  return String(url ?? "/");
}
export function renderInstallPageHtml(template) {
  return String(template).replaceAll("{{APP_NAME}}", DEFAULT_APP_NAME);
}
export function renderWebManifest() {
  return JSON.stringify({
    name: DEFAULT_APP_NAME,
    short_name: DEFAULT_APP_NAME,
    start_url: "/",
    display: "standalone",
    background_color: "#0c0c0d",
    theme_color: "#0c0c0d",
  });
}
export function grokPwaHeadTags() { return []; }
export const GROK_EXTENSIONS_SCRIPT_SRC = "";
export function readGrokProjectId() { return ""; }
export function readXCreator() { return ""; }
export function readXCreatorId() { return ""; }
export function grokXCreatorHeadTags() { return []; }
export function grokExtensionsHeadTags() { return []; }
export function readOgSite() { return {}; }
export function ogCardPublicPath() { return ""; }
export function snapshotOgIdentity() { return { site: {} }; }
export function customOgAssetPath() { return ""; }
export function resolveOgCardAsset() { return ""; }
export function ogServiceUrl() { return OG_SERVICE_URL_DEFAULT; }
export function titleFromDocument() { return ""; }
export function resolveOgTitle(_site, appName) { return appName || DEFAULT_APP_NAME; }
export function siteHasCustomCard() { return false; }
export function grokOgHeadTags() { return []; }
export function stripShareMetaTags(html) { return html; }
export function normalizeHeadContext() {
  return { appName: DEFAULT_APP_NAME, projectId: "", creator: "", creatorId: "", host: "", cwd: "", site: {} };
}
export function injectGrokPwaHead(html) { return html; }
export function createHeadInjector() {
  return {
    push(chunk) { return [chunk]; },
    flush() { return []; },
  };
}
