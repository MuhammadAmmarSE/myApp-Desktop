// Charts, drawn as plain SVG in the theme's colours. Thin marks, one axis, a hairline grid, a
// legend whenever there are two series, and a tooltip on hover. Colours: --viz-1 and --viz-2,
// validated per theme (see theme/index.ts).
import { useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { useReduced } from "@/theme";
import { ease } from "@/theme/motion";

export type Series = { key: string; name: string; color: string };

// round numbers for an axis: 0 / 2,000 / 4,000 …
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || pow * 10;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export const axisNumber = (n: number, max: number) => {
  if (max >= 10000) {
    if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 ? 1 : 0)}K`;
  }
  return n.toLocaleString();
};

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const ro = useMemo(
    () =>
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((e) => {
            const x = e[0]?.contentRect.width;
            if (x) setW(Math.round(x));
          }),
    [],
  );
  const set = (el: HTMLDivElement | null) => {
    (ref as any).current = el;
    if (el && ro) {
      ro.disconnect();
      ro.observe(el);
      setW(Math.round(el.getBoundingClientRect().width) || 600);
    }
  };
  return [set, w] as const;
}

export function Legend({ series, className }: { series: Series[]; className?: string }) {
  if (series.length < 2) return null;
  return (
    <div className={clsx("flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text2", className)}>
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function Tip({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  const left = Math.min(Math.max(8, x + 12), w - 190);
  return (
    <div className="pointer-events-none absolute z-10 min-w-[150px] rounded-[10px] border border-line bg-surface2 px-3 py-2 text-[12px] shadow-[var(--shadow-pop)]" style={{ left, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
}

const TipRow = ({ color, name, value }: { color: string; name: string; value: string }) => (
  <div className="flex items-center gap-2 py-0.5">
    <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} />
    <span className="flex-1 text-text2">{name}</span>
    <span className="font-medium text-text tnum">{value}</span>
  </div>
);

// ---------- columns: one or two series side by side per label ----------
export function ColumnChart({
  data,
  series,
  height = 220,
  format = (n) => n.toLocaleString(),
  highlight,
  onPick,
  label,
}: {
  data: { key: string; label: string; values: Record<string, number> }[];
  series: Series[];
  height?: number;
  format?: (n: number) => string;
  highlight?: string; // the current period, drawn at full strength; others a little quieter
  onPick?: (key: string) => void;
  label: string; // what the chart shows, for screen readers
}) {
  const reduced = useReduced();
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.flatMap((d) => series.map((s) => d.values[s.key] || 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const padL = 44;
  const padB = 24;
  const padT = 8;
  const plotW = Math.max(10, w - padL - 4);
  const plotH = height - padB - padT;
  const band = plotW / Math.max(1, data.length);
  const bar = Math.min(24, Math.max(4, (band * 0.62 - (series.length - 1) * 2) / series.length));
  const groupW = bar * series.length + (series.length - 1) * 2;
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const everyLabel = Math.max(1, Math.ceil(data.length / Math.floor(plotW / 44)));
  const r = 4;
  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={w} height={height} role="img" aria-label={label} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
            <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={10.5} fill="var(--c-text3)" className="tnum">
              {axisNumber(t, top)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = padL + band * i + (band - groupW) / 2;
          const dim = highlight && d.key !== highlight && hover !== i;
          return (
            <g key={d.key} opacity={dim ? 0.55 : 1} style={{ transition: "opacity 160ms" }}>
              <rect x={padL + band * i} y={padT} width={band} height={plotH} fill={hover === i ? "var(--hover)" : "transparent"} rx={6} onMouseEnter={() => setHover(i)} onClick={() => onPick?.(d.key)} />
              {series.map((s, j) => {
                const v = d.values[s.key] || 0;
                const h = Math.max(0, (v / top) * plotH);
                const x = gx + j * (bar + 2);
                const yy = padT + plotH - h;
                const rr = Math.min(r, h, bar / 2);
                const path = h <= 0 ? "" : `M${x},${padT + plotH} V${yy + rr} Q${x},${yy} ${x + rr},${yy} H${x + bar - rr} Q${x + bar},${yy} ${x + bar},${yy + rr} V${padT + plotH} Z`;
                return (
                  <motion.path
                    key={s.key}
                    d={path}
                    fill={s.color}
                    pointerEvents="none"
                    initial={reduced ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.5, ease: ease.out, delay: Math.min(i, 14) * 0.02 }}
                    style={{ transformOrigin: `${x}px ${padT + plotH}px`, transformBox: "view-box" as any }}
                  />
                );
              })}
              {i % everyLabel === 0 && (
                <text x={padL + band * i + band / 2} y={height - 6} textAnchor="middle" fontSize={10.5} fill={highlight === d.key ? "var(--c-text)" : "var(--c-text3)"} fontWeight={highlight === d.key ? 600 : 400}>
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && data[hover] && (
        <Tip x={padL + band * hover + band / 2} y={10} w={w}>
          <div className="mb-1 font-semibold text-text">{data[hover].label}</div>
          {series.map((s) => (
            <TipRow key={s.key} color={s.color} name={s.name} value={format(data[hover].values[s.key] || 0)} />
          ))}
        </Tip>
      )}
    </div>
  );
}

// ---------- lines over a shared x (days of a month) ----------
export function LineChart({
  points,
  series,
  height = 220,
  format = (n) => n.toLocaleString(),
  xLabel,
  label,
  marker,
}: {
  points: { x: number; values: Record<string, number | null> }[]; // x: 1..n
  series: Series[];
  height?: number;
  format?: (n: number) => string;
  xLabel: (x: number) => string;
  label: string;
  marker?: number; // an x to mark (today)
}) {
  const reduced = useReduced();
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...points.flatMap((p) => series.map((s) => p.values[s.key] ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const padL = 44;
  const padB = 24;
  const padT = 10;
  const plotW = Math.max(10, w - padL - 10);
  const plotH = height - padB - padT;
  const n = Math.max(2, points.length);
  const xAt = (i: number) => padL + (i / (n - 1)) * plotW;
  const yAt = (v: number) => padT + plotH - (v / top) * plotH;
  const lines = series.map((s) => {
    const pts = points.map((p, i) => (p.values[s.key] == null ? null : ([xAt(i), yAt(p.values[s.key] as number)] as const))).filter(Boolean) as (readonly [number, number])[];
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = pts.length ? `${d} L${pts[pts.length - 1][0]},${padT + plotH} L${pts[0][0]},${padT + plotH} Z` : "";
    return { s, d, area, last: pts[pts.length - 1] };
  });
  const labelsEvery = Math.max(1, Math.ceil(points.length / Math.floor(plotW / 48)));
  return (
    <div
      ref={ref}
      className="relative w-full"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - rect.left - padL) / plotW) * (n - 1));
        setHover(i >= 0 && i < points.length ? i : null);
      }}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={w} height={height} role="img" aria-label={label} className="block overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w} y1={yAt(t)} y2={yAt(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
            <text x={padL - 8} y={yAt(t)} dy="0.32em" textAnchor="end" fontSize={10.5} fill="var(--c-text3)" className="tnum">
              {axisNumber(t, top)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelsEvery === 0 ? (
            <text key={p.x} x={xAt(i)} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--c-text3)">
              {xLabel(p.x)}
            </text>
          ) : null,
        )}
        {marker != null && marker <= points.length && <line x1={xAt(marker - 1)} x2={xAt(marker - 1)} y1={padT} y2={padT + plotH} stroke="var(--viz-axis)" strokeWidth={1} />}
        {lines.map(({ s, area }, k) => (k === 0 && area ? <motion.path key={`a${s.key}`} d={area} fill={s.color} initial={{ opacity: 0 }} animate={{ opacity: 0.1 }} transition={{ duration: 0.6 }} /> : null))}
        {lines.map(({ s, d }) => (
          <motion.path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: ease.out }} />
        ))}
        {lines.map(({ s, last }) => (last ? <circle key={`e${s.key}`} cx={last[0]} cy={last[1]} r={4} fill={s.color} stroke="var(--c-surface)" strokeWidth={2} /> : null))}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={xAt(hover)} x2={xAt(hover)} y1={padT} y2={padT + plotH} stroke="var(--c-text3)" strokeWidth={1} />
            {series.map((s) => {
              const v = points[hover]?.values[s.key];
              return v == null ? null : <circle key={s.key} cx={xAt(hover)} cy={yAt(v)} r={4.5} fill={s.color} stroke="var(--c-surface)" strokeWidth={2} />;
            })}
          </g>
        )}
      </svg>
      {hover != null && points[hover] && (
        <Tip x={xAt(hover)} y={8} w={w}>
          <div className="mb-1 font-semibold text-text">{xLabel(points[hover].x)}</div>
          {series.map((s) => {
            const v = points[hover].values[s.key];
            return v == null ? null : <TipRow key={s.key} color={s.color} name={s.name} value={format(v)} />;
          })}
        </Tip>
      )}
    </div>
  );
}

// ---------- ranked bars: magnitude by name (categories) ----------
export function BarList({ items, format = (n) => n.toLocaleString(), color = "var(--viz-1)", onPick, max: maxRows = 8, selected }: { items: { key: string; label: string; value: number; hint?: string }[]; format?: (n: number) => string; color?: string; onPick?: (key: string) => void; max?: number; selected?: string | null }) {
  const reduced = useReduced();
  const rows = items.slice(0, maxRows);
  const rest = items.slice(maxRows);
  const all = rest.length ? [...rows, { key: "__other", label: `Other (${rest.length})`, value: rest.reduce((s, x) => s + x.value, 0) }] : rows;
  const max = Math.max(1, ...all.map((x) => x.value));
  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className="flex flex-col gap-1">
      {all.map((it, i) => (
        <button
          key={it.key}
          type="button"
          disabled={!onPick || it.key === "__other"}
          onClick={() => onPick?.(it.key)}
          className={clsx("group/bl grid grid-cols-[minmax(90px,140px)_1fr_auto] items-center gap-3 rounded-[8px] px-2 py-1.5 text-left transition-colors enabled:hover:bg-hover", selected === it.key && "bg-hover")}
        >
          <span className="truncate text-[12.5px] text-text2">{it.label}</span>
          <span className="relative h-2.5 overflow-hidden rounded-full bg-[var(--viz-grid)]">
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: color }}
              initial={reduced ? false : { width: 0 }}
              animate={{ width: `${(it.value / max) * 100}%` }}
              transition={{ duration: 0.6, ease: ease.out, delay: i * 0.03 }}
            />
          </span>
          <span className="w-[120px] text-right text-[12.5px] tnum">
            <span className="font-medium text-text">{format(it.value)}</span>
            <span className="ml-1.5 text-text3">{Math.round((it.value / total) * 100)}%</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------- a small trend line for a stat ----------
export function Sparkline({ values, width = 120, height = 32, color = "var(--viz-1)", last = true }: { values: number[]; width?: number; height?: number; color?: string; last?: boolean }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = (i: number) => 3 + (i / (values.length - 1)) * (width - 8);
  const y = (v: number) => 3 + (1 - (v - min) / span) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={`${d} L${x(values.length - 1)},${height} L${x(0)},${height} Z`} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke="var(--c-text3)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3.5} fill={color} stroke="var(--c-surface)" strokeWidth={2} />}
    </svg>
  );
}
