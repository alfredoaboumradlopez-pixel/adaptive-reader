"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EmpireLink, EmpireNode } from "@/lib/knowledge-empire-data";

// ─────────────────────────────────────────────────────────────
// Types coming from /api/me
// ─────────────────────────────────────────────────────────────

export type Note = {
  id: string;
  node_id: string;
  book_title: string;
  chapter: string;
  quote: string | null;
  body: string | null;
  area: string | null;
  kind: "note" | "highlight";
  created_at: string;
};
export type Question = {
  id: string;
  node_id: string;
  book_title: string;
  chapter: string;
  quote: string | null;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};
export type Review = {
  node_id: string;
  mastery: "Red" | "Yellow" | "Green";
  interval_days: number;
  due_at: string;
  last_answer: string | null;
  last_rating: "no" | "meh" | "yes" | null;
  updated_at: string;
};
export type LifeAction = {
  id: string;
  node_id: string;
  book_title: string;
  chapter: string;
  area: string | null;
  situation: string | null;
  step: string;
  due_date: string | null;
  outcome: "pending" | "worked" | "didnt";
  created_at: string;
};
export type Progress = { node_id: string; sprint_index: number; updated_at: string };

export type UserData = {
  notes: Note[];
  questions: Question[];
  reviews: Review[];
  actions: LifeAction[];
  progress: Progress[];
  areas: string[];
};

const EMPTY: UserData = { notes: [], questions: [], reviews: [], actions: [], progress: [], areas: [] };

// ─────────────────────────────────────────────────────────────
// Library (curated books from the repo)
// ─────────────────────────────────────────────────────────────

export type Book = {
  slug: string;
  title: string;
  author: string | null;
  nodes: EmpireNode[];
};

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function chapterNum(node: EmpireNode): number {
  const n = parseInt(node.chapter.split(":")[0], 10);
  return Number.isNaN(n) ? 0 : n;
}

export function chapterTitle(node: EmpireNode): string {
  const i = node.chapter.indexOf(":");
  return i === -1 ? node.chapter : node.chapter.slice(i + 1).trim();
}

export function chapterLabel(node: EmpireNode): string {
  const n = chapterNum(node);
  if (n === 0) return "Introducción";
  if (n >= 90) return "Conclusión";
  return `Capítulo ${n}`;
}

/** "Capítulo 2 · Lean AI", or just "Introducción" / "Conclusión". */
export function chapterHeading(node: EmpireNode): string {
  const n = chapterNum(node);
  return n === 0 || n >= 90 ? chapterLabel(node) : `${chapterLabel(node)} · ${chapterTitle(node)}`;
}

export function useLibrary() {
  const [state, setState] = useState<{ books: Book[]; links: EmpireLink[]; loading: boolean }>({
    books: [],
    links: [],
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/books", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { nodes: EmpireNode[]; links: EmpireLink[]; books?: { bookTitle: string; author: string | null }[] }) => {
        if (cancelled) return;
        const meta = new Map((data.books ?? []).map((b) => [b.bookTitle, b.author]));
        const byTitle = new Map<string, EmpireNode[]>();
        for (const n of data.nodes ?? []) {
          if (!byTitle.has(n.bookTitle)) byTitle.set(n.bookTitle, []);
          byTitle.get(n.bookTitle)!.push(n);
        }
        const books: Book[] = Array.from(byTitle.entries()).map(([title, nodes]) => ({
          slug: slugify(title),
          title,
          author: meta.get(title) ?? null,
          nodes: [...nodes].sort((a, b) => chapterNum(a) - chapterNum(b)),
        }));
        setState({ books, links: data.links ?? [], loading: false });
      })
      .catch(() => !cancelled && setState((s) => ({ ...s, loading: false })));
    return () => {
      cancelled = true;
    };
  }, []);

  const nodeById = useMemo(() => {
    const m = new Map<string, EmpireNode>();
    for (const b of state.books) for (const n of b.nodes) m.set(n.id, n);
    return m;
  }, [state.books]);

  return { ...state, nodeById };
}

