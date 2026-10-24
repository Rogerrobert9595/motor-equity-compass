// The shared inventory sheet's Apps Script web app endpoint (Deploy → Web app → /exec link).
// Editing the existing deployment with "New version" keeps this link the same.
export const SHARED_SHEET_URL =
  "https://script.google.com/macros/s/AKfycbydnekfH2pMyWo2mqBYPuHX5Sp9HQ4uR5D48WA3dgB4/exec";

const KEY = "desk.sheetUrl";

/** Link in use on this device: a saved override from the Sheet link tab, else the shared endpoint. */
export function getSheetUrl(): string {
  if (typeof window === "undefined") return SHARED_SHEET_URL;
  return localStorage.getItem(KEY)?.trim() || SHARED_SHEET_URL;
}

export function saveSheetUrl(url: string) {
  const u = url.trim();
  if (!u || u === SHARED_SHEET_URL) localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, u);
}
