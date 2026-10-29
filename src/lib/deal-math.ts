// Pure deal / ownership math shared by the desk screens and tests.

export interface DealInputs {
  price: number;
  cash: number; // cash down
  tradeValue: number; // allowance for the customer's trade
  tradePayoff: number; // what they still owe on the trade
  taxRate: number; // sales tax, percent
  tradeTaxCredit: boolean; // trade allowance lowers the taxable price (NY and most states)
  fees: number; // title, registration & doc fees rolled into the loan
  apr: number; // percent
  term: number; // months
  mpg: number;
  maint: number; // $ / month
}

/** Sales tax, trade tax credit and amount financed for a deal. */
export function dealTax(deal: Pick<DealInputs, "price" | "cash" | "tradeValue" | "tradePayoff" | "taxRate" | "tradeTaxCredit" | "fees">) {
  const trade = Math.max(0, deal.tradeValue);
  const netTrade = trade - Math.max(0, deal.tradePayoff); // negative = rolling in negative equity
  const rate = Math.max(0, deal.taxRate) / 100;
  const credited = deal.tradeTaxCredit ? Math.min(deal.price, trade) : 0;
  const taxable = Math.max(0, deal.price - credited);
  const salesTax = taxable * rate;
  const tradeTaxSavings = credited * rate;
  const financed = Math.max(0, deal.price + salesTax + Math.max(0, deal.fees) - Math.max(0, deal.cash) - netTrade);
  return { netTrade, taxable, salesTax, tradeTaxSavings, financed };
}

export interface CurrentInputs {
  commute: number; // miles per day
  currPay: number;
  currMpg: number;
  currMaint: number;
  gasPrice: number;
  insDelta: number; // extra insurance per month for the proposed unit
}

export function monthlyPayment(principal: number, aprPct: number, term: number): number {
  if (principal <= 0 || term <= 0) return 0;
  const r = aprPct / 1200;
  if (r === 0) return principal / term;
  return (principal * r) / (1 - Math.pow(1 + r, -term));
}

export function loanBalance(principal: number, aprPct: number, term: number, month: number): number {
  if (principal <= 0) return 0;
  if (month >= term) return 0;
  const r = aprPct / 1200;
  const pmt = monthlyPayment(principal, aprPct, term);
  if (r === 0) return Math.max(0, principal - pmt * month);
  const g = Math.pow(1 + r, month);
  return Math.max(0, principal * g - (pmt * (g - 1)) / r);
}

export const annualMiles = (milesPerDay: number) => milesPerDay * 365;

export function monthlyFuelCost(milesPerYear: number, mpg: number, gasPrice: number): number {
  if (mpg <= 0) return 0;
  return (milesPerYear / 12 / mpg) * gasPrice;
}

export function odometerAt(startMiles: number, milesPerYear: number, month: number): number {
  return Math.round(startMiles + (milesPerYear * month) / 12);
}

/** Baseline yearly miles the depreciation curve assumes. */
export const BASELINE_MILES = 12000;

/**
 * Yearly value decay: 12% at 12,000 mi/yr, plus 1.2 points for every 1,000 mi/yr
 * above that (minus 1.2 points per 1,000 below), kept between 5% and 35%.
 */
export function annualDepreciationRate(milesPerYear: number): number {
  const rate = 0.12 + ((milesPerYear - BASELINE_MILES) / 1000) * 0.012;
  return Math.min(0.35, Math.max(0.05, rate));
}

/**
 * Wholesale/trade value estimate: ~8% retail-to-trade gap at drive-off,
 * then the mileage-aware yearly decay above. Never below 10% of price.
 */
export function vehicleValue(price: number, month: number, milesPerYear: number): number {
  const curve = price * 0.92 * Math.pow(1 - annualDepreciationRate(milesPerYear), month / 12);
  return Math.max(price * 0.1, curve);
}

export interface SimPoint {
  month: number;
  value: number;
  balance: number;
  equity: number;
}

