export function getAppBasePath() {
  const value = import.meta.env?.BASE_URL || "/";
  return `/${value.replace(/^\/+|\/+$/g, "")}${value === "/" ? "" : "/"}`;
}

export function getAppOrigin() {
  const origin = globalThis.location?.origin ?? "";
  const basePath = getAppBasePath().replace(/\/$/, "");
  return `${origin}${basePath}`;
}

export function appUrl(path = "") {
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) return path;
  const basePath = getAppBasePath().replace(/\/$/, "");
  return `${basePath}${path.startsWith("/") ? path : `/${path}`}` || "/";
}
