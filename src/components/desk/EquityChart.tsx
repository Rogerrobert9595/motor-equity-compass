import { useRef } from "react";

import type { SimPoint } from "@/lib/deal-math";

interface Props {
  series: SimPoint[];
  month: number;
  breakeven: number | null;
  onScrub: (m: number) => void;
}

const W = 600;
const H = 240;
const L = 46;
const R = 12;
const T = 12;
const B = 26;

export function EquityChart({ series, month, breakeven, onScrub }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const term = Math.max(1, series.length - 1);
  const maxY = Math.max(1, ...series.map((p) => Math.max(p.value, p.balance))) * 1.06;
  // Rounded so server and browser render identical coordinates.
  const x = (m: number) => Math.round((L + (m / term) * (W - L - R)) * 10) / 10;
  const y = (v: number) => Math.round((T + (1 - v / maxY) * (H - T - B)) * 10) / 10;
  const line = (k: "value" | "balance") =>
    series.map((p, i) => `${i ? "L" : "M"}${x(p.month)},${y(p[k])}`).join("");
  const valueArea = `${line("value")}L${x(term)},${y(0)}L${x(0)},${y(0)}Z`;
  const p = series[Math.min(month, term)];

  const scrubFrom = (clientX: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((clientX - rect.left) / rect.width) * W;
    const m = Math.round(((px - L) / (W - L - R)) * term);
    onScrub(Math.min(term, Math.max(1, m)));
  };

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => (maxY / 1.06) * f);
  const years = Array.from({ length: Math.floor(term / 12) }, (_, i) => (i + 1) * 12);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full cursor-crosshair select-none"
      style={{ touchAction: "pan-y" }}
      role="img"
      aria-label="Vehicle value versus loan balance over the loan term"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        scrubFrom(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && scrubFrom(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <defs>
        <linearGradient id="valueFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {yTicks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray={v ? "3 5" : undefined} />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground num text-[11px]">
            ${Math.round(v / 1000)}k
          </text>
        </g>
      ))}
      {years.map((m) => (
        <text key={m} x={x(m)} y={H - 6} textAnchor="middle" className="fill-muted-foreground num text-[11px]">
          Y{m / 12}
        </text>
      ))}

      <path d={valueArea} className="text-gain" fill="url(#valueFill)" />
      <path d={line("balance")} className="fill-none stroke-cost" strokeWidth={2.5} strokeLinejoin="round" />
      <path d={line("value")} className="fill-none stroke-gain" strokeWidth={2.5} strokeLinejoin="round" />

      {breakeven !== null && breakeven > 0 && (
        <g>
          <line x1={x(breakeven)} x2={x(breakeven)} y1={T} y2={H - B} className="stroke-gain/60" strokeDasharray="4 4" />
          <circle cx={x(breakeven)} cy={y(series[breakeven]?.value ?? 0)} r={4} className="fill-background stroke-gain" strokeWidth={2} />
        </g>
      )}

      {p && (
        <g>
          <line x1={x(p.month)} x2={x(p.month)} y1={T} y2={H - B} className="stroke-foreground/70" strokeWidth={1.5} />
          <circle cx={x(p.month)} cy={y(p.balance)} r={6} className="fill-cost stroke-background" strokeWidth={2} />
          <circle cx={x(p.month)} cy={y(p.value)} r={6} className="fill-gain stroke-background" strokeWidth={2} />
        </g>
      )}
    </svg>
  );
}