export function simulate(deal: DealInputs, current: CurrentInputs, startMiles: number) {
  const tax = dealTax(deal);
  const financed = tax.financed;
  const payment = monthlyPayment(financed, deal.apr, deal.term);
  const miles = annualMiles(current.commute);

  const currGas = monthlyFuelCost(miles, current.currMpg, current.gasPrice);
  const propGas = monthlyFuelCost(miles, deal.mpg, current.gasPrice);
  const gasSave = currGas - propGas;
  const maintSave = current.currMaint - deal.maint;
  const opSavings = gasSave + maintSave; // positive = proposed is cheaper to run

  const currentTotal = current.currPay + currGas + current.currMaint;
  const proposedTotal = payment + propGas + deal.maint + current.insDelta;
  const trueDelta = currentTotal - proposedTotal; // positive = customer keeps more cash
  const feelsLike = payment - opSavings + current.insDelta;

  const series: SimPoint[] = [];
  let breakevenMonth: number | null = null;
  for (let m = 0; m <= deal.term; m++) {
    const value = vehicleValue(deal.price, m, miles);
    const balance = loanBalance(financed, deal.apr, deal.term, m);
    const equity = value - balance;
    if (breakevenMonth === null && equity >= 0) breakevenMonth = m;
    series.push({ month: m, value, balance, equity });
  }

  return {
    financed,
    salesTax: tax.salesTax,
    tradeTaxSavings: tax.tradeTaxSavings,
    netTrade: tax.netTrade,
    payment,
    paymentDelta: payment - current.currPay,
    annualMiles: miles,
    currGas,
    propGas,
    gasSave,
    maintSave,
    opSavings,
    currentTotal,
    proposedTotal,
    trueDelta,
    feelsLike,
    series,
    breakevenMonth,
  };
}

export type Simulation = ReturnType<typeof simulate>;

/**
 * Just the payment and first positive-equity month for a deal — same numbers as
 * `simulate`, without building the month-by-month series. Used for the term
 * comparison cards and the "$1,000 more down" hint, which run on every drag.
 */
export function quickDeal(
  deal: Pick<DealInputs, "price" | "cash" | "tradeValue" | "tradePayoff" | "taxRate" | "tradeTaxCredit" | "fees" | "apr" | "term">,
  milesPerYear: number,
): { payment: number; breakevenMonth: number | null } {
  const financed = dealTax(deal).financed;
  const payment = monthlyPayment(financed, deal.apr, deal.term);
  for (let m = 0; m <= deal.term; m++) {
    if (vehicleValue(deal.price, m, milesPerYear) - loanBalance(financed, deal.apr, deal.term, m) >= 0) {
      return { payment, breakevenMonth: m };
    }
  }
  return { payment, breakevenMonth: null };
}

/** Ported from the Apps Script fetchPublicSpecsByVin fallback estimator. */
const BRAND_ANNUAL_MAINT: Record<string, number> = {
  TOYOTA: 490,
  HONDA: 510,
  HYUNDAI: 540,
  KIA: 560,
  BUICK: 610,
  FORD: 710,
  CHEVROLET: 730,
  GMC: 740,
  DODGE: 820,
  CHRYSLER: 760,
  RAM: 850,
  JEEP: 790,
};

export function estimateMaint(make: string, odometer: number): number {
  const base = BRAND_ANNUAL_MAINT[make.trim().toUpperCase()] ?? 680;
  const odo = odometer || 15000;
  const factor = 1 + Math.max(0, (odo - 5000) / 40000) * 0.5;
  return Math.round((base * factor) / 12);
}

export function estimateMpg(cylinders: number, displacementL: number, drive: string): number {
  const awd = /4WD|AWD|4X4/i.test(drive);
  if (cylinders >= 8) return displacementL > 6 ? 15 : 17;
  if (cylinders === 6) return awd ? 20 : 22;
  return displacementL <= 1.5 ? 29 : awd ? 25 : 28;
}

/** Guess the make from a "makeModel" string such as "Buick Encore GX". */
export function makeFromModel(makeModel: string): string {
  return (makeModel.split(/\s+/)[0] || "").toUpperCase();
}

/** Mileage choices for the customer's current car; `miles` is the value used for estimates. */
export const MILEAGE_BUCKETS = [
  { label: "Under 25,000", miles: 15000 },
  { label: "25,000 – 50,000", miles: 37500 },
  { label: "50,000 – 75,000", miles: 62500 },
  { label: "75,000 – 100,000", miles: 87500 },
  { label: "100,000 – 125,000", miles: 112500 },
  { label: "125,000 – 150,000", miles: 137500 },
  { label: "150,000 – 200,000", miles: 175000 },
  { label: "200,000+", miles: 215000 },
] as const;

