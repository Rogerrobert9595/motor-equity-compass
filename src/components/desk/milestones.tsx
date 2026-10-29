import { ShieldAlert, Sparkles } from "lucide-react";

import { tradeWindow, WARRANTY, warrantyCliff } from "@/lib/deal-math";
import { cn } from "@/lib/utils";

export interface Milestones {
  warranty: { month: number; label: string; detail: string } | null;
  window: { start: number; end: number } | null;
}

/** Warranty cliff + sweet-spot trade window for the equity chart. */
export function chartMilestones(
  modelYear: number,
  startMiles: number,
  milesPerYear: number,
  breakeven: number | null,
  term: number,
  now?: { year: number; month: number },
): Milestones {
  const d = new Date();
  const current = now ?? { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  const cliff = warrantyCliff(modelYear, startMiles, milesPerYear, current);
  const w = cliff ? WARRANTY[cliff.kind] : null;
  const warranty =
    cliff && w && cliff.month <= term
      ? {
          month: cliff.month,
          label: cliff.kind === "basic" ? "Warranty cliff" : "Powertrain ends",
          detail: `${w.label} (${w.months / 12} yr / ${w.miles / 1000}k mi) runs out by ${cliff.by === "miles" ? "miles" : "age"} — repair risk jumps after this.`,
        }
      : null;
  return { warranty, window: tradeWindow(breakeven, cliff?.month ?? null, term) };
}

/** Tappable chips under the chart that jump the month marker to each milestone. */
export function MilestoneChips({ m, onJump, active }: { m: Milestones; onJump?: (month: number) => void; active?: number }) {
  if (!m.warranty && !m.window) return null;
  const Tag = onJump ? "button" : "div";
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {m.window && (
        <Tag
          type={onJump ? "button" : undefined}
          onClick={onJump ? () => onJump(m.window!.start) : undefined}
          className={cn(
            "flex items-start gap-2 rounded-xl border border-gain/40 bg-gain/10 p-3 text-left",
            onJump && "transition-colors active:bg-gain/20",
            active != null && active >= m.window.start && active <= m.window.end && "ring-2 ring-gain/50",
          )}
        >
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gain" />
          <span className="text-xs">
            <strong className="num block text-sm text-gain">
              Sweet spot: months {m.window.start}–{m.window.end}
            </strong>
            <span className="text-muted-foreground">Best time to trade — in equity{m.warranty && m.warranty.month > m.window.start ? ", still under warranty" : ""}.</span>
          </span>
        </Tag>
      )}
      {m.warranty && (
        <Tag
          type={onJump ? "button" : undefined}
          onClick={onJump ? () => onJump(Math.max(1, m.warranty!.month)) : undefined}
          className={cn(
            "flex items-start gap-2 rounded-xl border border-loss/40 bg-loss/10 p-3 text-left",
            onJump && "transition-colors active:bg-loss/20",
            active === m.warranty.month && "ring-2 ring-loss/50",
          )}
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
          <span className="text-xs">
            <strong className="num block text-sm text-loss">
              {m.warranty.label}: month {m.warranty.month}
            </strong>
            <span className="text-muted-foreground">{m.warranty.detail}</span>
          </span>
        </Tag>
      )}
    </div>
  );
}
