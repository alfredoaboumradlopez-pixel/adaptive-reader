"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ChapterState } from "@/lib/tar";

// ─────────────────────────────────────────────────────────────
// Icons (inline stroke SVG)
// ─────────────────────────────────────────────────────────────

type IconName = "back" | "next" | "pen" | "check" | "close" | "trash" | "plus";
const PATHS: Record<IconName, ReactNode> = {
  back: <path d="M15 18l-6-6 6-6" />,
  next: <path d="M9 18l6-6-6-6" />,
  pen: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────

/** Top bar used on inner screens: back link on the left, optional actions on the right. */
export function TopBar({ backLabel, onBack, right }: { backLabel: string; onBack: () => void; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-paper/95 px-4 pb-1 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex h-11 items-center gap-1 px-1 text-[15px] font-medium text-accent-ink active:opacity-60"
      >
        <Icon name="back" />
        {backLabel}
      </button>
      <div className="flex items-center gap-1">{right}</div>
    </header>
  );
}

export type Tab = "map" | "vault" | "notebook" | "life";

export function BottomNav({ active, onGo }: { active: Tab; onGo: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: "map", label: "Mapa" },
    { id: "vault", label: "Vault" },
    { id: "notebook", label: "Cuaderno" },
    { id: "life", label: "Mi vida" },
  ];
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 gap-1 border-t border-line bg-paper-2/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur"
    >
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onGo(it.id)}
            aria-current={on ? "page" : undefined}
            className={`h-12 border-t-2 text-[13px] ${
              on ? "border-ink font-semibold text-ink" : "border-transparent text-muted"
            }`}
          >
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────

const COVER_COLORS = ["#1D2A5C", "#5C2A1D", "#1D4A3A", "#3F2A5C", "#5C4A1D"];

export function BookCover({ title, size = "md" }: { title: string; size?: "sm" | "md" }) {
  const color = COVER_COLORS[Array.from(title).reduce((a, c) => a + c.charCodeAt(0), 0) % COVER_COLORS.length];
  const dims = size === "sm" ? "h-[78px] w-[54px] text-[9px] p-1.5" : "h-[140px] w-[96px] text-[12px] p-2.5";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-end rounded-[4px] font-serif font-semibold leading-tight text-paper shadow-[0_8px_20px_rgba(23,24,28,0.18)] ${dims}`}
      style={{ background: color }}
    >
      {title}
    </span>
  );
}

export function StateMark({ state }: { state: ChapterState }) {
  if (state === "mastered")
    return (
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ok text-white">
        <Icon name="check" size={13} />
      </span>
    );
  const ring =
    state === "progress"
      ? "border-warn"
      : state === "review"
        ? "border-bad"
        : state === "reading"
          ? "border-accent"
          : "border-line-2";
  return (
    <span
      className={`h-[22px] w-[22px] shrink-0 rounded-full border-2 ${ring}`}
      style={state === "reading" ? { background: "conic-gradient(#2f5bea 0 50%, transparent 50% 100%)" } : undefined}
    />
  );
}

export function AreaChips({
  areas,
  value,
  onChange,
  onAdd,
}: {
  areas: string[];
  value: string | null;
  onChange: (a: string | null) => void;
  onAdd?: (name: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {areas.map((a) => {
        const on = a === value;
        return (
          <button
            key={a}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : a)}
            className={`h-9 rounded-full border px-3.5 text-[13px] font-medium ${
              on ? "border-ink bg-ink text-paper" : "border-line-2 bg-card text-ink-2"
            }`}
          >
            {a}
          </button>
        );
      })}
      {onAdd ? (
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Nuevo tema (ej. Salud, Familia)")?.trim();
            if (name) onAdd(name);
          }}
          className="h-9 rounded-full border border-dashed border-[#b5b1a6] px-3.5 text-[13px] font-medium text-muted"
        >
          + Tema
        </button>
      ) : null}
    </div>
  );
}

/** Bottom sheet with backdrop; respects the home indicator. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-ink/20 [animation:fade-in_.2s_ease-out]"
      />
      <section className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] max-w-[640px] flex-col gap-3.5 overflow-y-auto overscroll-contain rounded-t-3xl bg-card px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_30px_rgba(23,24,28,0.12)] [animation:sheet-up_.25s_ease-out]">
        <span className="mx-auto h-[5px] w-10 shrink-0 rounded-full bg-line-2" />
        <div className="flex items-center justify-between">
          <h2 className="m-0 font-serif text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="h-9 px-2 text-[15px] font-medium text-accent-ink">
            Cancelar
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function Quote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="m-0 border-l-[3px] border-accent py-0.5 pl-3 font-serif text-[15px] italic leading-relaxed text-ink-2">
      {children}
    </blockquote>
  );
}

export function Aside({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside className="flex gap-3 rounded-xl border border-line bg-card px-4 py-3.5">
      <span className="w-[3px] shrink-0 rounded-full bg-accent" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="m-0 text-xs font-semibold text-accent-ink">{label}</p>
        <div className="font-serif text-[15px] leading-relaxed text-ink-2">{children}</div>
      </div>
    </aside>
  );
}

export const textareaClass =
  "w-full resize-none rounded-[10px] border border-line-2 bg-card px-3 py-3 text-base leading-snug text-ink outline-none focus:border-accent";

export const primaryButton =
  "h-[50px] w-full rounded-full bg-ink text-[15px] font-semibold text-paper active:opacity-80 disabled:opacity-40";

export function Toast({ text }: { text: string | null }) {
  const [shown, setShown] = useState(text);
  useEffect(() => setShown(text), [text]);
  if (!shown) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[80] mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-full bg-ink px-4 py-2.5 text-sm text-paper shadow-lg [animation:fade-in_.2s_ease-out]"
    >
      {shown}
    </div>
  );
}
