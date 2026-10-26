// The shared inventory sheet's Apps Script web app endpoint (Deploy → Web app → /exec link).
// Editing the existing deployment with "New version" keeps this link the same.
export const DEFAULT_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzTJem5cjXWMg1pEcuSWTY838Zn8S4M2z2hmWAGCskLPK-keTsLRkYaEOELNyGSqH78XQ/exec";

export const SCRIPT_URL_KEY = "deal_desk_script_url";
const LEGACY_KEY = "desk.sheetUrl";

/** Link in use on this device: the saved link, else the built-in default. */
export function getSheetUrl(): string {
  if (typeof window === "undefined") return DEFAULT_SCRIPT_URL;
  // Old saved links pointed at a retired deployment; drop them so the new default wins.
  localStorage.removeItem(LEGACY_KEY);
  return localStorage.getItem(SCRIPT_URL_KEY)?.trim() || DEFAULT_SCRIPT_URL;
}

export function saveSheetUrl(url: string) {
  const u = url.trim();
  if (!u) localStorage.removeItem(SCRIPT_URL_KEY);
  else localStorage.setItem(SCRIPT_URL_KEY, u);
}
