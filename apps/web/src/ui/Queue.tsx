import { useEffect, useState } from "react";
import { type AgentId, type QueueItem, RETURNABLE_AGENTS, type SimState } from "../sim";
import { AGENT_LABEL } from "./format";
import { Icon } from "./icons";

export function Queue({
  sim,
  queue,
  onApprove,
  onReturn,
  onOpen,
}: {
  sim: SimState;
  queue: QueueItem[];
  onApprove: (id: string) => void;
  onReturn: (id: string, agent?: AgentId) => void;
  onOpen: (id: string) => void;
}) {
  const [sel, setSel] = useState(0);
  const clean = queue.filter((q) => q.findings.length === 0);

  // Keyboard-first: j/k move, a approves, d sends back, Enter opens the client.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input,textarea,[role=dialog]"))
        return;
      const item = queue[sel];
      if (e.key === "j") setSel((i) => Math.min(i + 1, queue.length - 1));
      else if (e.key === "k") setSel((i) => Math.max(i - 1, 0));
      else if (e.key === "a" && item) onApprove(item.client.id);
      else if (e.key === "d" && item?.findings[0]) onReturn(item.client.id, item.findings[0].agent);
      else if (e.key === "Enter" && item) onOpen(item.client.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue, sel, onApprove, onReturn, onOpen]);

  useEffect(() => {
    if (sel >= queue.length) setSel(Math.max(queue.length - 1, 0));
  }, [queue.length, sel]);

  if (queue.length === 0) {
    return (
      <section className="card">
        <div className="empty">
          {sim.tick === 0
            ? "Rode o mês: os clientes chegam aqui quando os agentes terminam o trabalho deles."
            : "Nada esperando você agora. Os agentes estão trabalhando."}
        </div>
      </section>
    );
  }

  return (
    <section className="queue">
      <div className="q-top">
        <span className="meta">
          <span className="kbd">j</span>/<span className="kbd">k</span> navegar ·{" "}
          <span className="kbd">a</span> aprovar · <span className="kbd">d</span> devolver ·{" "}
          <span className="kbd">Enter</span> abrir
        </span>
        {clean.length > 0 && (
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              for (const q of clean) onApprove(q.client.id);
            }}
          >
            Aprovar os {clean.length} sem exceção
          </button>
        )}
      </div>
      {queue.map((q, i) => {
        const back = q.findings[0]?.agent;
        return (
          <article key={q.client.id} className={`card q-item${i === sel ? " sel" : ""}`}>
            <div className="q-top">
              <div>
                <h3>{q.client.name}</h3>
                <div className="meta">
                  <span className="pill">{q.client.regimeLabel}</span>
                  <span>{q.client.obligation} pronto para entregar</span>
                </div>
              </div>
              <div className="controls">
                <button type="button" className="btn sm" onClick={() => onOpen(q.client.id)}>
                  Ver detalhes
                </button>
                {back && RETURNABLE_AGENTS.includes(back) && (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => onReturn(q.client.id, back)}
                  >
                    Devolver para {AGENT_LABEL[back]}
                  </button>
                )}
                <button type="button" className="btn sm ok" onClick={() => onApprove(q.client.id)}>
                  <Icon name="check" size={13} />
                  Aprovar
                </button>
              </div>
            </div>
            {q.findings.length === 0 ? (
              <div className="ok-line">Sem exceções: os agentes conferiram tudo.</div>
            ) : (
              q.findings.map((f) => (
                <div key={f.id} className="finding" style={{ padding: "10px 12px" }}>
                  <h4>{f.message}</h4>
                  <div className="meta">
                    {AGENT_LABEL[f.agent]} · {f.rule}
                  </div>
                </div>
              ))
            )}
          </article>
        );
      })}
    </section>
  );
}
