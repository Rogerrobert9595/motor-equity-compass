import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { estimateMaint, estimateMpg } from "./deal-math";
import { normalizeSheetJson, VIN_RE, type Vehicle } from "./inventory";

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

/**
 * Exact EPA MPG for a car, by VIN and/or year + make + model.
 * A. NHTSA vPIC decodes the VIN (year, make, model, drive, engine, fuel).
 * B. fueleconomy.gov options for year/make/model (falls back to the closest EPA model name, e.g. "RAV4 AWD").
 * C. First matching option (preferring the same cylinders/displacement) → certified comb08/city08/highway08.
 * D. No exact match → engine-displacement estimate, flagged as "estimate".
 */
export async function fetchExactEpaMpg(
  year: number | null,
  make: string | null,
  model: string | null,
  vin?: string | null,
): Promise<Omit<VinSpecs, "estMaint">> {
  let drive = "";
  let displ: number | null = null;
  let cyl: number | null = null;
  let fuel = "Gasoline";

  const cleanVin = vin?.trim() || null;
  if (cleanVin && VIN_RE.test(cleanVin)) {
    try {
      const nhtsa = await getJson(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${cleanVin}?format=json`);
      const v = nhtsa?.Results?.[0];
      if (v?.Make) {
        make = v.Make;
        model = v.Model || model;
        year = parseInt(v.ModelYear) || year;
        drive = v.DriveType || "";
        displ = parseFloat(v.DisplacementL) || null;
        cyl = parseInt(v.EngineCylinders) || null;
        fuel = v.FuelTypePrimary || fuel;
      }
    } catch (err) {
      console.error("NHTSA decode failed", err);
    }
  }

  if (!make || !year) {
    return { year: null, make: null, model: null, engine: null, combMpg: null, cityMpg: null, hwyMpg: null, source: "none" };
  }
  const engine = displ || cyl ? `${displ ? `${Number(displ.toFixed(1))}L ` : ""}${cyl ? `${cyl}-Cyl ` : ""}${fuel === "Gasoline" ? "Gas" : fuel}` : null;

  if (model) {
    try {
      const optionsFor = async (md: string) =>
        asList(
          (await getJson(`${EPA_MENU}/options?year=${year}&make=${encodeURIComponent(make!)}&model=${encodeURIComponent(md)}`))?.menuItem,
        );
      let opts = await optionsFor(model);
      if (!opts.length) {
        // EPA model names carry drive/body suffixes; pick the closest one.
        const models = asList((await getJson(`${EPA_MENU}/model?year=${year}&make=${encodeURIComponent(make)}`))?.menuItem);
        const m = model.toLowerCase();
        const awd = /AWD|4WD|4x4/i.test(drive);
        const candidates = models.filter((x: any) => String(x.value).toLowerCase().startsWith(m));
        const pick =
          candidates.find((x: any) => (awd ? /AWD|4WD/i.test(x.value) : /FWD|2WD|RWD/i.test(x.value))) ?? candidates[0];
        if (pick) opts = await optionsFor(String(pick.value));
      }
      const match =
        opts.find((o: any) => {
          const t = String(o.text);
          return (!cyl || t.includes(`${cyl} cyl`)) && (!displ || t.includes(`${Number(displ.toFixed(1))} L`));
        }) ?? opts[0];
      if (match?.value) {
        const veh = await getJson(`https://www.fueleconomy.gov/ws/rest/vehicle/${match.value}`);
        const comb = parseInt(veh?.comb08);
        if (comb > 0) {
          return {
            year,
            make,
            model,
            engine,
            combMpg: comb,
            cityMpg: parseInt(veh.city08) || null,
            hwyMpg: parseInt(veh.highway08) || null,
            source: "epa",
          };
        }
      }
    } catch (err) {
      console.error("EPA lookup failed", err);
    }
  }

  const est = estimateMpg(cyl ?? 4, displ ?? 2.5, drive);
  return { year, make, model, engine, combMpg: est, cityMpg: est - 2, hwyMpg: est + 3, source: "estimate" };
}

/** Specs for the proposed unit or the customer's car: VIN when there is one, else year/make/model. */
export const lookupVehicleSpecs = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        vin: z.string().trim().regex(VIN_RE).nullable().optional(),
        year: z.number().int().min(0).max(2100).nullable().optional(),
        make: z.string().max(60).nullable().optional(),
        model: z.string().max(120).nullable().optional(),
        miles: z.number().finite().min(0),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<VinSpecs> => {
    const s = await fetchExactEpaMpg(data.year || null, data.make ?? null, data.model ?? null, data.vin ?? null);
    return { ...s, estMaint: s.make ? estimateMaint(s.make, data.miles) : null };
  });

export interface SafetyRecords {
  recalls: number;
  complaints: number;
  topComplaints: string[]; // most-reported components
  error: string | null;
}

async function nhtsaCounts(make: string, model: string, year: number) {
  const q = `make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`;
  const [rec, comp] = await Promise.all([
    getJson(`https://api.nhtsa.gov/recalls/recallsByVehicle?${q}`).catch(() => null),
    getJson(`https://api.nhtsa.gov/complaints/complaintsByVehicle?${q}`).catch(() => null),
  ]);
  return { rec, comp };
}

/** Recall and owner-complaint counts for a model year from NHTSA's public API. */
export const getSafetyRecords = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({ make: z.string().min(1).max(60), model: z.string().min(1).max(120), year: z.number().int().min(1950).max(2100) })
      .parse(data),
  )
  .handler(async ({ data }): Promise<SafetyRecords> => {
    // EPA model names carry drive/body suffixes ("RAV4 AWD"); fall back to the first word.
    const tries = [data.model, data.model.split(/\s+/)[0] ?? ""].filter((m, i, a) => m && a.indexOf(m) === i);
    let out: SafetyRecords = { recalls: 0, complaints: 0, topComplaints: [], error: "NHTSA didn't respond." };
    for (const model of tries) {
      const { rec, comp } = await nhtsaCounts(data.make, model, data.year);
      if (!rec && !comp) continue;
      const recalls = Number(rec?.Count ?? rec?.count ?? 0) || 0;
      const list: any[] = Array.isArray(comp?.results) ? comp.results : [];
      const complaints = Number(comp?.count ?? comp?.Count ?? list.length) || 0;
      const tally = new Map<string, number>();
      for (const c of list) {
        for (const part of String(c?.components ?? "").split(",")) {
          const k = part.trim();
          if (k) tally.set(k, (tally.get(k) ?? 0) + 1);
        }
      }
      const topComplaints = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k.toLowerCase());
      out = { recalls, complaints, topComplaints, error: null };
      if (recalls || complaints) break;
    }
    return out;
  });
