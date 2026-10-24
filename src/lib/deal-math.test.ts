import { describe, expect, it } from "vitest";

import {
  aaaMonthlyMaint,
  annualMiles,
  dealTax,
  estimateMaint,
  loanBalance,
  monthlyFuelCost,
  monthlyPayment,
  odometerAt,
  serviceWindow,
  simulate,
} from "./deal-math";
import { findByStock, parsePastedRows } from "./inventory";
import { decodeSummary, encodeSummary } from "./summary-link";

describe("deal math", () => {
  it("amortizes a 72-month loan at 6.9% APR", () => {
    expect(monthlyPayment(21499, 6.9, 72)).toBeCloseTo(365.5, 0);
  });

  it("splits evenly at 0% APR", () => {
    expect(monthlyPayment(12000, 0, 60)).toBe(200);
  });

  it("pays the loan to zero at the end of the term", () => {
    expect(loanBalance(20000, 6.9, 72, 72)).toBe(0);
    expect(loanBalance(20000, 6.9, 72, 0)).toBeCloseTo(20000, 5);
  });

  it("turns a 42 mile/day commute into 15,330 miles a year", () => {
    expect(annualMiles(42)).toBe(15330);
  });

  it("projects the odometer 3 years out", () => {
    expect(odometerAt(11604, 15330, 36)).toBe(57594);
  });

  it("prices fuel from miles, mpg and gas price", () => {
    expect(monthlyFuelCost(12000, 25, 3.5)).toBeCloseTo(140, 5);
  });

  it("uses the brand maintenance table with a mileage factor", () => {
    expect(estimateMaint("Toyota", 5000)).toBe(41);
    expect(estimateMaint("Unknown", 45000)).toBe(85);
  });

  it("finances price plus fees minus down and finds equity crossover", () => {
    const sim = simulate(
      { price: 23999, cash: 2500, tradeValue: 0, tradePayoff: 0, taxRate: 0, tradeTaxCredit: true, fees: 0, apr: 6.9, term: 72, mpg: 27, maint: 58 },
      { commute: 42, currPay: 310, currMpg: 18, currMaint: 165, gasPrice: 3.45, insDelta: 18 },
      11604,
    );
    expect(sim.financed).toBe(21499);
    expect(sim.maintSave).toBe(107);
    expect(sim.breakevenMonth).not.toBeNull();
    expect(sim.series).toHaveLength(73);
  });
});

describe("trade-in sales tax credit", () => {
  const base = { price: 24000, cash: 0, tradeValue: 5000, tradePayoff: 3000, taxRate: 8, tradeTaxCredit: true, fees: 0 };

  it("taxes only the price minus the trade allowance", () => {
    const t = dealTax(base);
    expect(t.taxable).toBe(19000);
    expect(t.salesTax).toBeCloseTo(1520, 5);
    expect(t.tradeTaxSavings).toBeCloseTo(400, 5);
    // 24,000 + 1,520 tax − 2,000 net trade
    expect(t.financed).toBeCloseTo(23520, 5);
  });

  it("makes $2,000 of trade equity worth more than $2,000 cash", () => {
    const viaTrade = dealTax({ ...base, tradeValue: 2000, tradePayoff: 0 }).financed;
    const viaCash = dealTax({ ...base, tradeValue: 0, tradePayoff: 0, cash: 2000 }).financed;
    expect(viaCash - viaTrade).toBeCloseTo(160, 5);
  });

  it("gives no credit when the state doesn't allow it", () => {
    const t = dealTax({ ...base, tradeTaxCredit: false });
    expect(t.salesTax).toBeCloseTo(1920, 5);
    expect(t.tradeTaxSavings).toBe(0);
  });

  it("rolls negative trade equity into the loan", () => {
    const t = dealTax({ ...base, tradeValue: 5000, tradePayoff: 8000 });
    expect(t.netTrade).toBe(-3000);
    expect(t.financed).toBeCloseTo(24000 + 1520 + 3000, 5);
  });
});

describe("maintenance sources", () => {
  it("applies the AAA 2025 new-car rate of 11.3¢ a mile", () => {
    expect(aaaMonthlyMaint(15330)).toBe(144);
  });

  it("finds the service milestones around the odometer", () => {
    expect(serviceWindow(75000).passed?.at).toBe(60000);
    expect(serviceWindow(75000).next?.at).toBe(90000);
    expect(serviceWindow(175000).next).toBeNull();
  });
});

describe("share summary link", () => {
  it("round-trips the deal and rejects garbage", () => {
    const payload = {
      title: "2026 Buick Encore GX — AWD",
      startMiles: 11604,
      deal: { ...base(), apr: 6.9, term: 72, mpg: 27, maint: 58 },
      current: { commute: 42, currPay: 310, currMpg: 18, currMaint: 165, gasPrice: 3.45, insDelta: 18 },
    };
    expect(decodeSummary(encodeSummary(payload))).toEqual(payload);
    expect(decodeSummary("not-a-real-code")).toBeNull();
  });

  function base() {
    return { price: 23999, cash: 2500, tradeValue: 0, tradePayoff: 0, taxRate: 8, tradeTaxCredit: true, fees: 375 };
  }
});

describe("pasted sheet rows", () => {
  it("reads a tab-separated row copied from column A", () => {
    const row = ["1", "S", "2-48134", "2026", "Buick Encore GX", "AWD Preferred", "11,604", "$23,999", "39", "S", "KL4AMCSL0TB008832", "", "27", "58"].join("\t");
    const v = parsePastedRows(row)[0]!;
    expect(v.stock).toBe("2-48134");
    expect(v.loc).toBe("S");
    expect(v.miles).toBe(11604);
    expect(v.price).toBe(23999);
    expect(v.epaMpg).toBe(27);
    expect(v.estMaint).toBe(58);
  });

  it("skips header rows and rows without a price", () => {
    const text = "#\tLoc\tStock\tYear\tModel\n1\tS\t2-1\t2024\tKia Soul\tLX\t100\t\t3";
    expect(parsePastedRows(text)).toHaveLength(0);
  });

  it("finds a unit by exact or partial stock number", () => {
    const list = parsePastedRows("S\t1-78825NA\t2024\tToyota RAV4\tXLE\t28000\t29450\t18");
    expect(findByStock(list, "1-78825na")?.makeModel).toBe("Toyota RAV4");
    expect(findByStock(list, "78825")?.stock).toBe("1-78825NA");
  });
});

describe("current car estimates", () => {
  it("assumes 12,000 miles per year of age when mileage isn't picked", async () => {
    const { assumedMiles } = await import("./deal-math");
    expect(assumedMiles(2015, 2026)).toBe(132000);
    expect(assumedMiles(2026, 2026)).toBe(12000);
  });

  it("estimates repairs from the mileage bucket", async () => {
    const { MILEAGE_BUCKETS } = await import("./deal-math");
    // Ford, 125–150k bucket (137,500 mi): 710 × (1 + 3.3125 × 0.5) ÷ 12 ≈ $157/mo
    expect(estimateMaint("Ford", MILEAGE_BUCKETS[5].miles)).toBe(157);
  });
});
