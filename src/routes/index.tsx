import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BadgePercent,
  CalendarClock,
  Copy,
  Eye,
  EyeOff,
  FolderOpen,
  Pin,
  PinOff,
  Send,
  Fuel,
  Gauge,
  LineChart,
  Loader2,
  MapPin,
  Search,
  Share2,
  Car,
  Warehouse,
  Wrench,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { CompareBars } from "@/components/desk/CompareBars";
import { CurrentCarLookup } from "@/components/desk/CurrentCarLookup";
import { EquityChart } from "@/components/desk/EquityChart";
import { Field, money, num, NumInput, Panel, signedMoney, SliderField } from "@/components/desk/fields";
import { InventoryPanel } from "@/components/desk/InventoryPanel";
import { SavedDealsPanel } from "@/components/desk/SavedDealsPanel";
import { useAuth } from "@/hooks/use-auth";
import { getAccountScriptUrl, type SavedDeal, type TradeCar } from "@/lib/saved-deals";
import { chartMilestones, MilestoneChips } from "@/components/desk/milestones";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { estimateMaint, makeFromModel, simulate, type CurrentInputs, type DealInputs, type SimPoint } from "@/lib/deal-math";
import { findByStock, SAMPLE_INVENTORY, type Vehicle } from "@/lib/inventory";
import { getSheetUrl, saveSheetUrl } from "@/lib/sheet-config";
import { encodeSummary } from "@/lib/summary-link";
import { cn } from "@/lib/utils";
import { decodeVin, fetchSheetInventory } from "@/lib/vehicle.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Deal Desk – Ownership & Equity Twin" },
      {
        name: "description",
        content:
          "Phone-ready dealership desk: compare a customer's current car with any stock unit — payment, fuel, maintenance and equity crossover.",
      },
      { property: "og:title", content: "Deal Desk – Ownership & Equity Twin" },
      {
        property: "og:description",
        content: "Show customers their real monthly cash flow and when they'll have positive trade equity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DeskPage,
});

type Tab = "deal" | "costs" | "equity";
const TERMS = [48, 60, 72, 84];

