import type { CSSProperties } from "react";
import { AGENT_BY_PHASE, type AgentId, type SimState, selectAgentStats } from "../sim";
import { AGENT_INFO } from "./content";
import { AGENT_LABEL } from "./format";
import { Icon } from "./icons";

export function AgentsView({ sim, onAgent }: { sim: SimState; onAgent: (id: AgentId) => void }) {
  const stats = selectAgentStats(sim);
  return (
    <>
      <p className="page-lede">
        Sete agentes, cada um responsável por uma etapa do mês. Clique num agente para ver o que ele
        faz, o que recebe, o que entrega e quando chama você.
      </p>
      <section className="agent-grid" aria-label="Agentes">
        {stats.map((s) => {
          const working = sim.progress
            .filter((p) => p.status === "working" && AGENT_BY_PHASE[p.phase] === s.agent.id)
            .map((p) => sim.clients.find((c) => c.id === p.clientId)?.name)
            .filter(Boolean);
          return (
            <button
              key={s.agent.id}
              type="button"
              className="card agent-card"
              onClick={() => onAgent(s.agent.id)}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span
                  className={`avatar lg${working.length ? " live" : ""}`}
                  style={{ background: s.agent.color, "--c": s.agent.color } as CSSProperties}
                >
                  <Icon name={s.agent.icon} />
                </span>
                <div>
                  <h3>{AGENT_LABEL[s.agent.id]}</h3>
                  <p>{AGENT_INFO[s.agent.id].summary}</p>
                </div>
              </div>
              <div className="now">
                {working.length ? `Agora: ${working.join(", ")}` : "Sem cliente nesta etapa agora"}
              </div>
              <div className="stats num">
                <div>
                  <b>{s.actions}</b>
                  <span>ações</span>
                </div>
                <div>
                  <b style={{ color: s.findings ? "var(--bad)" : undefined }}>{s.findings}</b>
                  <span>exceções</span>
                </div>
                <div>
                  <b>{s.returned}</b>
                  <span>devolvidas</span>
                </div>
              </div>
            </button>
          );
        })}
      </section>
    </>
  );
}
