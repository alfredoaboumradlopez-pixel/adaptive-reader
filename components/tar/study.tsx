"use client";

import { useEffect, useState } from "react";
import type { EmpireNode } from "@/lib/knowledge-empire-data";
import { type Route, type UserData, chapterHeading, chapterTitle, nodeRef, relativeDay, todayYmd } from "@/lib/tar";
import { AreaChips, Aside, Quote, TopBar, primaryButton, textareaClass } from "./ui";

type Act = (action: string, payload?: Record<string, unknown>) => Promise<boolean>;

// ─────────────────────────────────────────────────────────────
// Preguntas — self-assessment + my own questions (no AI calls)
// ─────────────────────────────────────────────────────────────

const RATINGS = [
  { key: "no", label: "No", hint: "mañana", cls: "border-bad-line text-bad-ink" },
  { key: "meh", label: "Más o menos", hint: "en 3 días", cls: "border-warn-line text-warn-ink" },
  { key: "yes", label: "Lo sabía", hint: "en 1 semana", cls: "border-ok-line text-ok-ink" },
] as const;

export function QuestionsView({
  node,
  tab,
  data,
  act,
  go,
  back,
  toast,
}: {
  node: EmpireNode;
  tab: "test" | "mine";
  data: UserData;
  act: Act;
  go: (r: Route, o?: { replace?: boolean }) => void;
  back: () => void;
  toast: (t: string) => void;
}) {
  const review = data.reviews.find((r) => r.node_id === node.id);
  const mine = data.questions.filter((q) => q.node_id === node.id);
  const [answer, setAnswer] = useState(review?.last_answer ?? "");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newQ, setNewQ] = useState("");

  useEffect(() => {
    setAnswer(review?.last_answer ?? "");
    setRevealed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const rate = async (rating: "no" | "meh" | "yes") => {
    setBusy(true);
    const ok = await act("review.rate", { nodeId: node.id, rating, answer });
    setBusy(false);
    if (!ok) return toast("No se pudo guardar");
    toast(rating === "yes" ? "¡Bien! Vuelve en una semana" : rating === "meh" ? "Lo repasamos en 3 días" : "Lo repasamos mañana");
    back();
  };

  const setTab = (t: "test" | "mine") => go({ name: "questions", id: node.id, tab: t }, { replace: true });

  return (
    <div className="mx-auto w-full max-w-[640px] pb-24">
      <TopBar backLabel="Volver" onBack={back} />
      <div className="flex flex-col gap-4 px-6 pt-1">
        <div>
          <p className="m-0 text-xs uppercase tracking-[0.14em] text-muted">
            {chapterHeading(node)}
          </p>
          <h1 className="m-0 mt-1 font-serif text-[28px] font-semibold">Preguntas</h1>
        </div>
        <div role="tablist" aria-label="Tipo de pregunta" className="flex gap-6 border-b border-line">
          {(
            [
              ["test", "Ponte a prueba"],
              ["mine", `Mis preguntas${mine.length ? ` · ${mine.length}` : ""}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`-mb-px h-11 border-b-2 text-sm ${
                tab === id ? "border-ink font-semibold text-ink" : "border-transparent text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "test" ? (
          <>
            <p className="m-0 font-serif text-[19px] leading-normal">
              {node.socraticQuestion ?? `Explica con tus palabras la idea central de “${chapterTitle(node)}”.`}
            </p>
            <label htmlFor="answer" className="-mb-2 text-xs text-muted">
              Tu respuesta, con tus palabras
            </label>
            <textarea
              id="answer"
              rows={4}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className={textareaClass}
              placeholder="Escribe lo que entendiste…"
            />
            {revealed ? (
              <>
                <Aside label="Compárala con la idea clave">{node.goldenThread}</Aside>
                <div className="flex flex-col gap-2">
                  <p className="m-0 text-sm font-semibold">¿Qué tan bien lo sabías?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {RATINGS.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        disabled={busy}
                        onClick={() => rate(r.key)}
                        className={`flex h-[58px] flex-col items-center justify-center gap-0.5 rounded-xl border bg-card text-sm font-semibold disabled:opacity-50 ${r.cls}`}
                      >
                        {r.label}
                        <span className="text-[11px] font-normal text-muted">{r.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <button type="button" onClick={() => setRevealed(true)} className={primaryButton}>
                Ver la idea clave
              </button>
            )}
            {review ? (
              <p className="m-0 text-xs text-muted">
                Última vez: {relativeDay(review.updated_at)} · próximo repaso{" "}
                {new Date(review.due_at).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })}
              </p>
            ) : null}
          </>
        ) : (
          <>
            {mine.length === 0 ? (
              <p className="m-0 text-sm leading-relaxed text-muted">
                Aún no tienes preguntas en este capítulo. Escríbela aquí o selecciona una frase mientras lees y toca “Preguntar”.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {mine.map((q) => (
                  <li key={q.id} className="flex flex-col gap-2 border-b border-line py-4 last:border-b-0">
                    {q.quote ? <Quote>{q.quote}</Quote> : null}
                    <p className="m-0 text-[15px] font-medium leading-snug">{q.question}</p>
                    {q.answer ? (
                      <Aside label="Respuesta de Claude">{q.answer}</Aside>
                    ) : (
                      <p className="m-0 flex items-center gap-2 text-xs text-muted">
                        <span className="h-2 w-2 rounded-full bg-warn" /> Pendiente · te la respondo en nuestra próxima sesión
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => act("question.delete", { id: q.id })}
                      className="self-start text-xs text-muted underline-offset-2 hover:underline"
                    >
                      Borrar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label htmlFor="newq" className="-mb-2 text-xs text-muted">
              Nueva pregunta
            </label>
            <textarea
              id="newq"
              rows={2}
              value={newQ}
              onChange={(e) => setNewQ(e.target.value)}
              className={textareaClass}
              placeholder="¿Qué no te quedó claro?"
            />
            <button
              type="button"
              disabled={!newQ.trim()}
              onClick={async () => {
                const ok = await act("question.add", { ...nodeRef(node), question: newQ });
                if (ok) setNewQ("");
                toast(ok ? "Pregunta guardada" : "No se pudo guardar");
              }}
              className={primaryButton}
            >
              Guardar pregunta
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Llévalo a tu vida — per chapter
// ─────────────────────────────────────────────────────────────

export function ApplyView({
  node,
  data,
  act,
  go,
  back,
  toast,
}: {
  node: EmpireNode;
  data: UserData;
  act: Act;
  go: (r: Route) => void;
  back: () => void;
  toast: (t: string) => void;
}) {
  const [area, setArea] = useState<string | null>(data.areas[0] ?? null);
  const [situation, setSituation] = useState("");
  const [step, setStep] = useState("");
  const [due, setDue] = useState(todayYmd(7));
  const [quote, setQuote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const q = sessionStorage.getItem("tar-apply-quote");
      if (q) {
        setQuote(q);
        sessionStorage.removeItem("tar-apply-quote");
      }
    } catch {}
  }, []);

  const rawIdea = node.keyMechanism?.split("→")[1]?.trim() ?? node.goldenThread;
  const idea = rawIdea.charAt(0).toUpperCase() + rawIdea.slice(1);

  return (
    <div className="mx-auto w-full max-w-[640px] pb-24">
      <TopBar backLabel="Volver" onBack={back} />
      <div className="flex flex-col gap-4 px-6 pt-1">
        <div>
          <p className="m-0 text-xs uppercase tracking-[0.14em] text-muted">{chapterTitle(node)} → Mi vida</p>
          <h1 className="m-0 mt-1 font-serif text-[28px] font-semibold leading-tight">Llévalo a la realidad</h1>
        </div>
        <p className="m-0 font-serif text-[15px] italic leading-relaxed text-ink-2">{idea}</p>
        {quote ? <Quote>“{quote}”</Quote> : null}

        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm font-semibold">¿Dónde aplica?</p>
          <AreaChips areas={data.areas} value={area} onChange={setArea} onAdd={(name) => act("area.add", { name })} />
        </div>

        {node.lifeExample ? <Aside label="Ejemplo curado para ti">{node.lifeExample}</Aside> : null}

        <label htmlFor="situation" className="-mb-2 text-xs text-muted">
          Mi situación real
        </label>
        <textarea
          id="situation"
          rows={2}
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          className={textareaClass}
          placeholder="¿Dónde ves esto en tu vida o tu negocio?"
        />

        <section className="flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="step" className="text-sm font-semibold">
              Próximo paso
            </label>
            <input
              type="date"
              aria-label="Fecha para revisarlo"
              value={due}
              min={todayYmd()}
              onChange={(e) => setDue(e.target.value)}
              className="h-9 rounded-full border-0 bg-chip px-3 text-sm text-ink-2"
            />
          </div>
          <textarea
            id="step"
            rows={2}
            value={step}
            onChange={(e) => setStep(e.target.value)}
            className={textareaClass}
            placeholder="Una acción concreta y pequeña"
          />
          <p className="m-0 text-xs text-muted">Ese día te pregunto: ¿funcionó?</p>
        </section>

        <button
          type="button"
          disabled={busy || !step.trim()}
          onClick={async () => {
            setBusy(true);
            const ok = await act("action.add", {
              ...nodeRef(node),
              area,
              situation: [quote ? `“${quote}”` : "", situation].filter(Boolean).join("\n"),
              step,
              dueDate: due,
            });
            setBusy(false);
            toast(ok ? "Guardado en Mi vida" : "No se pudo guardar");
            if (ok) go({ name: "life" });
          }}
          className={primaryButton}
        >
          {busy ? "Guardando…" : "Guardar en Mi vida"}
        </button>
      </div>
    </div>
  );
}
