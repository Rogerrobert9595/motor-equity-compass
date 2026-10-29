// Inventory list for the desk: cached list on open, then a live refresh from the shared
// Google Sheet (Apps Script link saved on this device, or the account's saved link).
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { SAMPLE_INVENTORY, type Vehicle } from "@/lib/inventory";
import { getAccountScriptUrl } from "@/lib/saved-deals";
import { getSheetUrl, saveSheetUrl } from "@/lib/sheet-config";
import { fetchSheetInventory } from "@/lib/vehicle.functions";

const LIST_KEY = "desk.inventory";
const SOURCE_KEY = "desk.source";

export interface SheetState {
  status: "idle" | "syncing" | "ok" | "error";
  error: string | null;
}

interface Options {
  userId: string | undefined;
  /** Show this unit on the desk; `lookup` = also fetch its EPA/VIN specs. */
  onPick: (v: Vehicle, lookup: boolean) => void;
  /** Unit on screen now, and whether an opened saved deal owns its numbers. */
  getSelection: () => { stock: string; locked: boolean };
}

function readCachedList(): { list: Vehicle[]; source: string } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(LIST_KEY) || "null");
    if (Array.isArray(saved) && saved.length) {
      return { list: saved as Vehicle[], source: localStorage.getItem(SOURCE_KEY) || "Saved units" };
    }
  } catch {
    /* ignore bad saved data */
  }
  return null;
}

export function useInventory({ userId, onPick, getSelection }: Options) {
  const [inventory, setInventory] = useState<Vehicle[]>(SAMPLE_INVENTORY);
  const [source, setSource] = useState("Sample units");
  const [sheet, setSheet] = useState<SheetState>({ status: "idle", error: null });
  const fetchSheet = useServerFn(fetchSheetInventory);

  // Latest callbacks without re-creating sync/replace on every render.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const selectionRef = useRef(getSelection);
  selectionRef.current = getSelection;
  const fetchRef = useRef(fetchSheet);
  fetchRef.current = fetchSheet;
  const syncReq = useRef(0);

  const replace = useCallback((list: Vehicle[], src: string, pick: Vehicle | null = list[0] ?? null) => {
    setInventory(list);
    setSource(src);
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify(list));
      localStorage.setItem(SOURCE_KEY, src);
    } catch {
      /* ignore quota / storage errors */
    }
    if (src.startsWith("Sheet")) setSheet({ status: "ok", error: null });
    if (pick) pickRef.current(pick, true);
  }, []);

  const sync = useCallback(
    async (url: string, keepStock?: string) => {
      const id = ++syncReq.current;
      setSheet((s) => ({ ...s, status: "syncing" }));
      try {
        const res = await fetchRef.current({ data: { url } });
        if (id !== syncReq.current) return;
        if (res.error) {
          setSheet({ status: "error", error: res.error });
          return;
        }
        const keep = keepStock ? res.vehicles.find((v) => v.stock === keepStock) : undefined;
        const sel = selectionRef.current();
        // Don't overwrite an opened saved deal's numbers when the list refreshes underneath it.
        const pick = keep && sel.locked && keep.stock === sel.stock ? null : (keep ?? res.vehicles[0] ?? null);
        replace(res.vehicles, `Sheet: ${res.tabName ?? "live"}`, pick);
      } catch {
        if (id !== syncReq.current) return;
        setSheet({ status: "error", error: "Couldn't reach the sheet. Showing the last saved units." });
      }
    },
    [replace],
  );

  // Show the last saved inventory instantly, then refresh from the shared sheet.
  useEffect(() => {
    const cached = readCachedList();
    if (cached) {
      setInventory(cached.list);
      setSource(cached.source);
      pickRef.current(cached.list[0]!, false);
    }
    void sync(getSheetUrl(), cached?.list[0]?.stock);
  }, [sync]);

  // Signed in: use the sheet link saved to the account, so a new phone picks it up.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getAccountScriptUrl()
      .then((url) => {
        if (cancelled || !url || url === getSheetUrl()) return;
        saveSheetUrl(url);
        void sync(url, selectionRef.current().stock);
      })
      .catch(() => {
        /* keep the device link */
      });
    return () => {
      cancelled = true;
    };
  }, [userId, sync]);

  return { inventory, source, sheet, sync, replace };
}
