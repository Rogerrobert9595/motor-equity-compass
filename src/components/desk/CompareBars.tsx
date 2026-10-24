import { money } from "@/components/desk/fields";
import { cn } from "@/lib/utils";

export interface BarRow {
  label: string;
  parts: { k: string; v: number; c: string }[];
}

export function CompareBars({ rows }: { rows: BarRow[] }) {
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
              <span className="num text-lg font-bold">
                {money(total)}
                <span className="text-xs text-muted-foreground">/mo</span>
              </span>
            </div>
            <div className="flex h-7 overflow-hidden rounded-lg bg-muted print:border print:border-border" style={{ width: `${(total / max) * 100}%` }}>
              {r.parts.map((p) =>
                p.v > 0 ? (
                  <div key={p.k} className={cn(p.c, "h-full")} style={{ width: `${(p.v / (total || 1)) * 100}%` }} title={`${p.k} ${money(p.v)}`} />
                ) : null,
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

/** "Feels like" breakdown: payment minus running-cost savings plus insurance change. */
export function FeelsLikeBreakdown({
  payment,
  gasSave,
  maintSave,
  insDelta,
  feelsLike,
}: {
  payment: number;
  gasSave: number;
  maintSave: number;
  insDelta: number;
  feelsLike: number;
}) {
  const rows = [
    { k: "New loan payment", v: payment },
    { k: gasSave >= 0 ? "Gas you save" : "Extra gas", v: -gasSave },
    { k: maintSave >= 0 ? "Repairs you save" : "Extra repairs", v: -maintSave },
    { k: "Insurance change", v: insDelta },
  ];
  return (
    <div className="space-y-1.5 text-sm">
      {rows.map((r) => (
        <div key={r.k} className="flex justify-between gap-3">
          <span className="text-muted-foreground">{r.k}</span>
          <span className={cn("num font-medium", r.v < 0 && "text-gain")}>
            {r.v < 0 ? "−" : "+"}
            {money(Math.abs(r.v))}
          </span>
        </div>
      ))}
      <div className="flex justify-between gap-3 border-t border-border pt-2 text-base font-semibold">
        <span>Feels like</span>
        <span className="num text-primary print:text-foreground">{money(feelsLike)}/mo</span>
      </div>
    </div>
  );
}
