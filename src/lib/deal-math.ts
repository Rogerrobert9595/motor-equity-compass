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

/**
 * Wholesale/trade value estimate: ~8% retail-to-trade gap at drive-off,
 * ~12%/yr curve depreciation, plus a penalty for miles over 12k/yr.
 */
export function vehicleValue(price: number, month: number, milesPerYear: number): number {
  const curve = price * 0.92 * Math.pow(0.88, month / 12);
  const excessMiles = Math.max(0, milesPerYear - 12000) * (month / 12);
  return Math.max(price * 0.1, curve - excessMiles * 0.06);
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
