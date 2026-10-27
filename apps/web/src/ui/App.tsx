"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AgentId,
  approve,
  createSim,
  type Phase,
  returnToAgent,
  type SimState,
  selectAccountantQueue,
  selectDay,
  selectIsFinished,
  selectNeedsAccountant,
  step,
} from "../sim";
import { AgentDrawer } from "./AgentDrawer";
import { AgentsView } from "./AgentsView";
import { Board } from "./Board";
import { ClientDrawer } from "./ClientDrawer";
import { HowItWorks } from "./HowItWorks";
import { Icon } from "./icons";
import { PhaseDrawer } from "./PhaseDrawer";
import { Queue } from "./Queue";

type View = "painel" | "fila" | "agentes" | "como";
type Panel =
  | { kind: "client"; id: string }
  | { kind: "phase"; clientId: string; phase: Phase }
  | { kind: "agent"; id: AgentId };

const SEED = 2026;
/** The month is already under way when the page opens (about day 3 of the close). */
const WARM_TICKS = 15;
const POLL_MS = 2000;
const TICK_MS = { normal: 3500, rapido: 700 } as const;

/**
 * Opens the month already under way: the agents have worked for a few days and the clients the
 * accountant approved earlier (the ones with no exceptions) are already delivered.
 */
function warmStart(seed: number): SimState {
  let s = createSim(seed);
  for (let i = 0; i < WARM_TICKS; i++) {
    s = step(s);
    if (i < WARM_TICKS - 4) {
      for (const q of selectAccountantQueue(s))
        if (q.kind === "approval" && q.findings.length === 0) s = approve(s, q.client.id);
    }
  }
  return s;
}