/** When mileage isn't picked, assume 12,000 miles a year of age (minimum one year). */
export function assumedMiles(modelYear: number, currentYear: number): number {
  return Math.max(1, currentYear - modelYear) * 12000;
}

/**
 * AAA "Your Driving Costs" 2025: maintenance, repair & tires for a NEW car,
 * averaged over 5 years / 75,000 miles across five vehicle classes
 * (10.23, 11.91, 10.79, 11.64, 11.79 ¢/mi).
 */
export const AAA_MAINT_CENTS_PER_MILE = 11.3;
export const AAA_SOURCE_URL = "https://newsroom.aaa.com/wp-content/uploads/2025/09/AAA-Brochure-Your-Driving-Cost-9.2025.pdf";

export function aaaMonthlyMaint(milesPerYear: number): number {
  return Math.round((milesPerYear * AAA_MAINT_CENTS_PER_MILE) / 100 / 12);
}

/** Typical manufacturer service milestones (no dollar amounts — work items only). */
export const SERVICE_MILESTONES = [
  { at: 30000, label: "30k service", items: "fluids, filters, brake inspection" },
  { at: 60000, label: "60k service", items: "brakes, battery, transmission fluid, coolant" },
  { at: 90000, label: "90k service", items: "timing belt (if equipped), spark plugs, hoses" },
  { at: 100000, label: "100k service", items: "water pump, shocks/struts, suspension parts" },
  { at: 150000, label: "150k mark", items: "higher odds of engine or transmission repairs" },
] as const;

/** The last milestone the car has reached and the next one ahead of it. */
export function serviceWindow(odometer: number) {
  const passed = [...SERVICE_MILESTONES].reverse().find((m) => odometer >= m.at) ?? null;
  const next = SERVICE_MILESTONES.find((m) => odometer < m.at) ?? null;
  return { passed, next };
}

/**
 * Quick-select "upcoming service" brackets for the customer's current car.
 * Monthly averages amortize the big-ticket items over ~2 years of ownership;
 * `parts` add up to `monthly`.
 */
export const SERVICE_PILLS = [
  {
    id: "60k",
    label: "60k Major Service",
    monthly: 125,
    note: "Includes amortized 60k major service, routine oil changes and brake/battery wear",
    parts: [
      { k: "60k service (plugs, trans & coolant fluid)", v: 60 },
      { k: "Oil changes & filters", v: 35 },
      { k: "Brake & battery wear", v: 30 },
    ],
  },
  {
    id: "75-90k",
    label: "75k–90k Tires & Brakes",
    monthly: 165,
    note: "Includes amortized tires, brakes & scheduled fluid/belt service",
    parts: [
      { k: "Tires & alignment", v: 55 },
      { k: "Brake pads & rotors", v: 45 },
      { k: "Fluids, belts & hoses", v: 35 },
      { k: "Oil changes & filters", v: 30 },
    ],
  },
  {
    id: "100k",
    label: "100k+ Timing/Suspension",
    monthly: 215,
    note: "Includes amortized timing belt/water pump, shocks/struts, tires & brakes and fluid/belt service",
    parts: [
      { k: "Timing belt & water pump", v: 70 },
      { k: "Shocks, struts & suspension", v: 65 },
      { k: "Tires & brakes", v: 45 },
      { k: "Fluids, belts & oil", v: 35 },
    ],
  },
] as const;

/** Factory coverage most brands use: bumper-to-bumper 3 yr/36k, powertrain 5 yr/60k. */
export const WARRANTY = {
  basic: { months: 36, miles: 36000, label: "Bumper-to-bumper" },
  powertrain: { months: 60, miles: 60000, label: "Powertrain" },
} as const;

export interface WarrantyCliff {
  /** Loan month the coverage runs out (0 = already out at signing). */
  month: number;
  kind: keyof typeof WARRANTY;
  by: "age" | "miles";
}

/**
 * Loan month the remaining factory warranty ends, by age or miles (whichever first).
 * Age is counted from January of the model year — an estimate, since the real
 * in-service date isn't in the sheet. Returns null when both coverages have already ended.
 */
