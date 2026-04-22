"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EmpireLink,
  EmpireNode,
  MasteryStatus,
  knowledgeGraphData,
} from "@/lib/knowledge-empire-data";

const KnowledgeEmpireGraph = dynamic(
  () =>
    import("@/components/knowledge-empire-graph").then(
      (mod) => mod.KnowledgeEmpireGraph,
    ),
  { ssr: false },
);

const masteryStyles: Record<
  EmpireNode["masteryStatus"],
  { label: string; dot: string; badge: string }
> = {
  Green: {
    label: "Mastery Achieved",
    dot: "bg-emerald-400",
    badge: "border-emerald-400/40 bg-emerald-400/20 text-emerald-100",
  },
  Yellow: {
    label: "Needs Refinement",
    dot: "bg-amber-300",
    badge: "border-amber-300/40 bg-amber-300/20 text-amber-50",
  },
  Red: {
    label: "Needs Refinement",
    dot: "bg-rose-400",
    badge: "border-rose-400/40 bg-rose-400/20 text-rose-100",
  },
};

const LOCAL_STORAGE_KEY = "adaptive-reader-data";

function slugify(text: string): string {
  return text
    .replace(/^chapter\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s:-]/g, "")
    .replace(/:\s*/g, "-")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function chapterNum(chapter: string): number {
  return parseInt(chapter.match(/\d+/)?.[0] ?? "0", 10);
}

const statusColor: Record<MasteryStatus, string> = {
  Green: "#10B981",
  Yellow: "#F59E0B",
  Red: "#EF4444",
};

type GraphPayload = {
  nodes: EmpireNode[];
  links: EmpireLink[];
};

type ExecutiveBrief = {
  query: string;
  nodes: EmpireNode[];
  synthesis: string;
};

type ChatMessage = {
  id: string;
  role: "ai" | "user";
  content: string;
};

function mergeNodeDefaults(node: EmpireNode): EmpireNode {
  const defaults = knowledgeGraphData.nodes.find((n) => n.id === node.id);
  if (!defaults) return node;
  return {
    ...defaults,
    ...node,
    tags: node.tags?.length ? node.tags : defaults.tags,
    narrativeSprints:
      node.narrativeSprints?.length > 0
        ? node.narrativeSprints
        : defaults.narrativeSprints,
    supportingContext: node.supportingContext || defaults.supportingContext,
  };
}