export function App() {
  const [sim, setSim] = useState<SimState>(() => warmStart(SEED));
  // "store": the board follows the month store written by `pnpm month:run`; "sim": local demo.
  const [source, setSource] = useState<"sim" | "store">("sim");
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<keyof typeof TICK_MS>("normal");
  const [view, setView] = useState<View>("painel");
  const [panel, setPanel] = useState<Panel | null>(null);

  // Prefer the real store whenever it has a month: poll it so the board moves while month:run works.
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/board", { cache: "no-store" });
        const body = (await res.json()) as { state?: SimState | null };
        if (stop || !res.ok) return;
        if (body.state) {
          setSource("store");
          setSim(body.state);
        } else setSource((s) => (s === "store" ? "sim" : s));
      } catch {
        // offline or restarting: keep what is on screen
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const fromStore = source === "store";
  const finished = selectIsFinished(sim);
  const needsAccountant = selectNeedsAccountant(sim);
  const queue = useMemo(() => selectAccountantQueue(sim), [sim]);
  const live = fromStore ? !finished : !paused && !finished && !needsAccountant;

  // The agents work on their own: one step every few seconds until everything waits for the accountant.
  useEffect(() => {
    if (!live || fromStore) return;
    const id = setInterval(() => setSim((s) => step(s)), TICK_MS[speed]);
    return () => clearInterval(id);
  }, [live, fromStore, speed]);

  // In store mode the decision goes to the store (the Coordinator is waiting for it); the next
  // poll shows the result. In sim mode it changes the local simulation.
  const decide = useCallback((clientId: string, decision: "approved" | "sent_back") => {
    void fetch("/api/decision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, decision }),
    }).catch(() => undefined);
  }, []);
  const onApprove = useCallback(
    (clientId: string) =>
      fromStore ? decide(clientId, "approved") : setSim((s) => approve(s, clientId)),
    [fromStore, decide],
  );
  const onReturn = useCallback(
    (clientId: string, agent?: AgentId) =>
      fromStore ? decide(clientId, "sent_back") : setSim((s) => returnToAgent(s, clientId, agent)),
    [fromStore, decide],
  );
  const close = useCallback(() => setPanel(null), []);
  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const nav: { id: View; label: string; icon: string; badge?: number }[] = [
    { id: "painel", label: "Painel do mês", icon: "grid" },
    { id: "fila", label: "Fila do contador", icon: "queue", badge: queue.length },
    { id: "agentes", label: "Agentes", icon: "bot" },
    { id: "como", label: "Como funciona", icon: "info" },
  ];

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark">AI4</span>
          <span>
            AI4accounting
            <small>Escritório Demo</small>
          </span>
        </div>
        <nav className="nav" aria-label="Seções">
          {nav.map((n) => (
            <button
              key={n.id}
              type="button"
              aria-current={view === n.id ? "page" : undefined}
              onClick={() => go(n.id)}
            >
              <Icon name={n.icon} />
              {n.label}
              {n.badge ? <span className="badge num">{n.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sim-box">
          <span>
            {fromStore
              ? "Ao vivo · lendo o mês do banco (dados fictícios)"
              : "Simulação · dados fictícios"}
          </span>
          {!fromStore && (
            <div className="sim-ctrl">
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Retomar" : "Pausar"}
              >
                <Icon name={paused ? "play" : "pause"} size={12} />
              </button>
              <button
                type="button"
                aria-pressed={speed === "rapido"}
                onClick={() => setSpeed((v) => (v === "rapido" ? "normal" : "rapido"))}
              >
                {speed === "rapido" ? "rápido" : "normal"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSim(warmStart(SEED));
                  setPanel(null);
                }}
                aria-label="Recomeçar a simulação"
              >
                <Icon name="reset" size={12} />
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <header className="head">
          <div>
            <h1>Fechamento de setembro/2026</h1>
            <p className="num status-line">
              <span className={`live-dot${live ? " on" : ""}`} />
              {finished
                ? "Mês fechado: todos os clientes entregues."
                : live
                  ? fromStore
                    ? `Ao vivo: os agentes estão fechando o mês · ${sim.clients.length} clientes`
                    : `Os agentes estão trabalhando · dia ${selectDay(sim)} de outubro · ${sim.clients.length} clientes`
                  : needsAccountant
                    ? `Os agentes terminaram o que podiam · ${queue.length} ${queue.length === 1 ? "cliente espera" : "clientes esperam"} você`
                    : "Simulação pausada"}
            </p>
          </div>
        </header>

        {view === "painel" && (
          <Board
            sim={sim}
            queue={queue}
            live={live}
            onClient={(id) => setPanel({ kind: "client", id })}
            onPhase={(clientId, phase) => setPanel({ kind: "phase", clientId, phase })}
            onAgent={(id) => setPanel({ kind: "agent", id })}
            onQueue={() => go("fila")}
          />
        )}
        {view === "fila" && (
          <Queue
            sim={sim}
            queue={queue}
            onApprove={onApprove}
            onReturn={onReturn}
            onOpen={(id) => setPanel({ kind: "client", id })}
          />
        )}
        {view === "agentes" && (
          <AgentsView sim={sim} onAgent={(id) => setPanel({ kind: "agent", id })} />
        )}
        {view === "como" && <HowItWorks onAgent={(id) => setPanel({ kind: "agent", id })} />}
      </main>

      {panel?.kind === "client" && (
        <ClientDrawer
          sim={sim}
          clientId={panel.id}
          onClose={close}
          onApprove={onApprove}
          onReturn={onReturn}
          onPhase={(phase) => setPanel({ kind: "phase", clientId: panel.id, phase })}
          onAgent={(id) => setPanel({ kind: "agent", id })}
        />
      )}
      {panel?.kind === "phase" && (
        <PhaseDrawer
          sim={sim}
          clientId={panel.clientId}
          phase={panel.phase}
          onClose={close}
          onPhase={(phase) => setPanel({ kind: "phase", clientId: panel.clientId, phase })}
          onClient={() => setPanel({ kind: "client", id: panel.clientId })}
          onAgent={(id) => setPanel({ kind: "agent", id })}
        />
      )}
      {panel?.kind === "agent" && (
        <AgentDrawer
          sim={sim}
          agentId={panel.id}
          onClose={close}
          onClient={(id) => setPanel({ kind: "client", id })}
        />
      )}
    </div>
  );
}
