import type { CSSProperties } from "react";
import { AGENT_BY_PHASE, type SimState, selectAgentStats } from "../sim";
import { AGENT_LABEL } from "./format";
import { Icon } from "./icons";

export function AgentsView({ sim }: { sim: SimState }) {
  const stats = selectAgentStats(sim);
  return (
    <section className="agent-grid" aria-label="Agentes">
      {stats.map((s) => {
        const working = sim.progress
          .filter((p) => p.status === "working" && AGENT_BY_PHASE[p.phase] === s.agent.id)
          .map((p) => sim.clients.find((c) => c.id === p.clientId)?.name)
          .filter(Boolean);
        const last = [...sim.feed].reverse().find((e) => e.agent === s.agent.id);
        return (
          <article key={s.agent.id} className="card agent-card">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span
                className={`avatar lg${working.length ? " live" : ""}`}
                style={{ background: s.agent.color, "--c": s.agent.color } as CSSProperties}
              >
                <Icon name={s.agent.icon} />
              </span>
              <div>
                <h3>{AGENT_LABEL[s.agent.id]}</h3>
                <p>{s.agent.role}</p>
              </div>
            </div>
            <div className="now">
              {working.length
                ? `Trabalhando em ${working.join(", ")}`
                : last
                  ? `Última ação: ${last.text.slice(last.text.indexOf(": ") + 2)}`
                  : "Esperando o mês começar"}
            </div>
            <div className="stats num">
              <div>
                <b>{s.actions}</b>
                <span>ações</span>
              </div>
              <div>
                <b style={{ color: s.findings ? "var(--bad)" : undefined }}>{s.findings}</b>
                <span>exceções achadas</span>
              </div>
              <div>
                <b>{s.returned}</b>
                <span>devolvidas</span>
              </div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
