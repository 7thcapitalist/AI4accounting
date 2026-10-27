import type { CSSProperties } from "react";
import { type AgentId, type SimState, selectAgentStats } from "../sim";
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
          const working = s.currentClients;
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
                {working.length
                  ? `Agora: ${working.join(", ")}`
                  : "Sem tarefa agora: esperando o próximo cliente"}
              </div>
              <div className="stats num">
                <div>
                  <b>{s.actions}</b>
                  <span>ações · {s.perDay}/dia</span>
                </div>
                <div>
                  <b style={{ color: s.findings ? "var(--bad)" : undefined }}>{s.findings}</b>
                  <span>erros pegos</span>
                </div>
                <div>
                  <b>{Math.round((s.savedMinutes / 60) * 10) / 10} h</b>
                  <span>economizadas</span>
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
