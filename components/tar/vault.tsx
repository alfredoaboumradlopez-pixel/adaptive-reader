"use client";

import type { EmpireNode } from "@/lib/knowledge-empire-data";
import {
  type Book,
  type Route,
  type UserData,
  chapterHeading,
  chapterLabel,
  chapterState,
  chapterTitle,
  STATE_LABEL,
} from "@/lib/tar";
import { BookCover, StateMark, TopBar } from "./ui";

function lastReading(books: Book[], data: UserData): { book: Book; node: EmpireNode; sprint: number } | null {
  for (const p of data.progress) {
    for (const book of books) {
      const node = book.nodes.find((n) => n.id === p.node_id);
      if (node) return { book, node, sprint: p.sprint_index };
    }
  }
  const first = books[0];
  return first?.nodes[0] ? { book: first, node: first.nodes[0], sprint: 0 } : null;
}

export function VaultView({
  books,
  data,
  loading,
  go,
}: {
  books: Book[];
  data: UserData;
  loading: boolean;
  go: (r: Route) => void;
}) {
  const current = lastReading(books, data);
  const now = Date.now();
  const due = data.reviews.filter((r) => new Date(r.due_at).getTime() <= now);
  const started = data.progress.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-7 px-6 pb-32 pt-[max(3.5rem,calc(env(safe-area-inset-top)+1.5rem))]">
      <h1 className="m-0 font-serif text-[36px] font-semibold tracking-tight">The Vault</h1>

      {loading ? <p className="text-sm text-muted">Cargando biblioteca…</p> : null}

      {current ? (
        <section className="flex items-stretch gap-4">
          <BookCover title={current.book.title} />
          <div className="flex flex-1 flex-col justify-between gap-3">
            <div>
              <p className="m-0 text-xs uppercase tracking-[0.14em] text-muted">{started ? "Leyendo ahora" : "Empieza aquí"}</p>
              <p className="m-0 mt-1.5 font-serif text-[19px] font-semibold leading-snug">
                {chapterHeading(current.node)}
              </p>
              <p className="m-0 mt-1 text-[13px] text-muted">{current.book.author ?? current.book.title}</p>
            </div>
            <button
              type="button"
              onClick={() => go({ name: "read", id: current.node.id })}
              className="h-11 rounded-full bg-ink text-sm font-semibold text-paper active:opacity-80"
            >
              {started ? "Continuar" : "Empezar a leer"}
            </button>
          </div>
        </section>
      ) : null}

      {due.length > 0 ? (
        <button
          type="button"
          onClick={() => go({ name: "questions", id: due[0].node_id })}
          className="flex items-center justify-between rounded-xl border border-warn-line bg-card px-4 py-3.5 text-left"
        >
          <span>
            <span className="block text-sm font-semibold">Repaso pendiente</span>
            <span className="block text-[13px] text-muted">
              {due.length} {due.length === 1 ? "capítulo toca" : "capítulos tocan"} repasar hoy
            </span>
          </span>
          <span className="text-sm font-semibold text-accent-ink">Repasar →</span>
        </button>
      ) : null}

      <section className="flex flex-col">
        <h2 className="m-0 mb-1 text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Libros</h2>
        {books.map((book) => {
          const mastered = book.nodes.filter((n) => chapterState(n.id, data) === "mastered").length;
          const notes = data.notes.filter((n) => n.book_title === book.title).length;
          return (
            <button
              key={book.slug}
              type="button"
              onClick={() => go({ name: "book", slug: book.slug })}
              className="flex items-center gap-4 border-b border-line py-4 text-left last:border-b-0"
            >
              <BookCover title={book.title} size="sm" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-serif text-[17px] font-semibold">{book.title}</span>
                <span className="text-[13px] text-muted">
                  {book.author ? `${book.author} · ` : ""}
                  {book.nodes.length} capítulos{notes ? ` · ${notes} notas` : ""}
                </span>
                <span className="mt-1 flex h-[5px] overflow-hidden rounded-full bg-chip">
                  <span className="bg-ok" style={{ width: `${(mastered / Math.max(1, book.nodes.length)) * 100}%` }} />
                </span>
              </span>
            </button>
          );
        })}
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          ¿Otro libro? Mándame el PDF en nuestra sesión y lo curo para ti.
        </p>
      </section>
    </div>
  );
}

export function BookView({ book, data, go, back }: { book: Book; data: UserData; go: (r: Route) => void; back: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[640px] pb-32">
      <TopBar backLabel="Vault" onBack={back} />
      <div className="flex flex-col gap-6 px-6 pt-2">
        <section className="flex items-end gap-4">
          <BookCover title={book.title} />
          <div className="flex flex-col gap-1">
            <h1 className="m-0 font-serif text-[26px] font-semibold leading-tight">{book.title}</h1>
            {book.author ? <p className="m-0 text-sm text-muted">{book.author}</p> : null}
          </div>
        </section>

        <section>
          <h2 className="m-0 mb-1 text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Capítulos</h2>
          <ul className="m-0 list-none p-0">
            {book.nodes.map((node) => {
              const state = chapterState(node.id, data);
              const notes = data.notes.filter((n) => n.node_id === node.id).length;
              const meta = [STATE_LABEL[state], notes ? `${notes} ${notes === 1 ? "nota" : "notas"}` : ""]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={node.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => go({ name: "read", id: node.id })}
                    className="flex min-h-[56px] w-full items-center gap-3 py-3.5 text-left"
                  >
                    <StateMark state={state} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-xs text-muted">{chapterLabel(node)}</span>
                      <span className={`font-serif text-base ${state === "reading" ? "font-semibold" : ""}`}>
                        {chapterTitle(node)}
                      </span>
                    </span>
                    {meta ? (
                      <span className={`shrink-0 text-xs ${state === "reading" ? "font-semibold text-accent-ink" : "text-muted"}`}>
                        {meta}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
