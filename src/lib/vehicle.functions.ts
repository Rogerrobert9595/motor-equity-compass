import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { estimateMaint, estimateMpg } from "./deal-math";
import { normalizeSheetJson, type Vehicle } from "./inventory";

const ALLOWED_SHEET_HOSTS = ["script.google.com", "script.googleusercontent.com"];

export const fetchSheetInventory = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ url: z.string().url().max(500) }).parse(data))
  .handler(
    async ({
      data,
    }): Promise<{ vehicles: Vehicle[]; tabName: string | null; error: string | null }> => {
      const url = new URL(data.url);
      if (url.protocol !== "https:" || !ALLOWED_SHEET_HOSTS.includes(url.hostname)) {
        return { vehicles: [], tabName: null, error: "Use your Google Apps Script web app link (script.google.com)." };
      }
      try {
        const res = await fetch(url.toString(), { redirect: "follow", signal: AbortSignal.timeout(15000) });
        const text = await res.text();
        const looksLikeLogin = res.url.includes("accounts.google.com") || /^\s*<!doctype html/i.test(text);
        if (looksLikeLogin) {
          return {
            vehicles: [],
            tabName: null,
            error:
              "Google asked for a sign-in. Re-deploy the script with access set to \"Anyone\" and use the link ending in /exec.",
          };
        }
        const json = JSON.parse(text);
        const vehicles = normalizeSheetJson(json);
        if (!vehicles.length) return { vehicles, tabName: null, error: "The sheet link worked but no vehicles were found." };
        return { vehicles, tabName: typeof json?.tabName === "string" ? json.tabName : null, error: null };
      } catch (err) {
        console.error("Sheet sync failed", err);
        return { vehicles: [], tabName: null, error: "Couldn't read the sheet link. Check the link and try again." };
      }
    },
  );

interface VinSpecs {
  year: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  combMpg: number | null;
  cityMpg: number | null;
  hwyMpg: number | null;
  estMaint: number | null;
  source: "epa" | "estimate" | "none";
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const asList = (x: any) => (Array.isArray(x) ? x : x ? [x] : []);

const EPA_MENU = "https://www.fueleconomy.gov/ws/rest/vehicle/menu";

/** Year → make → model → trim lists from fueleconomy.gov for the current-car picker. */
export const getEpaMenu = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        level: z.enum(["make", "model", "options"]),
        year: z.number().int().min(1984).max(2100),
        make: z.string().max(60).optional(),
        model: z.string().max(120).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<{ items: { text: string; value: string }[]; error: string | null }> => {
    const q = new URLSearchParams({ year: String(data.year) });
    if (data.level !== "make") q.set("make", data.make ?? "");
    if (data.level === "options") q.set("model", data.model ?? "");
    try {
      const json = await getJson(`${EPA_MENU}/${data.level}?${q}`);
      const items = asList(json?.menuItem).map((x: any) => ({ text: String(x.text), value: String(x.value) }));
      return { items, error: null };
    } catch (err) {
      console.error("EPA menu failed", err);
      return { items: [], error: "Couldn't load the list. Check the connection and try again." };
    }
  });

/** EPA MPG for one trim (id from the options list). */
export const getEpaVehicle = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ id: z.string().regex(/^\d{1,8}$/) }).parse(data))
  .handler(async ({ data }): Promise<{ combMpg: number | null; cityMpg: number | null; hwyMpg: number | null }> => {
    try {
      const veh = await getJson(`https://www.fueleconomy.gov/ws/rest/vehicle/${data.id}`);
      const comb = parseInt(veh?.comb08);
      if (!(comb > 0)) return { combMpg: null, cityMpg: null, hwyMpg: null };
      return { combMpg: comb, cityMpg: parseInt(veh.city08) || null, hwyMpg: parseInt(veh.highway08) || null };
    } catch (err) {
      console.error("EPA vehicle failed", err);
      return { combMpg: null, cityMpg: null, hwyMpg: null };
    }
  });

export const decodeVin = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({ vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{11,17}$/i), year: z.number().int(), miles: z.number() })
      .parse(data),
  )
  .handler(async ({ data }): Promise<VinSpecs> => {
    const empty: VinSpecs = { year: null, make: null, model: null, engine: null, combMpg: null, cityMpg: null, hwyMpg: null, estMaint: null, source: "none" };
    let v: any;
    try {
      const nhtsa = await getJson(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${data.vin}?format=json`);
      v = nhtsa?.Results?.[0];
    } catch (err) {
      console.error("NHTSA decode failed", err);
      return empty;
    }
    if (!v?.Make) return empty;

    const make: string = v.Make;
    const model: string = v.Model || "";
    const year = parseInt(v.ModelYear) || data.year;
    const displ = parseFloat(v.DisplacementL) || 2.5;
    const cyl = parseInt(v.EngineCylinders) || 4;
    const drive: string = v.DriveType || "";
    const fuel: string = v.FuelTypePrimary || "Gasoline";
    const engine = `${Number(displ.toFixed(1))}L ${cyl}-Cyl ${fuel === "Gasoline" ? "Gas" : fuel}`;
    const estMaint = estimateMaint(make, data.miles);

    try {
      const base = "https://www.fueleconomy.gov/ws/rest/vehicle/menu";
      const models = asList((await getJson(`${base}/model?year=${year}&make=${encodeURIComponent(make)}`))?.menuItem);
      const m = model.toLowerCase();
      const awd = /AWD|4WD|4x4/i.test(drive);
      const candidates = models.filter((x: any) => String(x.value).toLowerCase().startsWith(m));
      const pick =
        candidates.find((x: any) => (awd ? /AWD|4WD/i.test(x.value) : /FWD|2WD|RWD/i.test(x.value))) ??
        candidates[0];
      if (pick) {
        const opts = asList(
          (await getJson(`${base}/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(pick.value)}`))
            ?.menuItem,
        );
        if (opts[0]?.value) {
          const veh = await getJson(`https://www.fueleconomy.gov/ws/rest/vehicle/${opts[0].value}`);
          const comb = parseInt(veh.comb08);
          if (comb > 0) {
            return {
              make,
              model,
              engine,
              combMpg: comb,
              cityMpg: parseInt(veh.city08) || comb - 2,
              hwyMpg: parseInt(veh.highway08) || comb + 3,
              estMaint,
              source: "epa",
            };
          }
        }
      }
    } catch (err) {
      console.error("EPA lookup failed", err);
    }

    const est = estimateMpg(cyl, displ, drive);
    return { make, model, engine, combMpg: est, cityMpg: est - 2, hwyMpg: est + 3, estMaint, source: "estimate" };
  });
