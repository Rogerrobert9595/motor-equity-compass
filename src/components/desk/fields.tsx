import { useState, type ReactNode } from "react";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
export const signedMoney = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
export const num = (n: number) => Math.round(n).toLocaleString("en-US");

interface NumInputProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export function NumInput({ label, value, onChange, prefix, suffix, decimals = 2, className }: NumInputProps) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label
      className={cn(
        "flex h-11 items-center gap-1 rounded-lg border border-input bg-background/60 px-3 focus-within:border-ring",
        className,
      )}
    >
      {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        className="num w-full min-w-0 bg-transparent text-right text-base font-medium outline-none"
        value={text ?? value.toLocaleString("en-US", { maximumFractionDigits: decimals })}
        onFocus={(e) => {
          setText(String(value));
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value.replace(/[$,%\s]/g, ""));
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => setText(null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {suffix && <span className="whitespace-nowrap text-sm text-muted-foreground">{suffix}</span>}
    </label>
  );
}

interface SliderFieldProps extends NumInputProps {
  min: number;
  max: number;
  step: number;
  hint?: ReactNode;
}

export function SliderField({ min, max, step, hint, ...input }: SliderFieldProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{input.label}</div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
        <NumInput {...input} className="w-36 shrink-0" />
      </div>
      <Slider
        aria-label={input.label}
        value={[Math.min(max, Math.max(min, input.value))]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => input.onChange(v)}
        className="py-2"
      />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

export function Panel({ title, kicker, action, children, className }: { title: string; kicker?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          {kicker && <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{kicker}</div>}
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
