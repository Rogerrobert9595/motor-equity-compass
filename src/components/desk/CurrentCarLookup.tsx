import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assumedMiles, estimateMaint, MILEAGE_BUCKETS } from "@/lib/deal-math";
import { cn } from "@/lib/utils";
import { decodeVin, getEpaMenu, getEpaVehicle } from "@/lib/vehicle.functions";

import { CarSources } from "./CarSources";

type Item = { text: string; value: string };
type Mode = "vin" | "pick";

interface Found {
  year: number | null;
  make: string;
  model: string;
  vin: string | null;
  label: string;
  mpg: number | null;
  mpgSource: "epa" | "estimate" | null;
}

interface Props {
  /** Called with the estimated MPG (when found) and monthly repairs for the customer's car. */
  onEstimate: (est: {
    mpg: number | null;
    maint: number;
    car: { vin: string | null; year: number | null; make: string; model: string; label: string; miles: number };
  }) => void;
  /** Customer's yearly driving, for the AAA per-mile benchmark. */
  milesPerYear: number;
}

// Change any default fallback estimates like:
mpg: 25, 
monthlyRepairs: 120,

// Directly to:
mpg: 0,
monthlyRepairs: 0,
currentPayment: 0,

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR + 1 - 1990 + 1 }, (_, i) => THIS_YEAR + 1 - i);

function NativeSelect({
  label,
  value,
  onChange,
  disabled,
  loading,
  placeholder,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 w-full appearance-none truncate rounded-lg border border-input bg-background/60 px-3 pr-8 text-base outline-none focus:border-ring disabled:opacity-50",
          !value && "text-muted-foreground",
        )}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "▾"}
      </span>
    </label>
  );
}

