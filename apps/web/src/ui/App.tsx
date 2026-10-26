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
        if (q.findings.length === 0) s = approve(s, q.client.id);
    }
  }
  return s;
}

export function App() {
  const [sim, setSim] = useState<SimState>(() => warmStart(SEED));
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<keyof typeof TICK_MS>("normal");
  const [view, setView] = useState<View>("painel");
  const [panel, setPanel] = useState<Panel | null>(null);

  const finished = selectIsFinished(sim);
  const needsAccountant = selectNeedsAccountant(sim);
  const queue = useMemo(() => selectAccountantQueue(sim), [sim]);
  const live = !paused && !finished && !needsAccountant;

  // The agents work on their own: one step every few seconds until everything waits for the accountant.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setSim((s) => step(s)), TICK_MS[speed]);
    return () => clearInterval(id);
  }, [live, speed]);

  const onApprove = useCallback((clientId: string) => setSim((s) => approve(s, clientId)), []);
  const onReturn = useCallback(
    (clientId: string, agent?: AgentId) => setSim((s) => returnToAgent(s, clientId, agent)),
    [],
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
          <span>Simulação · dados fictícios</span>
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
                  ? `Os agentes estão trabalhando · dia ${selectDay(sim)} de outubro · ${sim.clients.length} clientes`
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
