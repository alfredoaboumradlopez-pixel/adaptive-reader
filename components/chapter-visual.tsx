"use client";

import type { ChapterVisual, VisualItem } from "@/lib/knowledge-empire-data";

const ACCENT = "text-accent-ink";

function Shell({ visual, children }: { visual: ChapterVisual; children: React.ReactNode }) {
  return (
    <figure className="mt-8 rounded-2xl border border-line bg-card p-5 sm:p-6">
      <p className="text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-accent-ink">Visual</p>
      <h3 className="mt-1.5 font-serif text-lg font-semibold text-ink">{visual.title}</h3>
      <div className="mt-5">{children}</div>
      {visual.caption ? (
        <figcaption className="mt-5 font-serif text-sm italic leading-relaxed text-muted">
          {visual.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function Flow({ items }: { items: VisualItem[] }) {
  return (
    <ol className="relative space-y-4">
      {items.map((it, i) => (
        <li key={i} className="relative flex gap-4">
          {i < items.length - 1 ? (
            <span className="absolute left-[13px] top-8 h-[calc(100%-0.5rem)] w-px bg-line-2" />
          ) : null}
          <span className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent bg-card text-xs font-semibold text-accent-ink">
            {i + 1}
          </span>
          <div className="pt-0.5">
            <p className="text-sm font-semibold text-ink">{it.label}</p>
            {it.detail ? <p className="mt-0.5 text-sm leading-snug text-muted">{it.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Cycle({ items }: { items: VisualItem[] }) {
  const n = items.length;
  const dense = n > 6; // many steps: narrower boxes so neighbours don't overlap
  const R = dense ? 40 : 38; // % radius of the ring
  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[340px]">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <marker id="cyc-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#2f5bea" />
            </marker>
          </defs>
          <circle cx="50" cy="50" r={R} fill="none" stroke="#d4d1c8" strokeWidth="0.6" />
          {items.map((_, i) => {
            // arrow head midway between node i and i+1, pointing clockwise
            const a = ((i + 0.5) / n) * 2 * Math.PI - Math.PI / 2;
            const x = 50 + R * Math.cos(a);
            const y = 50 + R * Math.sin(a);
            const tx = -Math.sin(a);
            const ty = Math.cos(a);
            return (
              <line
                key={i}
                x1={x - tx * 0.8}
                y1={y - ty * 0.8}
                x2={x + tx * 0.8}
                y2={y + ty * 0.8}
                stroke="transparent"
                markerEnd="url(#cyc-arrow)"
              />
            );
          })}
        </svg>
        {items.map((it, i) => {
          const a = (i / n) * 2 * Math.PI - Math.PI / 2;
          const left = 50 + R * Math.cos(a);
          const top = 50 + R * Math.sin(a);
          return (
            <div
              key={i}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border border-line-2 bg-card text-center font-semibold leading-tight text-ink shadow-sm ${
                dense ? "w-[27%] px-1 py-1 text-[10px] sm:text-[11px]" : "w-[34%] px-2 py-1.5 text-[11px] sm:text-xs"
              }`}
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <span>
                <span className={`mr-1 ${ACCENT}`}>{i + 1}</span>
                {it.label}
              </span>
            </div>
          );
        })}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl text-line-2">↻</div>
      </div>
      {items.some((it) => it.detail) ? (
        <ol className="mt-4 space-y-1.5 text-sm text-muted">
          {items.map((it, i) => (
            <li key={i}>
              <span className={`font-semibold ${ACCENT}`}>{i + 1}.</span>{" "}
              <span className="text-ink">{it.label}</span>
              {it.detail ? <> — {it.detail}</> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function Stack({ items }: { items: VisualItem[] }) {
  const n = items.length;
  return (
    <div className="flex flex-col items-center gap-1.5">
      {items.map((it, i) => (
        <div
          key={i}
          className="rounded-lg border border-line-2 px-3 py-2 text-center"
          style={{
            width: `${55 + (45 * i) / Math.max(1, n - 1)}%`,
            background: `rgb(47 91 234 / ${0.16 - (0.12 * i) / Math.max(1, n - 1)})`,
          }}
        >
          <p className="text-sm font-semibold text-ink">{it.label}</p>
          {it.detail ? <p className="mt-0.5 text-xs leading-snug text-muted">{it.detail}</p> : null}
        </div>
      ))}
    </div>
  );
}

function Compare({ columns }: { columns: { label: string; points: string[] }[] }) {
  const tones = ["border-line bg-paper", "border-accent/40 bg-mark/50"];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {columns.slice(0, 2).map((col, i) => (
        <div key={i} className={`rounded-xl border p-4 ${tones[i] ?? tones[0]}`}>
          <p className={`text-sm font-semibold ${i === 1 ? ACCENT : "text-ink-2"}`}>{col.label}</p>
          <ul className="mt-2 space-y-1.5">
            {col.points.map((pt, j) => (
              <li key={j} className="flex gap-2 text-sm leading-snug text-ink-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" />
                {pt}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Matrix({ axes, quadrants }: { axes: { x: string; y: string }; quadrants: VisualItem[] }) {
  const highlight = 1; // top-right is conventionally the "win" quadrant
  return (
    <div className="flex gap-2">
      <div className="flex w-5 shrink-0 items-center justify-center">
        <span className="-rotate-90 whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-muted">{axes.y}</span>
      </div>
      <div className="flex-1">
        <div className="grid grid-cols-2 gap-1.5">
          {quadrants.slice(0, 4).map((q, i) => (
            <div
              key={i}
              className={`min-h-[92px] rounded-lg border p-3 ${
                i === highlight ? "border-accent/40 bg-mark/60" : "border-line bg-paper"
              }`}
            >
              <p className={`text-sm font-semibold ${i === highlight ? ACCENT : "text-ink"}`}>{q.label}</p>
              {q.detail ? <p className="mt-1 text-xs leading-snug text-muted">{q.detail}</p> : null}
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[10px] uppercase tracking-[0.18em] text-muted">{axes.x}</p>
      </div>
    </div>
  );
}

export default function ChapterVisualView({ visual }: { visual: ChapterVisual }) {
  switch (visual.type) {
    case "flow":
      return <Shell visual={visual}><Flow items={visual.items} /></Shell>;
    case "cycle":
      return <Shell visual={visual}><Cycle items={visual.items} /></Shell>;
    case "stack":
      return <Shell visual={visual}><Stack items={visual.items} /></Shell>;
    case "compare":
      return <Shell visual={visual}><Compare columns={visual.columns} /></Shell>;
    case "matrix":
      return <Shell visual={visual}><Matrix axes={visual.axes} quadrants={visual.quadrants} /></Shell>;
    default:
      return null;
  }
}
