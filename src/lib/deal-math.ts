// Pure deal / ownership math shared by the desk screens and tests.

export interface DealInputs {
  price: number;
  down: number; // cash down + net trade
  apr: number; // percent
  term: number; // months
  taxFees: number; // tax, title & fees rolled into the loan
  mpg: number;
  maint: number; // $ / month
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
  const financed = Math.max(0, deal.price + deal.taxFees - deal.down);
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
