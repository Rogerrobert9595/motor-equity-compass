import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarClock,
  Copy,
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

import { CurrentCarLookup } from "@/components/desk/CurrentCarLookup";
import { EquityChart } from "@/components/desk/EquityChart";
import { Field, money, num, NumInput, Panel, signedMoney, SliderField } from "@/components/desk/fields";
import { InventoryPanel } from "@/components/desk/InventoryPanel";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { estimateMaint, makeFromModel, simulate, type CurrentInputs, type DealInputs } from "@/lib/deal-math";
import { findByStock, SAMPLE_INVENTORY, type Vehicle } from "@/lib/inventory";
import { getSheetUrl } from "@/lib/sheet-config";
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
  const [deal, setDeal] = useState<DealInputs>({ price: 23999, down: 2500, apr: 6.9, term: 72, taxFees: 1950, mpg: 27, maint: 58 });
  const [current, setCurrent] = useState<CurrentInputs>({ commute: 42, currPay: 310, currMpg: 18, currMaint: 165, gasPrice: 3.45, insDelta: 18 });
  const [scrub, setScrub] = useState(36);
  const [tab, setTab] = useState<Tab>("deal");
  const [panelOpen, setPanelOpen] = useState(false);
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

    let cancelled = false;
    setSheetStatus("syncing");
    syncSheet({ data: { url: getSheetUrl() } })
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setSheetStatus("error");
          setSheetError(res.error);
          return;
        }
        setSheetStatus("ok");
        setSheetError(null);
        const keep = shown && res.vehicles.find((v) => v.stock === shown!.stock);
        replaceInventory(res.vehicles, `Sheet: ${res.tabName ?? "live"}`, keep ?? res.vehicles[0]);
      })
      .catch(() => {
        if (cancelled) return;
        setSheetStatus("error");
        setSheetError("Couldn't reach the sheet. Showing the last saved units.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                  {sheetStatus === "syncing" ? "Loading shared sheet…" : source}
                  {sheetStatus === "error" && " · sheet offline"}
                </span>
              </p>
            </div>
            <Button variant="secondary" size="sm" className="h-10" onClick={() => setPanelOpen(true)}>
              <Warehouse className="h-4 w-4" />
              <span className="hidden sm:inline">Inventory</span>
            </Button>
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

          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
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
                <Chip icon={<CalendarClock className="h-3.5 w-3.5" />} label="On lot" value={`${selected.days} days`} />
                <Chip icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={`${selected.loc} · ${selected.stat || "S"}`} />
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
              <SliderField label="Cash down + net trade" value={deal.down} onChange={setD("down")} min={-5000} max={20000} step={250} prefix="$" decimals={0} hint="Negative = rolling in negative equity" />
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Tax, title & fees">
                  <NumInput label="Tax, title and fees" value={deal.taxFees} onChange={setD("taxFees")} prefix="$" decimals={0} />
                </Field>
                <Field label="Unit MPG">
                  <NumInput label="Proposed MPG" value={deal.mpg} onChange={setD("mpg")} suffix="mpg" decimals={1} />
                </Field>
                <Field label="Unit maint.">
                  <NumInput label="Proposed maintenance per month" value={deal.maint} onChange={setD("maint")} prefix="$" suffix="/mo" decimals={0} />
                </Field>
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
                onEstimate={({ mpg, maint }) =>
                  setCurrent((c) => ({ ...c, currMpg: mpg ?? c.currMpg, currMaint: maint }))
                }
              />
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
            <Kpi
              icon={<LineChart className="h-4 w-4" />}
              label="Real cash flow"
              value={`${sim.trueDelta >= 0 ? "Saves" : "Adds"} ${money(Math.abs(sim.trueDelta))}/mo`}
              sub={`Feels like a ${money(sim.feelsLike)} payment`}
              tone={sim.trueDelta >= 0 ? "gain" : "cost"}
              highlight
            />
          </div>
          </div>

          {/* Compare */}
          <Panel title="Total monthly outflow" kicker="Side by side" className={show("costs")}>
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
            <EquityChart series={sim.series} month={month} breakeven={sim.breakevenMonth} onScrub={setScrub} />
            <p className="mt-1 text-center text-[11px] text-muted-foreground">Drag across the chart or use the slider</p>

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
        </div>
      </main>

      {/* Bottom nav (phones / tablets) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Sections">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          <NavBtn active={tab === "deal"} onClick={() => setTab("deal")} icon={<Wallet className="h-5 w-5" />} label="Deal" />
          <NavBtn active={tab === "costs"} onClick={() => setTab("costs")} icon={<Fuel className="h-5 w-5" />} label="Costs" />
          <NavBtn active={tab === "equity"} onClick={() => setTab("equity")} icon={<LineChart className="h-5 w-5" />} label="Equity" />
          <NavBtn active={panelOpen} onClick={() => setPanelOpen(true)} icon={<Warehouse className="h-5 w-5" />} label="Stock" />
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

interface BarRow {
  label: string;
  parts: { k: string; v: number; c: string }[];
}

function CompareBars({ rows }: { rows: BarRow[] }) {
  const totals = rows.map((r) => r.parts.reduce((s, p) => s + Math.max(0, p.v), 0));
  const max = Math.max(1, ...totals);
  return (
    <div className="space-y-5">
      {rows.map((r, i) => {
        const total = totals[i] ?? 0;
        return (
        <div key={r.label}>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-sm font-medium">{r.label}</span>
            <span className="num text-lg font-bold">{money(total)}<span className="text-xs text-muted-foreground">/mo</span></span>
          </div>
          <div className="flex h-7 overflow-hidden rounded-lg bg-muted" style={{ width: `${(total / max) * 100}%` }}>
            {r.parts.map((p) =>
              p.v > 0 ? <div key={p.k} className={cn(p.c, "h-full")} style={{ width: `${(p.v / (total || 1)) * 100}%` }} title={`${p.k} ${money(p.v)}`} /> : null,
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {r.parts.map((p) => (
              <span key={p.k} className="flex items-center gap-1">
                <i className={cn("h-2 w-2 rounded-full", p.c)} />
                {p.k} <span className="num text-foreground">{money(p.v)}</span>
              </span>
            ))}
          </div>
        </div>
        );
      })}
    </div>
  );
}
