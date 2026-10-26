import type { CSSProperties } from "react";
import {
  AGENT_BY_PHASE,
  type ClientProgress,
  PHASES,
  type Phase,
  type Regime,
  type SimState,
  selectAgentStats,
  selectKpis,
} from "../sim";
import { Feed } from "./Feed";
import { AGENT_LABEL, agentOf, isPresumido, PHASE_LABEL } from "./format";
import { Icon } from "./icons";

export function Board({
  sim,
  onOpen,
  running,
}: {
  sim: SimState;
  onOpen: (clientId: string) => void;
  running: boolean;
}) {
  const k = selectKpis(sim);
  const stats = selectAgentStats(sim);
  const pct = Math.round((k.closedClients / k.totalClients) * 100);

  return (
    <>
      <section className="kpis" aria-label="Indicadores do mês">
        <div className="kpi">
          <div className="kpi-label">Clientes fechados</div>
          <div className="kpi-value num">
            {k.closedClients}
            <small> / {k.totalClients}</small>
          </div>
          <div className="bar">
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Exceções abertas</div>
          <div
            className="kpi-value num"
            style={{ color: k.openExceptions ? "var(--bad)" : undefined }}
          >
            {k.openExceptions}
          </div>
          <div className="kpi-sub">achadas pelos agentes, esperando você</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Horas economizadas</div>
          <div className="kpi-value num">
            {k.hoursSaved.toLocaleString("pt-BR")}
            <small> h</small>
          </div>
          <div className="kpi-sub">de trabalho manual neste fechamento</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Prazos</div>
          {k.deadlines.map((d) => (
            <div key={d.obligation} className="deadline num">
              <span>
                <b>{d.obligation}</b> · dia {d.dueDay}
                <small>
                  {d.closed}/{d.clients} entregues
                </small>
              </span>
              <span style={{ color: d.daysLeft <= 3 ? "var(--bad)" : "var(--ink-3)" }}>
                {d.daysLeft >= 0 ? `faltam ${d.daysLeft}d` : `${-d.daysLeft}d de atraso`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="agents" aria-label="Agentes">
        {stats.map((s) => {
          const busy = s.activeClients > 0 && running;
          return (
            <div key={s.agent.id} className="agent-chip">
              <span
                className={`avatar${busy ? " live" : ""}`}
                style={{ background: s.agent.color, "--c": s.agent.color } as CSSProperties}
              >
                <Icon name={s.agent.icon} />
              </span>
              <b>{AGENT_LABEL[s.agent.id]}</b>
              <span className="muted num">
                {s.activeClients > 0
                  ? `${s.activeClients} em andamento`
                  : `${s.actions} ${s.actions === 1 ? "ação" : "ações"}`}
              </span>
            </div>
          );
        })}
      </section>

      <div className="work">
        <section className="card">
          <div className="card-head">
            Clientes × fases
            <span>clique no cliente para ver o que cada agente fez</span>
          </div>
          <div className="board-scroll">
            <table className="board">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 16, width: "20%" }}>Cliente</th>
                  {PHASES.map((ph) => (
                    <th key={ph}>
                      <span
                        className="dot"
                        style={{ background: agentOf(AGENT_BY_PHASE[ph]).color }}
                      />
                      {PHASE_LABEL[ph]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sim.clients.map((c) => {
                  const p = sim.progress.find((x) => x.clientId === c.id) as ClientProgress;
                  const open = sim.findings.filter(
                    (f) => f.clientId === c.id && f.status === "open",
                  );
                  return (
                    <tr key={c.id}>
                      <td>
                        <button type="button" className="client-btn" onClick={() => onOpen(c.id)}>
                          <strong>{c.name}</strong>
                          <span className={`pill${isPresumido(c) ? " presumido" : ""}`}>
                            {SHORT_REGIME[c.regime]}
                          </span>
                        </button>
                      </td>
                      {PHASES.map((ph) => (
                        <td key={ph}>
                          <Cell
                            phase={ph}
                            p={p}
                            flags={open.filter((f) => f.phase === ph).length}
                            onOpen={() => onOpen(c.id)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <Feed sim={sim} onOpen={onOpen} />
      </div>
    </>
  );
}

const SHORT_REGIME: Record<Regime, string> = {
  SimplesAnexoI: "Simples · Anexo I",
  SimplesAnexoIII: "Simples · Anexo III",
  SimplesAnexoV: "Simples · Anexo V",
  LucroPresumido: "Lucro Presumido",
  ClinicaMedica: "Presumido · clínica",
};

function Cell({
  phase,
  p,
  flags,
  onOpen,
}: {
  phase: Phase;
  p: ClientProgress;
  flags: number;
  onOpen: () => void;
}) {
  const idx = PHASES.indexOf(phase);
  const cur = PHASES.indexOf(p.phase);
  const agent = agentOf(AGENT_BY_PHASE[phase]);

  if (p.status === "done" || idx < cur) {
    return flags ? (
      <div className="cell flag">
        <span className="count num">{flags}</span> exceção
      </div>
    ) : (
      <div className="cell done" title="Concluído">
        <Icon name="check" />
      </div>
    );
  }
  if (idx > cur) return <div className="cell">·</div>;
  if (p.status === "awaiting_approval") {
    return (
      <button type="button" className="wait-btn" onClick={onOpen}>
        Revisar
      </button>
    );
  }
  if (p.status === "waiting") return <div className="cell">na fila</div>;
  return (
    <div className="cell working" style={{ "--c": agent.color } as CSSProperties}>
      <span className="pulse" />
      {AGENT_LABEL[agent.id]}
    </div>
  );
}