function DeskPage() {
  const [inventory, setInventory] = useState<Vehicle[]>(SAMPLE_INVENTORY);
  const [source, setSource] = useState("Sample units");
  const [selected, setSelected] = useState<Vehicle>(SAMPLE_INVENTORY[0]!);
  const [deal, setDeal] = useState<DealInputs>({
    price: 23999,
    cash: 2500,
    tradeValue: 0,
    tradePayoff: 0,
    taxRate: 8,
    tradeTaxCredit: true,
    fees: 375,
    apr: 6.9,
    term: 72,
    mpg: 27,
    maint: 58,
  });
  const [current, setCurrent] = useState<CurrentInputs>({ commute: 42, currPay: 310, currMpg: 18, currMaint: 165, gasPrice: 3.45, insDelta: 18 });
  const [scrub, setScrub] = useState(36);
  const [tab, setTab] = useState<Tab>("deal");
  const [panelOpen, setPanelOpen] = useState(false);
  const [dealsOpen, setDealsOpen] = useState(false);
  const [activeDeal, setActiveDeal] = useState<SavedDeal | null>(null);
  const [tradeCar, setTradeCar] = useState<TradeCar | null>(null);
  const [lookupKey, setLookupKey] = useState(0);
  const { user } = useAuth();
  const [presenting, setPresenting] = useState(false);
  const [pinned, setPinned] = useState<{ term: number; cash: number; payment: number; breakeven: number | null; series: SimPoint[] } | null>(null);
  const [lookup, setLookup] = useState("");
  const [vinStatus, setVinStatus] = useState<"idle" | "loading" | "epa" | "estimate" | "none">("idle");
  const [sheetStatus, setSheetStatus] = useState<"idle" | "syncing" | "ok" | "error">("idle");
  const [sheetError, setSheetError] = useState<string | null>(null);
  const vinReq = useRef(0);
  const decode = useServerFn(decodeVin);
  const syncSheet = useServerFn(fetchSheetInventory);

  const setD = <K extends keyof DealInputs>(k: K) => (v: DealInputs[K]) => setDeal((d) => ({ ...d, [k]: v }));
  const setC = <K extends keyof CurrentInputs>(k: K) => (v: CurrentInputs[K]) => setCurrent((c) => ({ ...c, [k]: v }));

  const applyVehicle = (v: Vehicle, lookupVin = true) => {
    setSelected(v);
    setDeal((d) => ({
      ...d,
      price: v.price,
      mpg: v.epaMpg ?? d.mpg,
      maint: v.estMaint ?? estimateMaint(makeFromModel(v.makeModel), v.miles),
    }));
    setVinStatus("idle");
    if (lookupVin && v.vin.length >= 11) void lookupSpecs(v);
  };

  const lookupSpecs = async (v: Vehicle) => {
    const id = ++vinReq.current;
    setVinStatus("loading");
    try {
      const s = await decode({ data: { vin: v.vin, year: v.year, miles: v.miles } });
      if (id !== vinReq.current) return;
      setVinStatus(s.source);
      if (s.source === "none") return;
      setSelected((cur) =>
        cur.stock === v.stock ? { ...cur, cityMpg: s.cityMpg, hwyMpg: s.hwyMpg, engine: s.engine ?? cur.engine ?? null } : cur,
      );
      setDeal((d) => ({
        ...d,
        mpg: s.source === "epa" || v.epaMpg == null ? (s.combMpg ?? d.mpg) : d.mpg,
        maint: v.estMaint == null && s.estMaint ? s.estMaint : d.maint,
      }));
    } catch {
      if (id === vinReq.current) setVinStatus("none");
    }
  };

  // Show the last saved inventory instantly, then refresh from the shared sheet.
  useEffect(() => {
    let shown: Vehicle | undefined;
    try {
      const saved = JSON.parse(localStorage.getItem("desk.inventory") || "null");
      if (Array.isArray(saved) && saved.length) {
        setInventory(saved);
        setSource(localStorage.getItem("desk.source") || "Saved units");
        shown = saved[0];
        applyVehicle(saved[0], false);
      }
    } catch {
      /* ignore bad saved data */
    }

    void runSheetSync(getSheetUrl(), shown?.stock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncReq = useRef(0);
  const selectedStockRef = useRef(selected.stock);
  selectedStockRef.current = selected.stock;
  const runSheetSync = async (url: string, keepStock?: string) => {
    const id = ++syncReq.current;
    setSheetStatus("syncing");
    try {
      const res = await syncSheet({ data: { url } });
      if (id !== syncReq.current) return;
      if (res.error) {
        setSheetStatus("error");
        setSheetError(res.error);
        return;
      }
      setSheetStatus("ok");
      setSheetError(null);
      const keep = keepStock && res.vehicles.find((v) => v.stock === keepStock);
      replaceInventory(res.vehicles, `Sheet: ${res.tabName ?? "live"}`, keep || res.vehicles[0]);
    } catch {
      if (id !== syncReq.current) return;
      setSheetStatus("error");
      setSheetError("Couldn't reach the sheet. Showing the last saved units.");
    }
  };

  // Signed in: use the sheet link saved to the account, so a new phone picks it up.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getAccountScriptUrl()
      .then((url) => {
        if (cancelled || !url || url === getSheetUrl()) return;
        saveSheetUrl(url);
        void runSheetSync(url, selectedStockRef.current);
      })
      .catch(() => {
        /* keep the device link */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadSavedDeal = (d: SavedDeal) => {
    const live = d.proposedStock ? inventory.find((v) => v.stock === d.proposedStock) : undefined;
    const v = d.vehicle ?? live;
    if (v) applyVehicle(v, false);
    if (d.deal) setDeal(d.deal);
    if (d.current) setCurrent(d.current);
    setTradeCar(d.tradeCar);
    setLookupKey((k) => k + 1);
    setActiveDeal(d);
    toast.success(`Opened ${d.customerName}'s deal`);
  };

  const buildDraft = (meta: { customerName: string; customerPhone: string; notes: string }) => ({
    ...meta,
    vehicle: selected,
    tradeCar,
    deal,
    current,
  });

  const replaceInventory = (list: Vehicle[], src: string, pick: Vehicle | undefined = list[0]) => {
    setInventory(list);
    setSource(src);
    localStorage.setItem("desk.inventory", JSON.stringify(list));
    localStorage.setItem("desk.source", src);
    if (src.startsWith("Sheet")) {
      setSheetStatus("ok");
      setSheetError(null);
    }
    if (pick) applyVehicle(pick);
  };

  const handleLookup = () => {
    const v = findByStock(inventory, lookup);
    if (!v) {
      toast.error(`Stock #${lookup.trim()} isn't in the loaded inventory`);
      return;
    }
    applyVehicle(v);
    setLookup("");
    (document.activeElement as HTMLElement | null)?.blur();
    toast.success(`Loaded #${v.stock}`);
  };

  const sim = useMemo(() => simulate(deal, current, selected.miles), [deal, current, selected.miles]);
  const month = Math.min(Math.max(1, scrub), deal.term);
  const point = sim.series[month] ?? sim.series[sim.series.length - 1]!;
  const odo = Math.round(selected.miles + (sim.annualMiles * month) / 12);
  const title = `${selected.year} ${selected.makeModel} ${selected.desc}`.trim();

  const breakevenText =
    sim.breakevenMonth === 0
      ? "Positive equity from day one"
      : sim.breakevenMonth
        ? `Positive equity at month ${sim.breakevenMonth}`
        : "Upside down through the term";

  const script = useMemo(() => {
    const saves = sim.trueDelta >= 0;
    const lines = [
      `Right now you're spending about ${money(sim.currentTotal)} a month on your current car: ${money(current.currPay)} payment, ${money(sim.currGas)} in gas and ${money(current.currMaint)} in repairs.`,
      `In the ${title}, your payment would be ${money(sim.payment)}. At ${deal.mpg} MPG you ${sim.gasSave >= 0 ? `save ${money(sim.gasSave)}` : `spend ${money(-sim.gasSave)} more`} on gas, and maintenance ${sim.maintSave >= 0 ? `drops by ${money(sim.maintSave)}` : `rises by ${money(-sim.maintSave)}`} a month.`,
      saves
        ? `All in, you actually keep ${money(sim.trueDelta)} more in your pocket every month.`
        : `All in, that's only ${money(-sim.trueDelta)} a month more out of pocket — about ${money(-sim.trueDelta / 30)} a day — for a newer, warrantied vehicle.`,
      sim.breakevenMonth != null && sim.breakevenMonth > 0
        ? `And by month ${sim.breakevenMonth} you're building positive trade equity.`
        : sim.breakevenMonth === 0
          ? "And you start with positive equity from day one."
          : "",
    ];
    return lines.filter(Boolean).join(" ");
  }, [sim, current.currPay, current.currMaint, deal.mpg, title]);

  const termOptions = useMemo(
    () =>
      TERMS.map((t) => {
        const s = simulate({ ...deal, term: t }, current, selected.miles);
        return { term: t, payment: s.payment, breakeven: s.breakevenMonth };
      }),
    [deal, current, selected.miles],
  );
  const milestones = useMemo(
    () => chartMilestones(selected.year, selected.miles, sim.annualMiles, sim.breakevenMonth, deal.term),
    [selected.year, selected.miles, sim.annualMiles, sim.breakevenMonth, deal.term],
  );
  const moreDown = useMemo(() => simulate({ ...deal, cash: deal.cash + 1000 }, current, selected.miles), [deal, current, selected.miles]);

  const shareSummary = async () => {
    const code = encodeSummary({ title, startMiles: selected.miles, modelYear: selected.year, deal, current });
    const url = `${window.location.origin}/summary?d=${code}`;
    const text = `Here's the summary for the ${title}: ${money(sim.payment)}/mo, feels like ${money(sim.feelsLike)}/mo.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Your deal summary", text, url });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(url);
    toast.success("Summary link copied", { action: { label: "Open", onClick: () => window.open(url, "_blank") } });
  };

  const show = (t: Tab) => cn(tab === t ? "block" : "hidden", "lg:block");
  const quick = inventory.slice(0, 8);

  return (
    <div className="min-h-dvh pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-10">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/icons/icon-192.png" alt="" width={36} height={36} className="h-9 w-9 rounded-xl" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold leading-tight">Deal Desk</h1>
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                {sheetStatus === "syncing" && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
                <span className="truncate">
                  {presenting ? (
                    "Customer view"
                  ) : (
                    <>
                      {sheetStatus === "syncing" ? "Loading shared sheet…" : source}
                      {sheetStatus === "error" && " · sheet offline"}
                    </>
                  )}
                </span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-10 w-10", presenting && "bg-primary/15 text-primary")}
              onClick={() => setPresenting((p) => !p)}
              aria-pressed={presenting}
              aria-label={presenting ? "Show internal info" : "Customer view: hide internal info"}
              title={presenting ? "Show internal info" : "Customer view"}
            >
              {presenting ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="secondary" size="sm" className="h-10" onClick={() => void shareSummary()} aria-label="Share summary">
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Share summary</span>
            </Button>
            {!presenting && (
              <Button variant="secondary" size="sm" className="h-10" onClick={() => setDealsOpen(true)} aria-label="Saved deals">
                <FolderOpen className="h-4 w-4" />
                <span className="hidden sm:inline">{activeDeal ? activeDeal.customerName : "Deals"}</span>
              </Button>
            )}
            {!presenting && (
              <Button variant="secondary" size="sm" className="h-10" onClick={() => setPanelOpen(true)}>
                <Warehouse className="h-4 w-4" />
                <span className="hidden sm:inline">Inventory</span>
              </Button>
            )}
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleLookup();
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                placeholder="Stock # (e.g. 2-48134)"
                enterKeyHint="go"
                autoCapitalize="characters"
                className="num h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-base outline-none placeholder:font-sans placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <Button type="submit" className="h-11 px-5" disabled={!lookup.trim()}>
              Load
            </Button>
          </form>

          <div className={cn("no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4", presenting && "hidden")}>
            {quick.map((v) => (
              <button
                key={v.stock}
                onClick={() => applyVehicle(v)}
                className={cn(
                  "num shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors",
                  v.stock === selected.stock
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground active:bg-accent",
                )}
              >
                #{v.stock}
              </button>
            ))}
          </div>
        </div>

        {/* Always-visible numbers on phones */}
        <div className="grid grid-cols-2 border-t border-border lg:hidden">
          <div className="px-4 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Payment</div>
            <div className="num text-lg font-bold">{money(sim.payment)}<span className="text-xs font-medium text-muted-foreground">/mo</span></div>
          </div>
          <div className="border-l border-border px-4 py-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Real cash flow</div>
            <div className={cn("num text-lg font-bold", sim.trueDelta >= 0 ? "text-gain" : "text-cost")}>
              {sim.trueDelta >= 0 ? "Saves " : "Adds "}
              {money(Math.abs(sim.trueDelta))}
              <span className="text-xs font-medium text-muted-foreground">/mo</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 pt-4 lg:grid-cols-12 lg:gap-6 lg:pt-6">
        <div className="space-y-4 lg:col-span-5">
          {/* Proposed vehicle */}
          <section className={cn(show("deal"), "overflow-hidden rounded-2xl border border-border bg-card")}>
            <div className="bg-gradient-to-br from-primary/15 via-transparent to-transparent p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Proposed unit</div>
                  <h2 className="mt-1 text-xl font-semibold leading-tight">{title}</h2>
                </div>
                <span className="num shrink-0 rounded-md bg-primary px-2 py-1 text-xs font-bold text-primary-foreground">#{selected.stock}</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Chip icon={<Gauge className="h-3.5 w-3.5" />} label="Odometer" value={`${num(selected.miles)} mi`} />
                <Chip
                  icon={<Fuel className="h-3.5 w-3.5" />}
                  label="Fuel economy"
                  value={`${deal.mpg} MPG`}
                  sub={selected.cityMpg && selected.hwyMpg ? `${selected.cityMpg} city / ${selected.hwyMpg} hwy` : undefined}
                />
                <Chip icon={<Wrench className="h-3.5 w-3.5" />} label="Maintenance" value={`${money(deal.maint)}/mo`} />
                {!presenting && (
                  <>
                    <Chip icon={<CalendarClock className="h-3.5 w-3.5" />} label="On lot" value={`${selected.days} days`} />
                    <Chip icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={`${selected.loc} · ${selected.stat || "S"}`} />
                  </>
                )}
                <Chip
                  icon={vinStatus === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Car className="h-3.5 w-3.5" />}
                  label="Engine"
                  value={vinStatus === "loading" ? "Checking EPA…" : selected.engine || "—"}
                  sub={vinStatus === "epa" ? "EPA verified" : vinStatus === "estimate" ? "Estimated from VIN" : undefined}
                />
              </div>
              {selected.vin && <div className="num mt-3 truncate text-xs text-muted-foreground">VIN {selected.vin}</div>}
            </div>
          </section>

          {/* Deal structure */}
          <Panel title="Deal structure" kicker="Desk" className={show("deal")}>
            <div className="space-y-6">
              <SliderField label="Selling price" value={deal.price} onChange={setD("price")} min={10000} max={75000} step={250} prefix="$" decimals={0} />
              <SliderField label="Cash down" value={deal.cash} onChange={setD("cash")} min={0} max={20000} step={250} prefix="$" decimals={0} />
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Trade value">
                    <NumInput label="Trade value" value={deal.tradeValue} onChange={setD("tradeValue")} prefix="$" decimals={0} />
                  </Field>
                  <Field label="Trade payoff">
                    <NumInput label="Trade payoff" value={deal.tradePayoff} onChange={setD("tradePayoff")} prefix="$" decimals={0} />
                  </Field>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Net trade {sim.netTrade < 0 && "(rolled into loan)"}</span>
                  <span className={cn("num font-semibold", sim.netTrade < 0 ? "text-loss" : sim.netTrade > 0 && "text-gain")}>{signedMoney(sim.netTrade)}</span>
                </div>
                {sim.tradeTaxSavings > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
                    <BadgePercent className="h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <strong>Hidden savings:</strong> trade cuts sales tax by <strong className="num text-primary">{money(sim.tradeTaxSavings)}</strong>
                    </span>
                  </div>
                )}
              </div>
              <SliderField label="APR" value={deal.apr} onChange={setD("apr")} min={0} max={18.9} step={0.25} suffix="%" />
              <div className="space-y-2">
                <div className="text-sm font-medium">Term</div>
                <div className="grid grid-cols-4 gap-2">
                  {TERMS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setD("term")(t)}
                      className={cn(
                        "num h-11 rounded-lg border text-sm font-semibold transition-colors",
                        deal.term === t ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background/60 active:bg-accent",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sales tax">
                  <NumInput label="Sales tax rate" value={deal.taxRate} onChange={setD("taxRate")} suffix="%" decimals={3} />
                </Field>
                <Field label="Title & fees">
                  <NumInput label="Title, registration and doc fees" value={deal.fees} onChange={setD("fees")} prefix="$" decimals={0} />
                </Field>
                <Field label="Unit MPG">
                  <NumInput label="Proposed MPG" value={deal.mpg} onChange={setD("mpg")} suffix="mpg" decimals={1} />
                </Field>
                <Field label="Unit maint.">
                  <NumInput label="Proposed maintenance per month" value={deal.maint} onChange={setD("maint")} prefix="$" suffix="/mo" decimals={0} />
                </Field>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">Trade lowers taxable price</span>
                  <span className="block text-xs text-muted-foreground">On in NY and most states</span>
                </span>
                <Switch checked={deal.tradeTaxCredit} onCheckedChange={setD("tradeTaxCredit")} aria-label="Trade lowers taxable price" />
              </label>
              <div className="flex justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">Sales tax</span>
                <span className="num font-semibold">{money(sim.salesTax)}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">Amount financed</span>
                <span className="num font-semibold">{money(sim.financed)}</span>
              </div>
            </div>
          </Panel>

          {/* Current car */}
          <Panel title="Customer's current car" kicker="Today" className={show("costs")}>
            <div className="space-y-6">
              <CurrentCarLookup
                milesPerYear={sim.annualMiles}
                key={lookupKey}
                onEstimate={({ mpg, maint, car }) => {
                  setTradeCar(car);
                  setCurrent((c) => ({ ...c, currMpg: mpg ?? c.currMpg, currMaint: maint }));
                }}
              />
              {activeDeal && tradeCar?.label && (
                <p className="-mt-3 text-xs text-muted-foreground">
                  Saved trade: <span className="text-foreground">{tradeCar.label}</span>
                  {tradeCar.vin && <span className="num"> · VIN {tradeCar.vin}</span>}
                </p>
              )}
              <SliderField
                label="Daily driving"
                value={current.commute}
                onChange={setC("commute")}
                min={10}
                max={120}
                step={2}
                suffix="mi/day"
                decimals={0}
                hint={`${num(sim.annualMiles)} miles a year`}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Current payment">
                  <NumInput label="Current payment" value={current.currPay} onChange={setC("currPay")} prefix="$" suffix="/mo" decimals={0} />
                </Field>
                <Field label="Current MPG">
                  <NumInput label="Current MPG" value={current.currMpg} onChange={setC("currMpg")} suffix="mpg" decimals={1} />
                </Field>
                <Field label="Current repairs">
                  <NumInput label="Current repairs per month" value={current.currMaint} onChange={setC("currMaint")} prefix="$" suffix="/mo" decimals={0} />
                </Field>
                <Field label="Gas price">
                  <NumInput label="Gas price per gallon" value={current.gasPrice} onChange={setC("gasPrice")} prefix="$" suffix="/gal" />
                </Field>
                <Field label="Insurance change">
                  <NumInput label="Insurance change per month" value={current.insDelta} onChange={setC("insDelta")} prefix="$" suffix="/mo" decimals={0} />
                </Field>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4 lg:col-span-7">
          {/* KPIs */}
          <div className={show("deal")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              icon={<Wallet className="h-4 w-4" />}
              label="Loan payment"
              value={`${money(sim.payment)}/mo`}
              sub={`${signedMoney(sim.paymentDelta)}/mo vs current payment`}
            />
            <Kpi
              icon={<Fuel className="h-4 w-4" />}
              label="Running costs"
              value={`${sim.opSavings >= 0 ? "Saves" : "Adds"} ${money(Math.abs(sim.opSavings))}/mo`}
              sub={`Gas ${sim.gasSave >= 0 ? "saves " : "+"}${money(Math.abs(sim.gasSave))} · Maint ${sim.maintSave >= 0 ? "saves " : "+"}${money(Math.abs(sim.maintSave))}`}
              tone={sim.opSavings >= 0 ? "gain" : "cost"}
            />
            <FeelsLikeKpi feelsLike={sim.feelsLike} trueDelta={sim.trueDelta} />
          </div>
          </div>

          {/* Compare */}
          <Panel
            title="Total monthly outflow"
            kicker="Side by side"
            className={show("costs")}
            action={
              <Button variant="ghost" size="sm" className="h-9 text-primary" onClick={() => void shareSummary()}>
                <Send className="h-4 w-4" /> Send
              </Button>
            }
          >
            <CompareBars
              rows={[
                {
                  label: "Current car",
                  parts: [
                    { k: "Payment", v: current.currPay, c: "bg-pay" },
                    { k: "Gas", v: sim.currGas, c: "bg-fuel" },
                    { k: "Repairs", v: current.currMaint, c: "bg-maint" },
                  ],
                },
                {
                  label: `Stock #${selected.stock}`,
                  parts: [
                    { k: "Payment", v: sim.payment, c: "bg-pay" },
                    { k: "Gas", v: sim.propGas, c: "bg-fuel" },
                    { k: "Repairs", v: deal.maint, c: "bg-maint" },
                    { k: "Insurance +", v: Math.max(0, current.insDelta), c: "bg-ins" },
                  ],
                },
              ]}
            />
            <div className={cn("mt-4 rounded-xl p-3 text-center text-sm font-semibold", sim.trueDelta >= 0 ? "bg-gain/15 text-gain" : "bg-cost/15 text-cost")}>
              {sim.trueDelta >= 0
                ? `Customer keeps ${money(sim.trueDelta)} more every month`
                : `${money(-sim.trueDelta)}/mo more — ${money(-sim.trueDelta / 30)} a day`}
            </div>
          </Panel>

          {/* Equity */}
          <Panel
            title="Equity crossover"
            kicker="Depreciation twin"
            className={show("equity")}
            action={
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", sim.breakevenMonth != null ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss")}>
                {breakevenText}
              </span>
            }
          >
            <div className="mb-2 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><i className="h-2 w-4 rounded-full bg-gain" /> Est. trade value</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-4 rounded-full bg-cost" /> Loan payoff</span>
            </div>
            <div className="mb-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Compare terms</div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() =>
                    setPinned((p) =>
                      p ? null : { term: deal.term, cash: deal.cash, payment: sim.payment, breakeven: sim.breakevenMonth, series: sim.series },
                    )
                  }
                >
                  {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  {pinned ? "Unpin" : "Pin this deal"}
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {termOptions.map((o) => (
                  <button
                    key={o.term}
                    type="button"
                    onClick={() => setD("term")(o.term)}
                    className={cn(
                      "rounded-lg border p-2 text-left transition-colors",
                      deal.term === o.term ? "border-primary bg-primary/10" : "border-input bg-background/60 active:bg-accent",
                    )}
                  >
                    <div className="num text-sm font-semibold">{o.term} mo</div>
                    <div className="num text-xs text-muted-foreground">{money(o.payment)}/mo</div>
                    <div className={cn("num mt-1 text-[11px] font-medium", o.breakeven != null ? "text-gain" : "text-loss")}>
                      {o.breakeven === 0 ? "Equity day 1" : o.breakeven ? `Equity mo ${o.breakeven}` : "Upside down"}
                    </div>
                  </button>
                ))}
              </div>
              {pinned ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="mr-1 inline-block h-0.5 w-4 border-t-2 border-dashed border-muted-foreground align-middle" />
                  Pinned: {pinned.term} mo, {money(pinned.payment)}/mo,{" "}
                  {pinned.breakeven === 0 ? "equity from day one" : pinned.breakeven != null ? `equity at month ${pinned.breakeven}` : "upside down"}
                  {pinned.breakeven != null && sim.breakevenMonth != null && pinned.breakeven !== sim.breakevenMonth && (
                    <strong className={cn("ml-1", sim.breakevenMonth < pinned.breakeven ? "text-gain" : "text-loss")}>
                      → now month {sim.breakevenMonth} ({Math.abs(pinned.breakeven - sim.breakevenMonth)} months{" "}
                      {sim.breakevenMonth < pinned.breakeven ? "sooner" : "later"})
                    </strong>
                  )}
                </p>
              ) : (
                moreDown.breakevenMonth != null &&
                sim.breakevenMonth != null &&
                moreDown.breakevenMonth < sim.breakevenMonth && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    With $1,000 more down: {money(moreDown.payment)}/mo and equity at month{" "}
                    <strong className="text-gain">{moreDown.breakevenMonth}</strong> ({sim.breakevenMonth - moreDown.breakevenMonth} months sooner)
                  </p>
                )
              )}
            </div>
            <EquityChart
              series={sim.series}
              month={month}
              breakeven={sim.breakevenMonth}
              onScrub={setScrub}
              pinned={pinned}
              milestones={milestones}
            />
            <p className="mt-1 text-center text-[11px] text-muted-foreground">Drag across the chart, use the slider, or tap a milestone</p>
            <MilestoneChips m={milestones} onJump={setScrub} active={month} />

            <div className="mt-4 rounded-xl border border-border bg-background/50 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <strong className="num text-sm">Month {month} <span className="text-muted-foreground">(Year {(month / 12).toFixed(1)})</span></strong>
                <strong className={cn("num text-sm", point.equity >= 0 ? "text-gain" : "text-loss")}>
                  {point.equity >= 0 ? `+${money(point.equity)} equity` : `${money(point.equity)} upside down`}
                </strong>
              </div>
              <Slider aria-label="Month" className="my-4 py-2" value={[month]} min={1} max={deal.term} step={1} onValueChange={([v]) => setScrub(v ?? 1)} />
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Est. value" value={money(point.value)} className="text-gain" />
                <Stat label="Loan payoff" value={money(point.balance)} className="text-cost" />
                <Stat label="Odometer" value={`${num(odo)}`} sub="mi" />
              </div>
            </div>
          </Panel>

          {/* Script */}
          {!presenting && (
          <Panel title="Closing talk track" kicker="Say it like this" className={show("equity")}>
            <p className="text-[15px] leading-relaxed">{script}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                className="h-11"
                onClick={async () => {
                  await navigator.clipboard.writeText(script);
                  toast.success("Copied");
                }}
              >
                <Copy className="h-4 w-4" /> Copy
              </Button>
              <Button
                className="h-11"
                onClick={async () => {
                  const text = `${title} (#${selected.stock})\n${script}`;
                  if (navigator.share) {
                    try {
                      await navigator.share({ title: "Deal summary", text });
                    } catch {
                      /* share cancelled */
                    }
                  } else {
                    await navigator.clipboard.writeText(text);
                    toast.success("Copied — sharing isn't available on this device");
                  }
                }}
              >
                <Share2 className="h-4 w-4" /> Share
              </Button>
            </div>
          </Panel>
          )}
        </div>
      </main>

      {/* Bottom nav (phones / tablets) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Sections">
        <div className={cn("mx-auto grid max-w-lg", presenting ? "grid-cols-3" : "grid-cols-4")}>
          <NavBtn active={tab === "deal"} onClick={() => setTab("deal")} icon={<Wallet className="h-5 w-5" />} label="Deal" />
          <NavBtn active={tab === "costs"} onClick={() => setTab("costs")} icon={<Fuel className="h-5 w-5" />} label="Costs" />
          <NavBtn active={tab === "equity"} onClick={() => setTab("equity")} icon={<LineChart className="h-5 w-5" />} label="Equity" />
          {!presenting && <NavBtn active={panelOpen} onClick={() => setPanelOpen(true)} icon={<Warehouse className="h-5 w-5" />} label="Stock" />}
        </div>
      </nav>

      <InventoryPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        inventory={inventory}
        source={source}
        selectedStock={selected.stock}
        sheetError={sheetError}
        onSelect={(v) => applyVehicle(v)}
        onReplace={(list, src) => replaceInventory(list, src)}
      />
      <SavedDealsPanel
        open={dealsOpen}
        onOpenChange={setDealsOpen}
        activeDeal={activeDeal}
        buildDraft={buildDraft}
        onLoad={loadSavedDeal}
        onSaved={setActiveDeal}
      />
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <button
      onClick={() => {
        onClick();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      aria-current={active ? "page" : undefined}
      className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-primary" : "text-muted-foreground")}
    >
      <span className={cn("rounded-full px-4 py-1 transition-colors", active && "bg-primary/15")}>{icon}</span>
      {label}
    </button>
  );
}

function Chip({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string; sub?: string | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="num mt-1 truncate text-sm font-semibold">{value}</div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone, highlight }: { icon: ReactNode; label: string; value: string; sub: string; tone?: "gain" | "cost"; highlight?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-4", highlight ? "border-primary/40 bg-primary/10" : "border-border bg-card")}>
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("num mt-2 text-2xl font-bold", tone === "gain" && "text-gain", tone === "cost" && "text-cost")}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function FeelsLikeKpi({ feelsLike, trueDelta }: { feelsLike: number; trueDelta: number }) {
  const saves = trueDelta >= 0;
  return (
    <div className="kpi-hero relative rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gain/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gain shadow-[0_0_14px_-2px_var(--gain)]">
          <LineChart className="h-3.5 w-3.5" />
          Feels like
        </span>
      </div>
      <div className="num mt-2 text-3xl font-extrabold text-gain">
        {money(feelsLike)}
        <span className="text-base font-semibold">/mo</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Real cash flow{" "}
        <strong className={cn("num", saves ? "text-gain" : "text-cost")}>
          {saves ? "saves" : "adds"} {money(Math.abs(trueDelta))}/mo
        </strong>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, className }: { label: string; value: string; sub?: string; className?: string }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("num mt-0.5 text-sm font-bold", className)}>
        {value}
        {sub && <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}
