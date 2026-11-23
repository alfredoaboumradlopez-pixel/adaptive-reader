"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ChapterVisualView from "@/components/chapter-visual";
import type { EmpireNode } from "@/lib/knowledge-empire-data";
import {
  type Book,
  type Note,
  type Route,
  type UserData,
  chapterLabel,
  chapterTitle,
  nodeRef,
  readingMinutes,
} from "@/lib/tar";
import { AreaChips, Icon, Quote, Sheet, TopBar, primaryButton, textareaClass } from "./ui";

const FONT_SIZES = [17, 19, 22];
const FONT_KEY = "tar-font-size";

/** Wraps every saved quote that appears in `text` in a highlight mark. */
function withMarks(text: string, quotes: string[]): ReactNode {
  const ranges: [number, number][] = [];
  for (const q of quotes) {
    const i = text.indexOf(q);
    if (i !== -1) ranges.push([i, i + q.length]);
  }
  if (!ranges.length) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  const out: ReactNode[] = [];
  let pos = 0;
  merged.forEach(([a, b], k) => {
    if (a > pos) out.push(text.slice(pos, a));
    out.push(
      <mark key={k} className="rounded-[2px] bg-mark px-0.5 text-inherit">
        {text.slice(a, b)}
      </mark>,
    );
    pos = b;
  });
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

type SheetState = { kind: "note" | "question"; quote: string | null } | { kind: "chapterNotes" } | null;

export function ReaderView({
  node,
  book,
  data,
  act,
  go,
  back,
  toast,
}: {
  node: EmpireNode;
  book: Book | undefined;
  data: UserData;
  act: (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
  go: (r: Route) => void;
  back: () => void;
  toast: (t: string) => void;
}) {
  const sprints = node.narrativeSprints ?? [];
  const last = Math.max(0, sprints.length - 1);
  const saved = data.progress.find((p) => p.node_id === node.id)?.sprint_index ?? 0;
  const [index, setIndex] = useState(() => Math.min(saved, last));
  const [fontSize, setFontSize] = useState(19);
  const [selection, setSelection] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // Restore preferred text size.
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(FONT_KEY));
      if (FONT_SIZES.includes(v)) setFontSize(v);
    } catch {}
  }, []);

  // Reset when the chapter changes.
  useEffect(() => {
    setIndex(Math.min(data.progress.find((p) => p.node_id === node.id)?.sprint_index ?? 0, last));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const goToSprint = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(last, i));
      setIndex(next);
      window.scrollTo({ top: 0 });
      void act("progress.set", { nodeId: node.id, sprintIndex: next });
    },
    [act, last, node.id],
  );

  // Record that this chapter was opened (drives "Leyendo ahora").
  useEffect(() => {
    void act("progress.set", { nodeId: node.id, sprintIndex: Math.min(saved, last) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  // Track text selected inside the sprint to offer Subrayar / Nota / Preguntar / Mi vida.
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      const el = textRef.current;
      if (!sel || sel.isCollapsed || !el || !sel.anchorNode || !sel.focusNode) {
        setSelection(null);
        return;
      }
      if (!el.contains(sel.anchorNode) || !el.contains(sel.focusNode)) {
        setSelection(null);
        return;
      }
      const t = sel.toString().replace(/\s+/g, " ").trim();
      setSelection(t.length >= 3 ? t.slice(0, 600) : null);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  const chapterNotes = useMemo(() => data.notes.filter((n) => n.node_id === node.id), [data.notes, node.id]);
  const sprintText = sprints[index] ?? "";
  const quotesHere = chapterNotes.map((n) => n.quote).filter((q): q is string => !!q && sprintText.includes(q));
  const notesHere = chapterNotes.filter((n): n is Note & { body: string } => !!n.body && !!n.quote && sprintText.includes(n.quote));
  const minutesLeft = sprints.slice(index).reduce((a, s) => a + readingMinutes(s), 0);
  const visualAt = Math.min(node.visualAfterSprint ?? 1, last);
  const isLast = index === last;

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  };

  const highlight = async () => {
    if (!selection) return;
    const ok = await act("note.add", { ...nodeRef(node), quote: selection, kind: "highlight" });
    clearSelection();
    toast(ok ? "Subrayado" : "No se pudo guardar");
  };

  const cycleFont = () => {
    const next = FONT_SIZES[(FONT_SIZES.indexOf(fontSize) + 1) % FONT_SIZES.length];
    setFontSize(next);
    try {
      localStorage.setItem(FONT_KEY, String(next));
    } catch {}
  };

  const keyMech = node.keyMechanism ?? null;

  return (
    <div className="mx-auto w-full max-w-[680px] pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      <TopBar
        backLabel="Capítulos"
        onBack={back}
        right={
          <>
            <button
              type="button"
              aria-label="Tamaño de letra"
              onClick={cycleFont}
              className="h-11 w-11 font-serif text-base font-semibold text-ink active:opacity-60"
            >
              Aa
            </button>
            <button
              type="button"
              aria-label="Notas de este capítulo"
              onClick={() => setSheet({ kind: "chapterNotes" })}
              className="relative flex h-11 w-11 items-center justify-center text-ink active:opacity-60"
            >
              <Icon name="pen" size={20} />
              {chapterNotes.length ? (
                <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-accent px-1 text-[10px] font-semibold leading-4 text-white">
                  {chapterNotes.length}
                </span>
              ) : null}
            </button>
          </>
        }
      />

      <article className="flex flex-col gap-[18px] px-[30px] pt-2">
        <div>
          <p className="m-0 text-xs uppercase tracking-[0.16em] text-muted">
            {chapterLabel(node)} · {book?.title ?? node.bookTitle}
          </p>
          <h1 className="m-0 mt-1.5 font-serif text-[32px] font-semibold leading-[1.1] tracking-tight">{chapterTitle(node)}</h1>
        </div>
        {index === 0 ? (
          <p className="m-0 font-serif text-[15px] italic leading-relaxed text-muted">{node.supportingContext}</p>
        ) : null}
        <div className="h-px bg-line" />

        <div ref={textRef}>
          <p className="m-0 font-serif leading-[1.7] text-ink" style={{ fontSize }}>
            {withMarks(sprintText, quotesHere)}
          </p>
        </div>

        {notesHere.map((n) => (
          <aside key={n.id} className="flex gap-3 rounded-xl border border-line bg-card px-4 py-3.5">
            <span className="w-[3px] shrink-0 rounded-full bg-accent" />
            <p className="m-0 text-[13px] leading-normal text-ink-2">
              <span className="font-semibold text-ink">Tu nota · </span>
              {n.body}
            </p>
          </aside>
        ))}

        {node.visual && index === visualAt ? <ChapterVisualView visual={node.visual} /> : null}

        {isLast ? (
          <section className="mt-4 flex flex-col gap-5">
            <div className="rounded-xl border border-line bg-card px-5 py-4">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-ink">La idea clave</p>
              <p className="m-0 mt-2 font-serif text-lg leading-relaxed">{node.goldenThread}</p>
            </div>
            {keyMech ? (
              <div className="px-1">
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Mecanismo</p>
                <p className="m-0 mt-1.5 text-sm leading-relaxed text-ink-2">{keyMech}</p>
              </div>
            ) : null}
            {node.authorQuote ? <Quote>“{node.authorQuote.replace(/^["“]|["”]$/g, "")}”</Quote> : null}
            <div className="mt-2 grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => go({ name: "questions", id: node.id })}
                className="h-[50px] rounded-full bg-ink text-[15px] font-semibold text-paper active:opacity-80"
              >
                Ponte a prueba
              </button>
              <button
                type="button"
                onClick={() => go({ name: "apply", id: node.id })}
                className="h-[50px] rounded-full border border-line-2 bg-card text-[15px] font-semibold text-ink active:bg-chip"
              >
                Llévalo a tu vida
              </button>
            </div>
          </section>
        ) : null}
      </article>

      {/* Selection toolbar */}
      {selection ? (
        <div
          role="toolbar"
          aria-label="Acciones sobre el texto seleccionado"
          className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex w-fit gap-0.5 rounded-xl bg-ink p-1 shadow-[0_10px_28px_rgba(23,24,28,0.25)]"
          onPointerDown={(e) => e.preventDefault()}
        >
          <button type="button" onClick={highlight} className="h-10 rounded-[9px] px-3 text-[13px] font-medium text-paper">
            Subrayar
          </button>
          <button
            type="button"
            onClick={() => {
              setSheet({ kind: "note", quote: selection });
              clearSelection();
            }}
            className="h-10 rounded-[9px] bg-accent px-3 text-[13px] font-semibold text-white"
          >
            Nota
          </button>
          <button
            type="button"
            onClick={() => {
              setSheet({ kind: "question", quote: selection });
              clearSelection();
            }}
            className="h-10 rounded-[9px] px-3 text-[13px] font-medium text-paper"
          >
            Preguntar
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem("tar-apply-quote", selection);
              } catch {}
              clearSelection();
              go({ name: "apply", id: node.id });
            }}
            className="h-10 rounded-[9px] px-3 text-[13px] font-medium text-paper"
          >
            Mi vida
          </button>
        </div>
      ) : null}

      {/* Footer: progress + prev/next */}
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[680px] items-center justify-between px-[30px] pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <span className="text-[13px] text-muted">
            {index + 1} de {sprints.length} · {minutesLeft} min{minutesLeft === 1 ? "" : " restantes"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Sprint anterior"
              disabled={index === 0}
              onClick={() => goToSprint(index - 1)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-line-2 bg-card text-ink disabled:opacity-35"
            >
              <Icon name="back" />
            </button>
            <button
              type="button"
              aria-label={isLast ? "Ponte a prueba" : "Siguiente sprint"}
              onClick={() => (isLast ? go({ name: "questions", id: node.id }) : goToSprint(index + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-paper"
            >
              <Icon name="next" />
            </button>
          </div>
        </div>
      </footer>

      {sheet?.kind === "note" ? (
        <NoteSheet
          quote={sheet.quote}
          areas={data.areas}
          onAddArea={(name) => act("area.add", { name })}
          onClose={() => setSheet(null)}
          onSave={async (body, area) => {
            const ok = await act("note.add", { ...nodeRef(node), quote: sheet.quote, body, area });
            if (ok) setSheet(null);
            toast(ok ? "Nota guardada" : "No se pudo guardar");
          }}
        />
      ) : null}

      {sheet?.kind === "question" ? (
        <QuestionSheet
          quote={sheet.quote}
          onClose={() => setSheet(null)}
          onSave={async (question) => {
            const ok = await act("question.add", { ...nodeRef(node), quote: sheet.quote, question });
            if (ok) setSheet(null);
            toast(ok ? "Pregunta guardada — te la respondo en nuestra próxima sesión" : "No se pudo guardar");
          }}
        />
      ) : null}

      {sheet?.kind === "chapterNotes" ? (
        <Sheet title="Notas del capítulo" onClose={() => setSheet(null)}>
          {chapterNotes.length === 0 ? (
            <p className="m-0 text-sm leading-relaxed text-muted">
              Aún no hay notas. Selecciona cualquier frase del texto para subrayarla, anotarla o hacer una pregunta.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-4 p-0">
              {chapterNotes.map((n) => (
                <li key={n.id} className="flex flex-col gap-1.5 border-b border-line pb-4 last:border-b-0">
                  {n.quote ? <Quote>{n.quote}</Quote> : null}
                  {n.body ? <p className="m-0 text-[15px] leading-snug">{n.body}</p> : null}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">{n.kind === "highlight" ? "Subrayado" : n.area ?? "Nota"}</span>
                    <button
                      type="button"
                      onClick={() => act("note.delete", { id: n.id })}
                      className="flex h-9 items-center gap-1 px-1 text-xs text-muted"
                    >
                      <Icon name="trash" size={14} /> Borrar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setSheet({ kind: "note", quote: null })} className={primaryButton}>
            Escribir una nota
          </button>
        </Sheet>
      ) : null}
    </div>
  );
}

function NoteSheet({
  quote,
  areas,
  onAddArea,
  onClose,
  onSave,
}: {
  quote: string | null;
  areas: string[];
  onAddArea: (name: string) => void;
  onClose: () => void;
  onSave: (body: string, area: string | null) => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [area, setArea] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Nueva nota" onClose={onClose}>
      {quote ? <Quote>“{quote}”</Quote> : null}
      <label htmlFor="note-body" className="text-xs text-muted">
        Lo que pienso
      </label>
      <textarea
        id="note-body"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className={`-mt-2 ${textareaClass}`}
        placeholder="Escribe tu idea…"
      />
      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs text-muted">Relacionar con</p>
        <AreaChips areas={areas} value={area} onChange={setArea} onAdd={onAddArea} />
      </div>
      <button
        type="button"
        disabled={busy || (!body.trim() && !quote)}
        onClick={async () => {
          setBusy(true);
          await onSave(body, area);
          setBusy(false);
        }}
        className={primaryButton}
      >
        {busy ? "Guardando…" : "Guardar nota"}
      </button>
    </Sheet>
  );
}

function QuestionSheet({
  quote,
  onClose,
  onSave,
}: {
  quote: string | null;
  onClose: () => void;
  onSave: (q: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Nueva pregunta" onClose={onClose}>
      {quote ? <Quote>“{quote}”</Quote> : null}
      <label htmlFor="q-body" className="text-xs text-muted">
        ¿Qué no te quedó claro?
      </label>
      <textarea
        id="q-body"
        rows={3}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className={`-mt-2 ${textareaClass}`}
        placeholder="Tu pregunta…"
      />
      <p className="m-0 text-xs leading-relaxed text-muted">Te la respondo en nuestra próxima sesión y aparece aquí mismo.</p>
      <button
        type="button"
        disabled={busy || !q.trim()}
        onClick={async () => {
          setBusy(true);
          await onSave(q);
          setBusy(false);
        }}
        className={primaryButton}
      >
        {busy ? "Guardando…" : "Guardar pregunta"}
      </button>
    </Sheet>
  );
}
