import { describe, expect, it } from "vitest";

import { annualMiles, estimateMaint, loanBalance, monthlyFuelCost, monthlyPayment, odometerAt, simulate } from "./deal-math";
import { findByStock, parsePastedRows } from "./inventory";

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
      { price: 23999, down: 2500, apr: 6.9, term: 72, taxFees: 0, mpg: 27, maint: 58 },
      { commute: 42, currPay: 310, currMpg: 18, currMaint: 165, gasPrice: 3.45, insDelta: 18 },
      11604,
    );
    expect(sim.financed).toBe(21499);
    expect(sim.maintSave).toBe(107);
    expect(sim.breakevenMonth).not.toBeNull();
    expect(sim.series).toHaveLength(73);
  });
});

describe("pasted sheet rows", () => {
  it("reads a tab-separated row copied from column A", () => {
    const row = ["1", "S", "2-48134", "2026", "Buick Encore GX", "AWD Preferred", "11,604", "$23,999", "39", "S", "KL4AMCSL0TB008832", "", "27", "58"].join("\t");
    const [v] = parsePastedRows(row);
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
