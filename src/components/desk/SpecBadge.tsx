import { cn } from "@/lib/utils";

/** "✓ EPA Certified" when MPG came from fueleconomy.gov, "Est. Spec" when it's the engine-size estimate. */
export function SpecBadge({ kind, className }: { kind: "epa" | "estimate"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        kind === "epa" ? "bg-gain/15 text-gain" : "bg-muted text-muted-foreground",
        className,
      )}
      title={kind === "epa" ? "Certified MPG from fueleconomy.gov (US Dept. of Energy)" : "Estimated from engine size; no exact EPA match"}
    >
      {kind === "epa" ? "✓ EPA Certified" : "Est. Spec"}
    </span>
  );
}
