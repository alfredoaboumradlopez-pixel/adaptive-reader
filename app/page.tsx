"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotebookView, LifeView } from "@/components/tar/notebook";
import { ReaderView } from "@/components/tar/reader";
import { ApplyView, QuestionsView } from "@/components/tar/study";
import { BottomNav, Toast, type Tab } from "@/components/tar/ui";
import { BookView, VaultView } from "@/components/tar/vault";
import { type Route, chapterState, useLibrary, useRoute, useUserData } from "@/lib/tar";

const KnowledgeEmpireGraph = dynamic(
  () => import("@/components/knowledge-empire-graph").then((m) => m.KnowledgeEmpireGraph),
  { ssr: false, loading: () => <div className="h-[100dvh] bg-paper" /> },
);

const MASTERY_COLOR = {
  mastered: "#1f7a55",
  progress: "#b7791f",
  review: "#c0392b",
  reading: "#2f5bea",
  new: "#b5b1a6",
} as const;

function tabFor(route: Route): Tab | null {
  switch (route.name) {
    case "vault":
    case "book":
      return "vault";
    case "notebook":
      return "notebook";
    case "life":
      return "life";
    case "map":
      return "map";
    default:
      return null; // focused screens (reader, questions, apply) hide the nav
  }
}

export default function HomePage() {
  const [route, go] = useRoute();
  const library = useLibrary();
  const user = useUserData();
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const toast = useCallback((t: string) => {
    setToastText(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastText(null), 2600);
  }, []);

  // Each screen starts at the top.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  const colors = useMemo(() => {
    const c: Record<string, string> = {};
    for (const [id] of library.nodeById) c[id] = MASTERY_COLOR[chapterState(id, user.data)];
    return c;
  }, [library.nodeById, user.data]);

  const tab = tabFor(route);
  const waitingForUser = user.status === "loading";

  let screen: React.ReactNode = null;
  if (route.name === "vault") {
    screen = <VaultView books={library.books} data={user.data} loading={library.loading} go={go} />;
  } else if (route.name === "book") {
    const book = library.books.find((b) => b.slug === route.slug);
    screen = book ? (
      <BookView book={book} data={user.data} go={go} back={() => go({ name: "vault" })} />
    ) : library.loading ? null : (
      <VaultView books={library.books} data={user.data} loading={false} go={go} />
    );
  } else if (route.name === "read" || route.name === "questions" || route.name === "apply") {
    const node = library.nodeById.get(route.id);
    const book = library.books.find((b) => b.nodes.some((n) => n.id === route.id));
    if (!node || waitingForUser) {
      screen =
        library.loading || waitingForUser ? (
          <p className="px-6 pt-20 text-sm text-muted">Cargando…</p>
        ) : (
          <div className="px-6 pt-20">
            <p className="text-sm text-muted">No encontré ese capítulo.</p>
            <button type="button" onClick={() => go({ name: "vault" })} className="mt-3 text-sm font-semibold text-accent-ink">
              Ir al Vault
            </button>
          </div>
        );
    } else if (route.name === "read") {
      screen = (
        <ReaderView
          key={node.id}
          node={node}
          book={book}
          data={user.data}
          act={user.act}
          go={go}
          back={() => go(book ? { name: "book", slug: book.slug } : { name: "vault" })}
          toast={toast}
        />
      );
    } else if (route.name === "questions") {
      screen = (
        <QuestionsView
          node={node}
          tab={route.tab ?? "test"}
          data={user.data}
          act={user.act}
          go={go}
          back={() => go({ name: "read", id: node.id })}
          toast={toast}
        />
      );
    } else {
      screen = (
        <ApplyView
          node={node}
          data={user.data}
          act={user.act}
          go={go}
          back={() => go({ name: "read", id: node.id })}
          toast={toast}
        />
      );
    }
  } else if (route.name === "notebook") {
    screen = <NotebookView data={user.data} act={user.act} go={go} />;
  } else if (route.name === "life") {
    screen = <LifeView data={user.data} act={user.act} go={go} />;
  } else if (route.name === "map") {
    const all = library.books.flatMap((b) => b.nodes);
    screen = (
      <div className="fixed inset-0">
        <KnowledgeEmpireGraph
          nodes={all}
          links={library.links}
          colors={colors}
          onNodeClick={(n) => go({ name: "read", id: n.id })}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 px-6 pt-[max(3.5rem,calc(env(safe-area-inset-top)+1.5rem))]">
          <h1 className="m-0 font-serif text-[36px] font-semibold tracking-tight">Mapa</h1>
          <p className="m-0 mt-1 text-[13px] text-muted">Toca un capítulo para leerlo.</p>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-ink-2">
            {(
              [
                ["Dominado", MASTERY_COLOR.mastered],
                ["En proceso", MASTERY_COLOR.progress],
                ["Por repasar", MASTERY_COLOR.review],
                ["Leyendo", MASTERY_COLOR.reading],
                ["Sin empezar", MASTERY_COLOR.new],
              ] as const
            ).map(([label, color]) => (
              <li key={label} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-paper text-ink">
      {user.status === "offline" ? (
        <div className="fixed inset-x-0 top-0 z-[90] bg-warn px-4 pb-1.5 pt-[max(0.4rem,env(safe-area-inset-top))] text-center text-xs font-medium text-white">
          Sin conexión con el servidor: tus notas no se están guardando.
          <button type="button" onClick={user.refresh} className="ml-2 underline">
            Reintentar
          </button>
        </div>
      ) : null}
      {screen}
      {tab ? <BottomNav active={tab} onGo={(t) => go({ name: t })} /> : null}
      <Toast text={toastText} />
    </div>
  );
}