export default function HomePage() {
  const [currentView, setCurrentView] = useState<"map" | "library">("map");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [libraryReadingNode, setLibraryReadingNode] = useState<EmpireNode | null>(null);
  const [graphState, setGraphState] = useState<GraphPayload>(knowledgeGraphData);
  const [activeNode, setActiveNode] = useState<EmpireNode | null>(null);
  const [socraticContextNode, setSocraticContextNode] = useState<EmpireNode | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);
  const [summonQuery, setSummonQuery] = useState("");
  const [brief, setBrief] = useState<ExecutiveBrief | null>(null);
  const [isSocraticChatOpen, setIsSocraticChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isMockAiThinking, setIsMockAiThinking] = useState(false);
  const [isDropzoneActive, setIsDropzoneActive] = useState(false);
  const [currentSprintIndex, setCurrentSprintIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOpen = Boolean(activeNode) && currentView === "map";

  const masteryTone = useMemo(() => {
    if (!activeNode) return masteryStyles.Yellow;
    return masteryStyles[activeNode.masteryStatus];
  }, [activeNode]);

  const readingMasteryTone = useMemo(() => {
    if (!libraryReadingNode) return masteryStyles.Yellow;
    return masteryStyles[libraryReadingNode.masteryStatus];
  }, [libraryReadingNode]);

  const sprintNode = socraticContextNode ?? activeNode;

  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) {
      setGraphState(knowledgeGraphData);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as Partial<GraphPayload>;
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.links)) {
        const nodes = (parsed.nodes as EmpireNode[]).map(mergeNodeDefaults);
        setGraphState({
          nodes,
          links: parsed.links as EmpireLink[],
        });
        return;
      }
    } catch {
      // Fall back to mock graph if parse fails.
    }

    setGraphState(knowledgeGraphData);
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(graphState));
  }, [graphState]);

  useEffect(() => {
    if (currentView === "library") {
      setActiveNode(null);
      setBrief(null);
      setIsSocraticChatOpen(false);
      setSocraticContextNode(null);
    } else {
      setSelectedBook(null);
      setLibraryReadingNode(null);
    }
  }, [currentView]);

  useEffect(() => {
    setLibraryReadingNode(null);
  }, [selectedBook]);

  useEffect(() => {
    setCurrentSprintIndex(0);
  }, [libraryReadingNode?.id]);

  useEffect(() => {
    if (!isProcessingPdf) return;
    const phases = [
      "Scanning Part 1 / 3...",
      "Scanning Part 2 / 3...",
      "Scanning Part 3 / 3... Almost there.",
    ];
    let idx = 0;
    setToastText(phases[0]);
    const id = window.setInterval(() => {
      idx = Math.min(idx + 1, phases.length - 1);
      setToastText(phases[idx]);
    }, 12000);
    return () => window.clearInterval(id);
  }, [isProcessingPdf]);

  const openIngestDialog = () => {
    fileInputRef.current?.click();
  };

  const deleteBook = (bookTitle: string) => {
    if (!window.confirm(`Remove "${bookTitle}" from your Empire?`)) return;
    setGraphState((prev) => {
      const updated = {
        nodes: prev.nodes.filter((n) => n.bookTitle !== bookTitle),
        links: prev.links.filter(
          (l) =>
            !prev.nodes.some(
              (n) => n.bookTitle === bookTitle && (n.id === l.source || n.id === l.target),
            ),
        ),
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    setSelectedBook(null);
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessingPdf(true);
    setToastText(`Processing "${file.name}"...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/ingest", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Ingestion failed");
      }

      const { nodes: rawNodes } = (await response.json()) as {
        nodes: Partial<EmpireNode>[];
      };

      const newNodes: EmpireNode[] = rawNodes.map((n) => {
        const chapter = (n.chapter ?? "Unknown") as string;
        const bookTitle = (n.bookTitle ?? "Unknown") as string;
        const num = chapterNum(chapter);
        const defaultLevel: 0 | 1 | 2 = num === 0 ? 0 : num >= 90 ? 2 : 1;
        return {
          sprintCount: 0,
          color: "#EF4444",
          tags: [],
          narrativeSprints: [],
          supportingContext: "",
          goldenThread: "",
          ...n,
          id: n.id ?? `node_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          bookTitle,
          chapter,
          masteryStatus: "Red" as MasteryStatus,
          level: (n.level as 0 | 1 | 2) ?? defaultLevel,
        };
      });

      // Deduplicate within batch first (same chapter from multiple chunks)
      const seenInBatch = new Set<string>();
      const dedupedWithinBatch = newNodes.filter((n) => {
        const key = `${n.bookTitle}::${slugify(n.chapter)}`;
        if (seenInBatch.has(key)) return false;
        seenInBatch.add(key);
        return true;
      });

      let addedCount = 0;
      setGraphState((prev) => {
        const existingSlugs = new Set(
          prev.nodes.map((n) => `${n.bookTitle}::${slugify(n.chapter)}`),
        );
        const dedupedNodes = dedupedWithinBatch.filter(
          (n) => !existingSlugs.has(`${n.bookTitle}::${slugify(n.chapter)}`),
        );
        addedCount = dedupedNodes.length;
        const updated = { nodes: [...prev.nodes, ...dedupedNodes], links: prev.links };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });

      setToastText(`"${file.name}" ingested — ${addedCount} nodes added.`);
      setCurrentView("map");
    } catch (error) {
      setToastText(
        error instanceof Error ? error.message : "Ingestion failed.",
      );
    } finally {
      setIsProcessingPdf(false);
      window.setTimeout(() => setToastText(null), 2500);
    }
  };

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void handleFileUpload(file);
    event.target.value = "";
  };

  const updateMasteryStatus = (status: MasteryStatus, nodeId?: string) => {
    const id = nodeId ?? activeNode?.id ?? libraryReadingNode?.id ?? socraticContextNode?.id;
    if (!id) return;

    setGraphState((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) =>
        node.id === id ? { ...node, masteryStatus: status, color: statusColor[status] } : node,
      ),
    }));

    setActiveNode((prev) =>
      prev && prev.id === id ? { ...prev, masteryStatus: status, color: statusColor[status] } : prev,
    );
    setLibraryReadingNode((prev) =>
      prev && prev.id === id ? { ...prev, masteryStatus: status, color: statusColor[status] } : prev,
    );
    setSocraticContextNode((prev) =>
      prev && prev.id === id ? { ...prev, masteryStatus: status, color: statusColor[status] } : prev,
    );
  };

  const openSocraticSprint = (contextNode?: EmpireNode) => {
    const node = contextNode ?? activeNode ?? libraryReadingNode;
    if (!node) return;
    setSocraticContextNode(node);
    const topicFocus = node.tags.join(", ");
    setChatMessages([
      {
        id: `ai-seed-${Date.now()}`,
        role: "ai",
        content: `Gatekeeper: Explain the concept of ${topicFocus} from ${node.chapter} in your own words.`,
      },
    ]);
    setChatInput("");
    setIsSocraticChatOpen(true);
  };

  const closeSocraticSprint = () => {
    setIsSocraticChatOpen(false);
    setIsMockAiThinking(false);
    setSocraticContextNode(null);
  };

  const sendSocraticMessage = () => {
    const userText = chatInput.trim();
    if (!userText || isMockAiThinking) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userText,
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setIsMockAiThinking(true);

    window.setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "ai",
          content: "Analyzing your mental model...",
        },
      ]);
      setIsMockAiThinking(false);
    }, 1000);
  };

  const forceMasteryAndClose = () => {
    const id = sprintNode?.id;
    if (id) updateMasteryStatus("Green", id);
    setIsSocraticChatOpen(false);
    setSocraticContextNode(null);
    setToastText("Node upgraded to Green mastery.");
    window.setTimeout(() => setToastText(null), 1800);
  };

  const createSynthesis = (query: string, nodes: EmpireNode[]) => {
    const threads = nodes.map((node) => node.goldenThread.trim());
    const opening = `For "${query}", your Empire points to ${nodes.length} strategic context source${
      nodes.length === 1 ? "" : "s"
    } that can be translated into immediate operating leverage.`;
    const middle = threads.join(" ");
    const closing =
      "Taken together, this context suggests prioritizing durable leverage first, protecting financial fundamentals second, and executing with operational discipline so each decision compounds rather than fragments attention.";
    return `${opening}\n\n${middle}\n\n${closing}`;
  };

  const runContextualSummon = () => {
    const trimmedQuery = summonQuery.trim();
    if (!trimmedQuery) return;

    const terms = trimmedQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    const matches = graphState.nodes.filter((node) => {
      const sourceText = `${node.bookTitle} ${node.chapter} ${node.goldenThread} ${node.tags.join(" ")}`.toLowerCase();
      return terms.some((term) => sourceText.includes(term));
    });

    if (matches.length === 0) {
      setToastText("No context found in your Empire.");
      window.setTimeout(() => setToastText(null), 1800);
      return;
    }

    setBrief({
      query: trimmedQuery,
      nodes: matches,
      synthesis: createSynthesis(trimmedQuery, matches),
    });
  };

  const handleSummonKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    runContextualSummon();
  };

  const handleDropzoneDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropzoneActive(true);
  };

  const handleDropzoneDragLeave = () => {
    setIsDropzoneActive(false);
  };

  const handleDropzoneDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropzoneActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      setToastText("Please drop a valid .pdf file.");
      window.setTimeout(() => setToastText(null), 1800);
      return;
    }
    void handleFileUpload(file);
  };

  const bookRoster = useMemo(() => {
    const grouped = new Map<string, EmpireNode[]>();
    graphState.nodes.forEach((node) => {
      const existing = grouped.get(node.bookTitle) ?? [];
      existing.push(node);
      grouped.set(node.bookTitle, existing);
    });

    return Array.from(grouped.entries()).map(([bookTitle, nodes]) => {
      const totalNodes = nodes.length;
      const greenNodes = nodes.filter((node) => node.masteryStatus === "Green").length;
      const masteryPercent =
        totalNodes === 0 ? 0 : Math.round((greenNodes / totalNodes) * 100);
      return { bookTitle, totalNodes, greenNodes, masteryPercent };
    });
  }, [graphState.nodes]);

  const selectedBookNodes = useMemo(() => {
    if (!selectedBook) return [];
    const nodes = graphState.nodes.filter((node) => node.bookTitle === selectedBook);
    return [...nodes].sort(
      (a, b) => chapterNum(a.chapter) - chapterNum(b.chapter) || a.chapter.localeCompare(b.chapter),
    );
  }, [graphState.nodes, selectedBook]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950">
      {currentView === "map" ? (
        <div className="fixed inset-0 z-0 h-screen w-screen">
          <KnowledgeEmpireGraph
            nodes={graphState.nodes}
            links={graphState.links}
            onNodeClick={setActiveNode}
          />
        </div>
      ) : null}

      <div className="pointer-events-auto fixed left-5 top-5 z-[120] flex items-center gap-1 rounded-2xl border border-white/15 bg-zinc-900/65 p-1.5 shadow-xl backdrop-blur-2xl">
        <button
          type="button"
          onClick={() => setCurrentView("map")}
          className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
            currentView === "map"
              ? "border border-white/20 bg-white/15 text-white"
              : "text-zinc-300 hover:bg-white/10"
          }`}
        >
          Empire Map
        </button>
        <button
          type="button"
          onClick={() => setCurrentView("library")}
          className={`rounded-xl px-3 py-1.5 text-xs font-medium transition ${
            currentView === "library"
              ? "border border-white/20 bg-white/15 text-white"
              : "text-zinc-300 hover:bg-white/10"
          }`}
        >
          The Vault
        </button>
      </div>

      <div className="fixed inset-0 z-10 pointer-events-none">
        {currentView === "map" ? (
          <div className="pointer-events-auto absolute left-1/2 top-5 flex w-[min(92vw,780px)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/15 bg-zinc-900/60 p-2 shadow-2xl shadow-black/40 backdrop-blur-2xl">
            <input
              type="text"
              value={summonQuery}
              onChange={(event) => setSummonQuery(event.target.value)}
              onKeyDown={handleSummonKeyDown}
              placeholder="Summon Context (e.g., Avocado Meeting, Finance...)"
              className="w-full rounded-xl border border-white/10 bg-zinc-950/50 px-4 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-violet-300/30"
            />
            <button
              type="button"
              onClick={openIngestDialog}
              className="whitespace-nowrap rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/10"
            >
              Ingest Knowledge (PDF)
            </button>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileSelection}
        />

        {currentView === "library" ? (
          <section className="pointer-events-auto absolute inset-0 overflow-y-auto bg-zinc-950 px-6 pb-16 pt-24">
            {!libraryReadingNode ? (
              <div className="mx-auto max-w-6xl">
                <div
                  onDragOver={handleDropzoneDragOver}
                  onDragLeave={handleDropzoneDragLeave}
                  onDrop={handleDropzoneDrop}
                  onClick={openIngestDialog}
                  className={`group relative rounded-3xl border border-dashed p-10 text-center transition ${
                    isDropzoneActive
                      ? "border-violet-300/60 bg-violet-500/15"
                      : "border-white/20 bg-zinc-900/45 hover:bg-zinc-900/60"
                  }`}
                >
                  <p className="text-lg font-medium text-zinc-100">
                    Drop a book (.pdf) to expand your Empire
                  </p>
                  <p className="mt-2 text-sm text-zinc-400">
                    Privacy-first local ingestion. Click or drag to start.
                  </p>
                  {isProcessingPdf ? (
                    <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-violet-300/30 bg-violet-500/15 px-4 py-2 text-sm text-violet-100">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-violet-300" />
                      Processing...
                    </div>
                  ) : null}
                </div>

                {!selectedBook ? (
                  <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {bookRoster.map((book) => (
                      <div
                        key={book.bookTitle}
                        className="group relative rounded-2xl border border-white/15 bg-zinc-900/50 p-5 shadow-lg backdrop-blur-xl transition hover:bg-zinc-900/70"
                      >
                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => deleteBook(book.bookTitle)}
                          className="absolute right-3 top-3 rounded-lg p-1.5 text-zinc-600 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"
                          aria-label={`Delete ${book.bookTitle}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>

                        {/* Card body — click to open */}
                        <button
                          type="button"
                          onClick={() => setSelectedBook(book.bookTitle)}
                          className="w-full text-left"
                        >
                          <p className="pr-6 text-lg font-semibold tracking-tight text-zinc-100">
                            {book.bookTitle}
                          </p>
                          <p className="mt-1 text-sm text-zinc-400">
                            {book.totalNodes} chapter nodes
                          </p>
                          <p className="mt-4 text-xs uppercase tracking-[0.2em] text-zinc-500">
                            Mastery
                          </p>
                          <div className="mt-2 h-2 w-full rounded-full bg-zinc-800">
                            <div
                              className="h-2 rounded-full bg-emerald-400 transition-all"
                              style={{ width: `${book.masteryPercent}%` }}
                            />
                          </div>
                          <p className="mt-2 text-sm text-zinc-300">
                            {book.masteryPercent}% Green ({book.greenNodes}/{book.totalNodes})
                          </p>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-10">
                    <header className="border-b border-white/10 pb-8">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                            The Vault
                          </p>
                          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
                            {selectedBook}
                          </h1>
                          <p className="mt-2 text-sm text-zinc-500">
                            {selectedBookNodes.length}{" "}
                            {selectedBookNodes.length === 1 ? "chapter" : "chapters"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedBook(null)}
                          className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
                        >
                          ← Back to Vault
                        </button>
                      </div>
                    </header>

                    <ul className="mt-8 divide-y divide-white/10 overflow-y-auto">
                      {selectedBookNodes.map((node) => (
                        <li key={node.id}>
                          <button
                            type="button"
                            onClick={() => setLibraryReadingNode(node)}
                            className={`flex w-full items-start gap-4 py-5 text-left transition hover:bg-white/[0.03] ${
                              node.masteryStatus === "Green"
                                ? "border-l-2 border-l-emerald-500/70 pl-4"
                                : node.masteryStatus === "Yellow"
                                  ? "border-l-2 border-l-amber-400/70 pl-4"
                                  : "border-l-2 border-l-rose-500/70 pl-4"
                            }`}
                          >
                            <span
                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                node.masteryStatus === "Green"
                                  ? "bg-emerald-400"
                                  : node.masteryStatus === "Yellow"
                                    ? "bg-amber-300"
                                    : "bg-rose-400"
                              }`}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-base font-medium text-zinc-100">{node.chapter}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {node.tags.map((tag) => (
                                  <span
                                    key={`${node.id}-${tag}`}
                                    className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-zinc-500"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative mx-auto min-h-full w-full max-w-[760px] px-5 pb-28 pt-8 lg:px-8">
                {/* Top nav */}
                <div className="mb-10 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setLibraryReadingNode(null)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
                  >
                    ← Chapters
                  </button>
                  <p className="truncate text-sm text-zinc-500">{libraryReadingNode.bookTitle}</p>
                </div>

                {/* Concept Anchor — a subtle primer, not the main event */}
                <div className="flex items-start justify-between gap-4 px-1">
                  <p className="font-serif text-sm italic leading-relaxed text-zinc-500 sm:text-[0.9rem]">
                    {libraryReadingNode.supportingContext}
                  </p>
                  <div className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${readingMasteryTone.badge}`}>
                    <span className={`h-1 w-1 rounded-full ${readingMasteryTone.dot}`} />
                    {readingMasteryTone.label}
                  </div>
                </div>

                {/* Sprint Canvas — one sprint at a time */}
                <div className="mt-14">
                  <p className="text-[10px] font-sans uppercase tracking-[0.26em] text-zinc-600">
                    Sprint {currentSprintIndex + 1} of {libraryReadingNode.narrativeSprints.length}
                  </p>

                  <AnimatePresence mode="wait">
                    <motion.p
                      key={`${libraryReadingNode.id}-sprint-${currentSprintIndex}`}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -14 }}
                      transition={{ duration: 0.38, ease: [0.4, 0, 0.2, 1] }}
                      className="mt-5 font-serif text-xl leading-relaxed text-zinc-100 sm:text-2xl sm:leading-relaxed"
                    >
                      {libraryReadingNode.narrativeSprints[currentSprintIndex]}
                    </motion.p>
                  </AnimatePresence>

                  {/* Continue / Next */}
                  {currentSprintIndex < libraryReadingNode.narrativeSprints.length - 1 && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      onClick={() => setCurrentSprintIndex((i) => i + 1)}
                      className="group mt-10 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/10 hover:text-zinc-100"
                    >
                      Continue reading
                      <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                    </motion.button>
                  )}

                  {/* Friction Gate — appears only at the final sprint */}
                  <AnimatePresence>
                    {currentSprintIndex === libraryReadingNode.narrativeSprints.length - 1 && (
                      <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.45, duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                        className="mt-14 space-y-8"
                      >
                        {/* The Reveal — Golden Thread surfaces here, not before */}
                        <div className="rounded-xl border border-violet-400/20 bg-violet-500/[0.06] px-5 py-4">
                          <p className="text-[10px] font-sans uppercase tracking-[0.28em] text-violet-400/70">The Reveal</p>
                          <p className="mt-2 font-serif text-lg leading-[1.7] text-zinc-100 sm:text-xl">
                            {libraryReadingNode.goldenThread}
                          </p>
                        </div>

                        {/* Socratic gate */}
                        <div className="border-t border-white/8 pt-8">
                          <p className="text-[10px] font-sans uppercase tracking-[0.28em] text-zinc-600">Friction Gate</p>
                          <p className="mt-2 text-sm text-zinc-500">
                            You've read the full chapter. Now prove it stuck.
                          </p>
                          <button
                            type="button"
                            onClick={() => openSocraticSprint(libraryReadingNode)}
                            className="mt-4 w-full max-w-sm rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-200/95 to-orange-200/95 px-5 py-3.5 text-sm font-semibold text-zinc-900 shadow-lg shadow-amber-500/25 transition hover:brightness-110 hover:shadow-amber-400/40"
                            style={{ animation: "glow-pulse 2.5s ease-in-out infinite" }}
                          >
                            Begin Socratic Honing Sprint
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Progress bar — fixed to bottom */}
                <div className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-2 pb-6 pt-4">
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/80 px-4 py-2 backdrop-blur-xl">
                    {libraryReadingNode.narrativeSprints.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setCurrentSprintIndex(i)}
                        aria-label={`Go to sprint ${i + 1}`}
                        className="relative h-1.5 overflow-hidden rounded-full transition-all duration-300 focus:outline-none"
                        style={{ width: i === currentSprintIndex ? 28 : 6 }}
                      >
                        <span
                          className={`absolute inset-0 rounded-full transition-colors duration-300 ${
                            i < currentSprintIndex
                              ? "bg-emerald-400/70"
                              : i === currentSprintIndex
                                ? "bg-violet-400"
                                : "bg-white/20"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {currentView === "map" ? (
          <>
            <div
              aria-hidden={!isOpen}
              className={`absolute inset-0 z-30 bg-black/40 transition-opacity duration-300 ${
                isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
              }`}
              onClick={() => setActiveNode(null)}
            />

            <aside
              className={`pointer-events-auto absolute right-0 top-0 z-40 flex h-full w-full max-w-2xl transform flex-col border-l border-white/15 bg-gradient-to-b from-white/10 via-zinc-900/55 to-zinc-950/75 p-6 text-zinc-100 shadow-2xl backdrop-blur-2xl transition-transform duration-300 lg:max-w-none lg:w-1/2 ${
                isOpen ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-zinc-400">
                    Node Details
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    {activeNode?.chapter ?? "Select a Concept Node"}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-300">
                    {activeNode?.bookTitle ?? "Click any node in the graph"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNode(null)}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
                >
                  Close
                </button>
              </div>

              {activeNode ? (
                <div className="mt-5 flex-1 overflow-y-auto pr-1">
                  <div className="rounded-2xl border border-white/20 bg-zinc-900/55 p-5 shadow-xl">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                      Concept Anchor
                    </p>
                    <p className="mt-3 text-sm text-zinc-300">{activeNode.bookTitle}</p>
                    <p className="text-base font-semibold text-zinc-100">{activeNode.chapter}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {activeNode.tags.map((topic) => (
                        <span
                          key={topic}
                          className="rounded-full border border-violet-300/25 bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-100"
                        >
                          {topic}
                        </span>
                      ))}
                    </div>

                    <div className="mt-4 space-y-4 rounded-xl border border-white/10 bg-black/20 p-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                          Supporting Context
                        </p>
                        <p className="mt-2 font-serif text-base leading-7 text-zinc-200">
                          {activeNode.supportingContext ??
                            "Context scaffold unavailable in this node."}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">
                          Golden Thread
                        </p>
                        <p className="mt-2 font-serif text-lg leading-8 text-zinc-100">
                          {activeNode.goldenThread}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${masteryTone.badge}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${masteryTone.dot}`} />
                    {masteryTone.label}
                  </div>

                  <div className="mt-5 space-y-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                      Narrative Sprints
                    </p>
                    {(activeNode.narrativeSprints ?? []).map((sprint, index) => (
                      <article key={`${activeNode.id}-sprint-${index}`} className="space-y-2">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                          Sprint {index + 1}
                        </p>
                        <p className="font-serif text-[17px] leading-8 text-zinc-200">
                          {sprint}
                        </p>
                      </article>
                    ))}
                  </div>

                  <div className="mt-8 rounded-2xl border border-white/15 bg-zinc-900/45 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                      Friction Gate
                    </p>
                    {activeNode.masteryStatus === "Green" ? (
                      <p className="mt-3 text-sm text-zinc-300">
                        Mastery is currently green. You can still open a Socratic sprint
                        for deliberate reinforcement.
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-amber-100">
                        You reached the friction gate. Launch a Socratic sprint to test
                        and refine recall before progressing.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => openSocraticSprint()}
                      className="mt-4 w-full rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-300/90 to-orange-300/90 px-4 py-3 text-sm font-semibold text-zinc-900 shadow-lg shadow-amber-500/20 transition hover:brightness-105"
                    >
                      Begin Socratic Honing Sprint
                    </button>
                    <div className="mt-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                        Update Mastery Status
                      </p>
                      <div className="mt-2 flex gap-2">
                        {(["Red", "Yellow", "Green"] as MasteryStatus[]).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => updateMasteryStatus(status)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                              activeNode.masteryStatus === status
                                ? "border-white/35 bg-white/15 text-white"
                                : "border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10"
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-8 rounded-2xl border border-white/15 bg-zinc-900/35 p-5 text-sm text-zinc-300">
                  Select a node from the 3D map to inspect chapter context, semantic
                  tags, and mastery-state actions.
                </div>
              )}
            </aside>

            {brief ? (
              <>
                <div
                  className="pointer-events-auto absolute inset-0 z-[60] bg-black/55 backdrop-blur-sm"
                  onClick={() => setBrief(null)}
                />
                <section className="pointer-events-auto absolute left-1/2 top-1/2 z-[70] w-[min(92vw,860px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/15 bg-gradient-to-b from-white/10 via-zinc-900/80 to-zinc-950/90 p-6 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur-2xl">
                  <h2 className="text-2xl font-semibold tracking-tight">Executive Brief</h2>
                  <p className="mt-1 text-sm text-zinc-400">Query: {brief.query}</p>
                  <div className="mt-5 rounded-2xl border border-white/15 bg-zinc-900/45 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                      Context Sources
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-zinc-200">
                      {brief.nodes.map((node) => (
                        <li key={node.id}>
                          Pulled from {node.bookTitle}, {node.chapter}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/15 bg-zinc-900/45 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                      Synthesis
                    </p>
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-zinc-200">
                      {brief.synthesis}
                    </p>
                  </div>
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setBrief(null)}
                      className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/10"
                    >
                      Close Brief
                    </button>
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}

        {isSocraticChatOpen && sprintNode ? (
          <>
            <div
              className="pointer-events-auto absolute inset-0 z-[130] bg-black/60 backdrop-blur-sm"
              onClick={closeSocraticSprint}
            />
            <section className="pointer-events-auto absolute left-1/2 top-1/2 z-[140] flex h-[min(82vh,760px)] w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border border-white/15 bg-gradient-to-b from-white/10 via-zinc-900/80 to-zinc-950/90 p-5 text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur-2xl">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                        Socratic Honing
                      </p>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight">
                        Socratic Honing: {sprintNode.bookTitle}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={forceMasteryAndClose}
                        className="rounded-lg border border-emerald-300/35 bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30"
                      >
                        [DEV: Force Mastery]
                      </button>
                      <button
                        type="button"
                        onClick={closeSocraticSprint}
                        className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-white/10"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950/45 p-4">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                          message.role === "user"
                            ? "ml-auto border border-violet-300/30 bg-violet-500/20 text-violet-100"
                            : "border border-white/15 bg-zinc-800/80 text-zinc-100"
                        }`}
                      >
                        <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                          {message.role === "user" ? "User" : "Gatekeeper"}
                        </p>
                        {message.content}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-950/60 p-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(event) => setChatInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        sendSocraticMessage();
                      }}
                      placeholder="Refine your explanation..."
                      className="w-full rounded-xl border border-white/10 bg-zinc-900/70 px-4 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-violet-300/30"
                    />
                    <button
                      type="button"
                      onClick={sendSocraticMessage}
                      disabled={isMockAiThinking}
                      className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isMockAiThinking ? "..." : "Send"}
                    </button>
                  </div>
            </section>
          </>
        ) : null}

        {toastText ? (
          <div className="pointer-events-auto absolute bottom-6 left-1/2 z-[150] -translate-x-1/2 rounded-xl border border-white/15 bg-zinc-900/75 px-4 py-2 text-sm text-zinc-100 shadow-2xl backdrop-blur-xl">
            {!isProcessingPdf && <span className="mr-2">Ready</span>}
            <span className="text-zinc-300">{toastText}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