export function warrantyCliff(
  modelYear: number,
  startMiles: number,
  milesPerYear: number,
  now: { year: number; month: number },
): WarrantyCliff | null {
  const ageMonths = Math.max(0, (now.year - modelYear) * 12 + now.month);
  const perMonth = milesPerYear / 12;
  for (const kind of ["basic", "powertrain"] as const) {
    const w = WARRANTY[kind];
    const byAge = w.months - ageMonths;
    const byMiles = perMonth > 0 ? Math.ceil((w.miles - startMiles) / perMonth) : Infinity;
    const month = Math.min(byAge, byMiles);
    if (month > 0) return { month, kind, by: byAge <= byMiles ? "age" : "miles" };
  }
  return null;
}

/**
 * Best months to trade: the 12 months after equity turns positive, ending early
 * if the warranty cliff comes first (but at least 3 months long). Null if never in equity.
 */
export function tradeWindow(breakeven: number | null, cliffMonth: number | null, term: number) {
  if (breakeven == null) return null;
  const start = Math.max(1, breakeven);
  if (start >= term) return null;
  let end = Math.min(term, start + 12);
  if (cliffMonth != null && cliffMonth > start) end = Math.min(end, cliffMonth);
  end = Math.min(term, Math.max(end, start + 3));
  return { start, end };
}

export type BodyCategory = "Truck" | "SUV" | "Sedan";
export type BookCondition = "clean" | "average" | "rough";

const TRUCK_RE =
  /\b(truck|pickup|supercrew|crew\s*cab|double\s*cab|quad\s*cab|f-?150|f-?250|f-?350|silverado|sierra|ram\s*1500|ram\s*2500|tacoma|tundra|ranger|colorado|canyon|frontier|titan|gladiator|maverick|ridgeline)\b/i;
const SUV_RE =
  /\b(suv|crossover|cuv|utility|sport\s*utility|4x4|awd|4wd|rav4|cr-?v|hr-?v|pilot|passport|highlander|4runner|sequoia|venza|corolla\s*cross|equinox|blazer|trailblazer|trax|traverse|tahoe|suburban|encore|envision|enclave|terrain|acadia|yukon|tucson|santa\s*fe|palisade|kona|venue|sportage|sorento|telluride|seltos|soul|cherokee|grand\s*cherokee|wrangler|compass|renegade|wagoneer|durango|hornet|explorer|escape|edge|bronco|expedition|rogue|murano|pathfinder|armada|kicks|outback|forester|crosstrek|ascent|cx-?30|cx-?5|cx-?50|cx-?70|cx-?90|tiguan|atlas|taos|q3|q5|q7|x1|x3|x5|glc|gle|rx|nx|gx|mdx|rdx|xt4|xt5|xt6|escalade|navigator|corsair|aviator|nautilus)\b/i;

/** Categorize a bodyClass or vehicle model/description into Truck, SUV, or Sedan. */
export function inferBodyClass(bodyClass?: string | null): BodyCategory {
  const s = (bodyClass ?? "").trim();
  if (TRUCK_RE.test(s)) return "Truck";
  if (SUV_RE.test(s)) return "SUV";
  return "Sedan";
}

const FALLBACK_MSRP: Record<BodyCategory, number> = {
  Truck: 46000,
  SUV: 36000,
  Sedan: 29000,
};

/** Fallback original MSRP by body style when the exact sticker price isn't known. */
export function fallbackMsrp(bodyClass?: string | null): number {
  return FALLBACK_MSRP[inferBodyClass(bodyClass)];
}

const BASE_CATEGORY_DEPRECIATION: Record<BodyCategory, number> = {
  Truck: 0.115,
  SUV: 0.145,
  Sedan: 0.17,
};

/** Subtle brand retention adjustment around the body-class depreciation rate. */
const BRAND_DEPRECIATION_ADJ: Record<string, number> = {
  TOYOTA: -0.01,
  LEXUS: -0.01,
  HONDA: -0.008,
  SUBARU: -0.006,
  MAZDA: -0.003,
  HYUNDAI: 0,
  KIA: 0,
  FORD: 0,
  CHEVROLET: 0,
  GMC: 0,
  BUICK: 0.003,
  JEEP: 0.003,
  RAM: 0.003,
  DODGE: 0.008,
  CHRYSLER: 0.01,
};