// ─────────────────────────────────────────────────────────────
// User data (notes, questions, reviews…) synced through /api/me
// ─────────────────────────────────────────────────────────────

export function useUserData() {
  const [data, setData] = useState<UserData>(EMPTY);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("loading");

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
      setStatus("ready");
    } catch {
      setStatus("offline");
    }
  }, []);

  useEffect(() => {
    refresh();
    // Pick up changes made on another device when coming back to the app.
    const onFocus = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [refresh]);

  const act = useCallback(async (action: string, payload: Record<string, unknown> = {}): Promise<boolean> => {
    try {
      const r = await fetch("/api/me", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      if (!r.ok) return false;
      setData(await r.json());
      setStatus("ready");
      return true;
    } catch {
      setStatus("offline");
      return false;
    }
  }, []);

  return { data, status, act, refresh };
}

/** Payload identifying a chapter for /api/me writes. */
export function nodeRef(node: EmpireNode) {
  return { nodeId: node.id, bookTitle: node.bookTitle, chapter: node.chapter };
}

// ─────────────────────────────────────────────────────────────
// Hash router — keeps place on reload and works with iOS back swipe
// ─────────────────────────────────────────────────────────────

export type Route =
  | { name: "vault" }
  | { name: "book"; slug: string }
  | { name: "read"; id: string }
  | { name: "questions"; id: string; tab?: "test" | "mine" }
  | { name: "apply"; id: string }
  | { name: "notebook" }
  | { name: "life" }
  | { name: "map" };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  switch (parts[0]) {
    case "book":
      return parts[1] ? { name: "book", slug: parts[1] } : { name: "vault" };
    case "read":
      return parts[1] ? { name: "read", id: parts[1] } : { name: "vault" };
    case "questions":
      return parts[1] ? { name: "questions", id: parts[1], tab: parts[2] === "mine" ? "mine" : "test" } : { name: "vault" };
    case "apply":
      return parts[1] ? { name: "apply", id: parts[1] } : { name: "vault" };
    case "notebook":
      return { name: "notebook" };
    case "life":
      return { name: "life" };
    case "map":
      return { name: "map" };
    default:
      return { name: "vault" };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case "book":
      return `#/book/${encodeURIComponent(route.slug)}`;
    case "read":
      return `#/read/${encodeURIComponent(route.id)}`;
    case "questions":
      return `#/questions/${encodeURIComponent(route.id)}${route.tab === "mine" ? "/mine" : ""}`;
    case "apply":
      return `#/apply/${encodeURIComponent(route.id)}`;
    default:
      return `#/${route.name}`;
  }
}

export function useRoute(): [Route, (r: Route, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState<Route>({ name: "vault" });
  useEffect(() => {
    const sync = () => setRoute(parseHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const go = useCallback((r: Route, opts?: { replace?: boolean }) => {
    const h = href(r);
    if (opts?.replace) {
      window.history.replaceState(null, "", h);
      setRoute(r);
    } else {
      window.location.hash = h;
    }
  }, []);
  return [route, go];
}

// ─────────────────────────────────────────────────────────────
// Small formatting helpers
// ─────────────────────────────────────────────────────────────

export function relativeDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) /
      86_400_000,
  );
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

export function todayYmd(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function readingMinutes(text: string): number {
  return Math.max(1, Math.round(text.split(/\s+/).length / 200));
}

export type ChapterState = "mastered" | "progress" | "review" | "reading" | "new";

export function chapterState(nodeId: string, data: UserData): ChapterState {
  const r = data.reviews.find((x) => x.node_id === nodeId);
  if (r?.mastery === "Green") return "mastered";
  if (r?.mastery === "Yellow") return "progress";
  if (r?.mastery === "Red") return "review";
  if (data.progress.some((p) => p.node_id === nodeId)) return "reading";
  return "new";
}

export const STATE_LABEL: Record<ChapterState, string> = {
  mastered: "Dominado",
  progress: "En proceso",
  review: "Por repasar",
  reading: "Leyendo",
  new: "",
};