export function CurrentCarLookup({ onEstimate, milesPerYear }: Props) {
  const [mode, setMode] = useState<Mode>("vin");
  const [vin, setVin] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [mileage, setMileage] = useState("");
  const [makes, setMakes] = useState<Item[]>([]);
  const [models, setModels] = useState<Item[]>([]);
  const [trims, setTrims] = useState<Item[]>([]);
  const [loading, setLoading] = useState<"make" | "model" | "options" | "vin" | "mpg" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const req = useRef(0);

  const menu = useServerFn(getEpaMenu);
  const vehicle = useServerFn(getEpaVehicle);
  const decode = useServerFn(decodeVin);

  const miles = useMemo(() => {
    const bucket = MILEAGE_BUCKETS[Number(mileage)];
    if (mileage !== "" && bucket) return { miles: bucket.miles, assumed: false };
    if (found?.year) return { miles: assumedMiles(found.year, THIS_YEAR), assumed: true };
    return null;
  }, [mileage, found?.year]);

  // Push the estimate up whenever the car or mileage changes.
  useEffect(() => {
    if (!found || !miles) return;
    onEstimate({
      mpg: found.mpg,
      maint: estimateMaint(found.make, miles.miles),
      car: { vin: found.vin, year: found.year, make: found.make, model: found.model, label: found.label, miles: miles.miles },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, miles]);

  const loadList = async (level: "make" | "model" | "options", y: string, mk = "", md = "") => {
    const id = ++req.current;
    setLoading(level);
    setError(null);
    const res = await menu({ data: { level, year: Number(y), make: mk, model: md } }).catch(() => ({
      items: [] as Item[],
      error: "Couldn't load the list. Check the connection and try again.",
    }));
    if (id !== req.current) return;
    setLoading(null);
    if (res.error) setError(res.error);
    if (level === "make") setMakes(res.items);
    if (level === "model") setModels(res.items);
    if (level === "options") setTrims(res.items);
  };

  const pickYear = (y: string) => {
    setYear(y);
    setMake("");
    setModel("");
    setTrim("");
    setMakes([]);
    setModels([]);
    setTrims([]);
    if (y) void loadList("make", y);
  };

  const pickMake = (mk: string) => {
    setMake(mk);
    setModel("");
    setTrim("");
    setModels([]);
    setTrims([]);
    if (mk) void loadList("model", year, mk);
  };

  const pickModel = (md: string) => {
    setModel(md);
    setTrim("");
    setTrims([]);
    if (md) {
      void loadList("options", year, make, md);
      // Repairs can be estimated as soon as the model is known; MPG fills in with the trim.
      setFound({ year: Number(year), make, model: md, vin: null, label: `${year} ${make} ${md}`, mpg: null, mpgSource: null });
    }
  };

  const pickTrim = async (t: string) => {
    setTrim(t);
    if (!t) return;
    const trimText = trims.find((x) => x.value === t)?.text ?? "";
    const id = ++req.current;
    setLoading("mpg");
    const res = await vehicle({ data: { id: t } }).catch(() => ({ combMpg: null }));
    if (id !== req.current) return;
    setLoading(null);
    if (!res.combMpg) setError("No EPA MPG for that trim. Enter MPG by hand.");
    setFound({
      year: Number(year),
      make,
      model,
      vin: null,
      label: `${year} ${make} ${model} · ${trimText}`,
      mpg: res.combMpg ?? null,
      mpgSource: res.combMpg ? "epa" : null,
    });
  };

  const lookupVin = async () => {
    const v = vin.trim().toUpperCase();
    if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(v)) {
      setError("Enter the 17-character VIN (no I, O or Q).");
      return;
    }
    const id = ++req.current;
    setLoading("vin");
    setError(null);
    const s = await decode({ data: { vin: v, year: 0, miles: miles?.miles ?? 0 } }).catch(() => null);
    if (id !== req.current) return;
    setLoading(null);
    if (!s || s.source === "none" || !s.make) {
      setError("Couldn't decode that VIN. Check it, or use Year / Make / Model.");
      return;
    }
    setFound({
      year: s.year || null,
      make: s.make,
      model: s.model ?? "",
      vin: v,
      label: [s.year || "", s.make, s.model, s.engine ? `· ${s.engine}` : ""].filter(Boolean).join(" "),
      mpg: s.combMpg,
      mpgSource: s.source === "epa" ? "epa" : "estimate",
    });
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Look up their car</div>
        <div className="flex rounded-lg bg-muted p-0.5 text-xs">
          {(["vin", "pick"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cn(
                "rounded-md px-2.5 py-1.5 font-medium transition-colors",
                mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {m === "vin" ? "VIN" : "Year / Make"}
            </button>
          ))}
        </div>
      </div>

      {mode === "vin" ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void lookupVin();
          }}
        >
          <Input
            value={vin}
            onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17))}
            placeholder="17-digit VIN"
            aria-label="Current car VIN"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="num h-11 flex-1 text-base tracking-wider"
          />
          <Button type="submit" variant="secondary" className="h-11" disabled={loading === "vin" || vin.length < 11}>
            {loading === "vin" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            Look up
          </Button>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect label="Year" value={year} onChange={pickYear} placeholder="Year">
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect label="Make" value={make} onChange={pickMake} placeholder="Make" disabled={!makes.length} loading={loading === "make"}>
            {makes.map((x) => (
              <option key={x.value} value={x.value}>
                {x.text}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect label="Model" value={model} onChange={pickModel} placeholder="Model" disabled={!models.length} loading={loading === "model"}>
            {models.map((x) => (
              <option key={x.value} value={x.value}>
                {x.text}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            label="Trim"
            value={trim}
            onChange={(t) => void pickTrim(t)}
            placeholder="Trim / engine"
            disabled={!trims.length}
            loading={loading === "options" || loading === "mpg"}
          >
            {trims.map((x) => (
              <option key={x.value} value={x.value}>
                {x.text}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <NativeSelect label="Mileage" value={mileage} onChange={setMileage} placeholder="Mileage (optional)">
        {MILEAGE_BUCKETS.map((b, i) => (
          <option key={b.label} value={i}>
            {b.label} mi
          </option>
        ))}
      </NativeSelect>

      {error && <p className="text-xs text-cost">{error}</p>}

      {found && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/10 p-2.5 text-xs">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{found.label}</div>
            <div className="text-muted-foreground">
              {found.mpg ? `${found.mpg} mpg ${found.mpgSource === "epa" ? "(EPA)" : "(estimate)"}` : "MPG: pick a trim"}
              {miles && ` · repairs est. at ${miles.miles.toLocaleString("en-US")} mi${miles.assumed ? " (assumed from age)" : ""}`}
              {" · applied below"}
            </div>
          </div>
        </div>
      )}

      {found && (
        <CarSources
          year={found.year}
          make={found.make}
          model={found.model}
          vin={found.vin}
          odometer={miles?.miles ?? null}
          milesPerYear={milesPerYear}
          mpgSource={found.mpgSource}
        />
      )}
    </div>
  );
}