export interface BookValueInputs {
  year: number;
  make: string;
  bodyClass?: string | null;
  baseMsrp?: number | null;
  miles: number;
  condition?: BookCondition;
  currentYear?: number;
}

export interface BookValueResult {
  tradeInClean: number;
  tradeInAverage: number;
  tradeInRough: number;
  privateParty: number;
  dealerRetail: number;
}

/**
 * Zero-cost algorithmic book value engine.
 * - Uses `baseMsrp` when provided, else falls back by `bodyClass` (Truck: $46k, SUV: $36k, Sedan: $29k).
 * - Applies a first-year drive-off retention of 84%, then a brand- & body-specific annual depreciation rate
 *   (Trucks ~11.5%, SUVs ~14.5%, Sedans ~17%).
 * - Adjusts for mileage against a 12,000 mi/yr baseline (+/- 2.2% per 10k miles).
 */
export function calculateBookValue({
  year,
  make,
  bodyClass,
  baseMsrp,
  miles,
  condition = "average",
  currentYear = new Date().getUTCFullYear(),
}: BookValueInputs): BookValueResult {
  const category = inferBodyClass(bodyClass);
  const msrp = baseMsrp != null && baseMsrp > 0 ? baseMsrp : FALLBACK_MSRP[category];
  const brandAdj = BRAND_DEPRECIATION_ADJ[make.trim().toUpperCase()] ?? 0;
  const annualRate = Math.min(0.28, Math.max(0.06, BASE_CATEGORY_DEPRECIATION[category] + brandAdj));

  const age = Math.max(0, currentYear - year);
  // 84% first-year drive-off retention, followed by compound annual depreciation for subsequent years.
  const ageRetention = 0.84 * Math.pow(1 - annualRate, Math.max(0, age - 1));

  const expectedMiles = Math.max(1, age) * BASELINE_MILES;
  const mileDelta = expectedMiles - Math.max(0, miles);
  const mileageFactor = Math.min(1.25, Math.max(0.65, 1 + (mileDelta / 10000) * 0.022));

  const conditionFactor = condition === "clean" ? 1.06 : condition === "rough" ? 0.9 : 1;
  const baseTrade = Math.max(msrp * 0.1, msrp * ageRetention * mileageFactor * conditionFactor);

  const tradeInAverage = Math.round(baseTrade);
  const tradeInClean = Math.round(baseTrade * 1.07);
  const tradeInRough = Math.round(baseTrade * 0.88);
  const privateParty = Math.round(baseTrade * 1.12);
  const dealerRetail = Math.round(baseTrade * 1.2);

  return {
    tradeInClean,
    tradeInAverage,
    tradeInRough,
    privateParty,
    dealerRetail,
  };
}

export interface InsuranceDeltaInputs {
  tradeYear?: number | null;
  tradeMSRP: number;
  proposedMSRP: number;
  proposedYear?: number | null;
  hasAdvancedSafety?: boolean;
}

/**
 * Algorithmic monthly insurance change estimator.
 * - Replacement cost ratio = `proposedMSRP / tradeMSRP`
 * - Base national premium = $130/mo, scaled by `Math.pow(ratio, 0.35)`
 * - 0.92 multiplier when `hasAdvancedSafety` is true
 * - Subtracts the older trade's estimated premium (`base * 0.85`)
 * - Clamped between $5 and $75/mo
 */
export function estimateInsuranceDelta({
  tradeMSRP,
  proposedMSRP,
  hasAdvancedSafety = true,
}: InsuranceDeltaInputs): number {
  const base = 130;
  const safeTrade = tradeMSRP > 0 ? tradeMSRP : FALLBACK_MSRP.Sedan;
  const safeProposed = proposedMSRP > 0 ? proposedMSRP : FALLBACK_MSRP.Sedan;
  const ratio = safeProposed / safeTrade;
  const safetyMultiplier = hasAdvancedSafety ? 0.92 : 1;
  const proposedPremium = base * Math.pow(ratio, 0.35) * safetyMultiplier;
  const tradePremium = base * 0.85;
  const delta = proposedPremium - tradePremium;
  return Math.round(Math.min(75, Math.max(5, delta)));
}
