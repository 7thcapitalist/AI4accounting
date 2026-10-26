"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AgentId,
  approve,
  createSim,
  returnToAgent,
  type SimState,
  selectAccountantQueue,
  selectDay,
  selectIsFinished,
  selectNeedsAccountant,
  step,
} from "../sim";
import { AgentsView } from "./AgentsView";
import { Board } from "./Board";
import { ClientDrawer } from "./ClientDrawer";
import { Icon } from "./icons";
import { Queue } from "./Queue";

type View = "painel" | "fila" | "agentes";
const SEED = 2026;
const SPEEDS = [1, 2, 4] as const;
const BASE_MS = 900;

export function App() {
  const [sim, setSim] = useState<SimState>(() => createSim(SEED));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [view, setView] = useState<View>("painel");
  const [openClient, setOpenClient] = useState<string | null>(null);

  const finished = selectIsFinished(sim);
  const needsAccountant = selectNeedsAccountant(sim);
  const queue = useMemo(() => selectAccountantQueue(sim), [sim]);

  // The month runs on its own; it only stops when everything is delivered or waiting for the accountant.
  useEffect(() => {
    if (!running || finished || needsAccountant) return;
    const id = setInterval(() => setSim((s) => step(s)), BASE_MS / speed);
    return () => clearInterval(id);
  }, [running, speed, finished, needsAccountant]);

  const onApprove = useCallback((clientId: string) => setSim((s) => approve(s, clientId)), []);
  const onReturn = useCallback(
    (clientId: string, agent?: AgentId) => setSim((s) => returnToAgent(s, clientId, agent)),
    [],
  );
  const reset = () => {
    setSim(createSim(SEED));
    setRunning(false);
    setOpenClient(null);
  };

  const started = sim.tick > 0;
  const nav: { id: View; label: string; icon: string; badge?: number }[] = [
    { id: "painel", label: "Painel do mês", icon: "grid" },
    { id: "fila", label: "Fila do contador", icon: "queue", badge: queue.length },
    { id: "agentes", label: "Agentes", icon: "bot" },
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
              onClick={() => {
                setView(n.id);
                window.scrollTo({ top: 0 });
              }}
            >
              <Icon name={n.icon} />
              {n.label}
              {n.badge ? <span className="badge num">{n.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div className="side-foot">Protótipo com dados simulados. Nenhum cliente real.</div>
      </aside>

      <main className="main">
        <header className="head">
          <div>
            <h1>Fechamento de setembro/2026</h1>
            <p className="num">
              {started
                ? `Hoje é ${selectDay(sim)} de outubro · ${sim.clients.length} clientes · 7 agentes`
                : `${sim.clients.length} clientes · 7 agentes prontos para começar`}
            </p>
          </div>
          <div className="controls">
            <fieldset className="seg" aria-label="Velocidade">
              {SPEEDS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={speed === v}
                  onClick={() => setSpeed(v)}
                >
                  {v}x
                </button>
              ))}
            </fieldset>
            <button type="button" className="btn" onClick={reset} title="Reiniciar o mês">
              <Icon name="reset" size={14} />
              Reiniciar
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => setRunning((r) => !r)}
              disabled={finished}
            >
              <Icon name={running && !needsAccountant ? "pause" : "play"} size={14} />
              {finished
                ? "Mês fechado"
                : running && !needsAccountant
                  ? "Pausar"
                  : started
                    ? "Continuar"
                    : "Rodar o mês"}
            </button>
          </div>
        </header>

        {needsAccountant && (
          <div className="banner">
            <span>
              Os agentes terminaram o que podiam. <b>{queue.length}</b>{" "}
              {queue.length === 1 ? "cliente espera" : "clientes esperam"} a sua aprovação.
            </span>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                setView("fila");
                window.scrollTo({ top: 0 });
              }}
            >
              Abrir a fila
            </button>
          </div>
        )}
        {finished && (
          <div className="banner done">
            <span>Todos os clientes entregues. O mês está fechado.</span>
          </div>
        )}

        {view === "painel" && <Board sim={sim} onOpen={setOpenClient} running={running} />}
        {view === "fila" && (
          <Queue
            sim={sim}
            queue={queue}
            onApprove={onApprove}
            onReturn={onReturn}
            onOpen={setOpenClient}
          />
        )}
        {view === "agentes" && <AgentsView sim={sim} />}
      </main>

      {openClient && (
        <ClientDrawer
          sim={sim}
          clientId={openClient}
          onClose={() => setOpenClient(null)}
          onApprove={onApprove}
          onReturn={onReturn}
        />
      )}
    </div>
  );
}
