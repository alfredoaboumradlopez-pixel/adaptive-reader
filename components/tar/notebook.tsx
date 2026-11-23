"use client";

import { useMemo, useState } from "react";
import { type LifeAction, type Route, type UserData, relativeDay, shortDate, todayYmd } from "@/lib/tar";
import { Icon, Quote } from "./ui";

type Act = (action: string, payload?: Record<string, unknown>) => Promise<boolean>;

function chapterName(chapter: string) {
  const i = chapter.indexOf(":");
  return i === -1 ? chapter : chapter.slice(i + 1).trim();
}

/** Card for one real-life action, with the "¿funcionó?" check-in once it's due. */
export function ActionCard({ a, act, go }: { a: LifeAction; act: Act; go: (r: Route) => void }) {
  const today = todayYmd();
  const isDue = a.outcome === "pending" && !!a.due_date && a.due_date <= today;
  const border =
    a.outcome === "worked" ? "border-ok-line" : a.outcome === "didnt" ? "border-bad-line" : isDue ? "border-warn-line" : "border-line";
  const label =
    a.outcome === "worked"
      ? "Funcionó"
      : a.outcome === "didnt"
        ? "No funcionó"
        : isDue
          ? "Toca revisar"
          : a.due_date
            ? `Revisar ${shortDate(a.due_date)}`
            : "En curso";
  const labelCls =
    a.outcome === "worked" ? "text-ok-ink" : a.outcome === "didnt" ? "text-bad-ink" : isDue ? "text-warn-ink" : "text-muted";

  return (
    <article className={`flex flex-col gap-1.5 rounded-xl border bg-card px-4 py-3.5 ${border}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`m-0 text-xs font-semibold ${labelCls}`}>{label}</p>
        {a.area ? <span className="text-xs text-muted">{a.area}</span> : null}
      </div>
      <p className="m-0 text-[15px] leading-snug">{a.step}</p>
      {a.situation ? <p className="m-0 whitespace-pre-line text-[13px] leading-snug text-muted">{a.situation}</p> : null}
      <button
        type="button"
        onClick={() => go({ name: "read", id: a.node_id })}
        className="self-start text-xs text-accent-ink"
      >
        De: {chapterName(a.chapter)}
      </button>
      {a.outcome === "pending" ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium">¿Funcionó?</span>
          <button
            type="button"
            onClick={() => act("action.outcome", { id: a.id, outcome: "worked" })}
            className="h-9 rounded-full border border-ok-line px-3.5 text-[13px] font-semibold text-ok-ink"
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => act("action.outcome", { id: a.id, outcome: "didnt" })}
            className="h-9 rounded-full border border-bad-line px-3.5 text-[13px] font-semibold text-bad-ink"
          >
            No
          </button>
          <button
            type="button"
            aria-label="Borrar acción"
            onClick={() => window.confirm("¿Borrar esta acción?") && act("action.delete", { id: a.id })}
            className="ml-auto flex h-9 w-9 items-center justify-center text-muted"
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => act("action.outcome", { id: a.id, outcome: "pending" })}
          className="mt-1 self-start text-xs text-muted"
        >
          Deshacer
        </button>
      )}
    </article>
  );
}

type Item =
  | { kind: "note"; id: string; date: string; area: string | null; quote: string | null; body: string | null; chapter: string; node: string; highlight: boolean }
  | { kind: "question"; id: string; date: string; area: null; quote: string | null; body: string; chapter: string; node: string; answered: boolean };

export function NotebookView({ data, act, go }: { data: UserData; act: Act; go: (r: Route) => void }) {
  const [filter, setFilter] = useState<string | null>(null);

  const items = useMemo<Item[]>(() => {
    const notes: Item[] = data.notes.map((n) => ({
      kind: "note",
      id: n.id,
      date: n.created_at,
      area: n.area,
      quote: n.quote,
      body: n.body,
      chapter: n.chapter,
      node: n.node_id,
      highlight: n.kind === "highlight",
    }));
    const qs: Item[] = data.questions.map((q) => ({
      kind: "question",
      id: q.id,
      date: q.created_at,
      area: null,
      quote: q.quote,
      body: q.question,
      chapter: q.chapter,
      node: q.node_id,
      answered: !!q.answer,
    }));
    return [...notes, ...qs].sort((a, b) => b.date.localeCompare(a.date));
  }, [data.notes, data.questions]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of data.notes) if (n.area) m.set(n.area, (m.get(n.area) ?? 0) + 1);
    for (const a of data.actions) if (a.area) m.set(a.area, (m.get(a.area) ?? 0) + 1);
    return m;
  }, [data.notes, data.actions]);

  const shown = filter ? items.filter((i) => i.area === filter) : items;
  const activeActions = data.actions.filter((a) => a.outcome === "pending" && (!filter || a.area === filter));
  const noteCount = data.notes.length;
  const qCount = data.questions.length;
  const actionCount = data.actions.filter((a) => a.outcome === "pending").length;

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-6 pb-32 pt-[max(3.5rem,calc(env(safe-area-inset-top)+1.5rem))]">
      <div>
        <h1 className="m-0 font-serif text-[36px] font-semibold tracking-tight">Cuaderno</h1>
        <p className="m-0 mt-1 text-[13px] text-muted">
          {noteCount} {noteCount === 1 ? "nota" : "notas"} · {qCount} {qCount === 1 ? "pregunta" : "preguntas"} · {actionCount}{" "}
          {actionCount === 1 ? "acción en curso" : "acciones en curso"}
        </p>
      </div>

      <div className="-mx-6 flex gap-1.5 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
        <button
          type="button"
          aria-pressed={!filter}
          onClick={() => setFilter(null)}
          className={`h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold ${
            !filter ? "border-ink bg-ink text-paper" : "border-line-2 bg-card text-ink-2"
          }`}
        >
          Todo
        </button>
        {data.areas.map((a) => (
          <button
            key={a}
            type="button"
            aria-pressed={filter === a}
            onClick={() => setFilter(filter === a ? null : a)}
            className={`h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium ${
              filter === a ? "border-ink bg-ink text-paper" : "border-line-2 bg-card text-ink-2"
            }`}
          >
            {a}
            {counts.get(a) ? ` · ${counts.get(a)}` : ""}
          </button>
        ))}
      </div>

      {activeActions.slice(0, 2).map((a) => (
        <ActionCard key={a.id} a={a} act={act} go={go} />
      ))}

      {shown.length === 0 ? (
        <p className="m-0 mt-4 text-sm leading-relaxed text-muted">
          {filter
            ? `Aún no hay notas en ${filter}.`
            : "Tu cuaderno está vacío. Mientras lees, selecciona una frase para subrayarla, anotarla o preguntar."}
        </p>
      ) : (
        <ul className="m-0 list-none p-0">
          {shown.map((it) => (
            <li key={`${it.kind}-${it.id}`} className="border-b border-line py-4 last:border-b-0">
              <article className="flex flex-col gap-2">
                {it.kind === "question" ? (
                  <p className="m-0 text-xs font-semibold text-accent-ink">
                    Pregunta · {it.answered ? "respondida" : "pendiente"}
                  </p>
                ) : null}
                {it.quote ? <Quote>{it.quote}</Quote> : null}
                {it.body ? <p className="m-0 text-[15px] leading-snug">{it.body}</p> : null}
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      go(it.kind === "question" ? { name: "questions", id: it.node, tab: "mine" } : { name: "read", id: it.node })
                    }
                    className="min-w-0 truncate text-left text-xs text-muted"
                  >
                    {chapterName(it.chapter)}
                    {it.kind === "note" ? ` · ${it.highlight ? "Subrayado" : it.area ?? "Nota"}` : ""} · {relativeDay(it.date)}
                  </button>
                  <button
                    type="button"
                    aria-label="Borrar"
                    onClick={() =>
                      window.confirm("¿Borrar?") &&
                      act(it.kind === "question" ? "question.delete" : "note.delete", { id: it.id })
                    }
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-muted"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LifeView({ data, act, go }: { data: UserData; act: Act; go: (r: Route) => void }) {
  const today = todayYmd();
  const due = data.actions.filter((a) => a.outcome === "pending" && a.due_date && a.due_date <= today);
  const upcoming = data.actions.filter((a) => a.outcome === "pending" && !(a.due_date && a.due_date <= today));
  const done = data.actions.filter((a) => a.outcome !== "pending");
  const worked = done.filter((a) => a.outcome === "worked").length;

  const byArea = (list: LifeAction[]) => {
    const m = new Map<string, LifeAction[]>();
    for (const a of list) {
      const k = a.area ?? "Sin tema";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return Array.from(m.entries());
  };

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-6 pb-32 pt-[max(3.5rem,calc(env(safe-area-inset-top)+1.5rem))]">
      <div>
        <h1 className="m-0 font-serif text-[36px] font-semibold tracking-tight">Mi vida</h1>
        <p className="m-0 mt-1 text-[13px] text-muted">
          {data.actions.length === 0
            ? "Lo que aprendes, llevado a la práctica."
            : `${upcoming.length + due.length} en curso${done.length ? ` · ${worked} de ${done.length} funcionaron` : ""}`}
        </p>
      </div>

      {data.actions.length === 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-card px-5 py-5">
          <p className="m-0 font-serif text-lg font-semibold">Aún no hay acciones</p>
          <p className="m-0 text-sm leading-relaxed text-ink-2">
            Al terminar un capítulo toca <span className="font-semibold">“Llévalo a tu vida”</span>, o selecciona una frase y toca{" "}
            <span className="font-semibold">Mi vida</span>. Escribe un paso concreto con fecha y aquí te pregunto si funcionó.
          </p>
          <button
            type="button"
            onClick={() => go({ name: "vault" })}
            className="h-11 self-start rounded-full bg-ink px-5 text-sm font-semibold text-paper"
          >
            Ir a leer
          </button>
        </div>
      ) : null}

      {due.length ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="m-0 text-[13px] font-medium uppercase tracking-[0.14em] text-warn-ink">Toca revisar</h2>
          {due.map((a) => (
            <ActionCard key={a.id} a={a} act={act} go={go} />
          ))}
        </section>
      ) : null}

      {byArea(upcoming).map(([area, list]) => (
        <section key={area} className="flex flex-col gap-2.5">
          <h2 className="m-0 text-[13px] font-medium uppercase tracking-[0.14em] text-muted">{area}</h2>
          {list.map((a) => (
            <ActionCard key={a.id} a={a} act={act} go={go} />
          ))}
        </section>
      ))}

      {done.length ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="m-0 text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Hechas</h2>
          {done.map((a) => (
            <ActionCard key={a.id} a={a} act={act} go={go} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
