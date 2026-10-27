import type { CSSProperties } from "react";
import {
  AGENT_BY_PHASE,
  type AgentId,
  type Client,
  type ClientProgress,
  ceilingUsage,
  PHASES,
  type Phase,
  type QueueItem,
  type Regime,
  type SimState,
  selectAgentStats,
  selectKpis,
} from "../sim";
import { phaseState } from "./content";
import { Feed } from "./Feed";
import { AGENT_LABEL, agentOf, isPresumido, money, PHASE_LABEL } from "./format";
import { Icon } from "./icons";

const SHORT_REGIME: Record<Regime, string> = {
  SimplesAnexoI: "Simples · Anexo I",
  SimplesAnexoIII: "Simples · Anexo III",
  SimplesAnexoV: "Simples · Anexo V",
  LucroPresumido: "Lucro Presumido",
  ClinicaMedica: "Presumido · clínica",
};

export function Board({
  sim,
  queue,
  live,
  onClient,
  onPhase,
  onAgent,
  onQueue,
}: {
  sim: SimState;
  queue: QueueItem[];
  live: boolean;
  onClient: (clientId: string) => void;
  onPhase: (clientId: string, phase: Phase) => void;
  onAgent: (id: AgentId) => void;
  onQueue: () => void;
}) {
  const k = selectKpis(sim);
  const stats = selectAgentStats(sim);
  const pct = Math.round((k.closedClients / k.totalClients) * 100);

  return (
    <>
      <section className="needs-you card" aria-label="Precisa de você">
        <div className="card-head">
          Precisa de você
          {queue.length > 3 && (
            <button type="button" className="link-btn" onClick={onQueue}>
              ver os {queue.length} na fila do contador
            </button>
          )}
        </div>
        {queue.length === 0 ? (
          <p className="needs-empty">
            Nada agora. Os agentes chamam você quando um cliente estiver pronto para aprovar.
          </p>
        ) : (
          <ul>
            {queue.slice(0, 3).map((q) => {
              const f = q.findings[0];
              return (
                <li key={q.client.id}>
                  <button type="button" onClick={() => onClient(q.client.id)}>
                    <b>{q.client.name}</b>
                    <span>
                      {f
                        ? `${q.findings.length} ${q.findings.length === 1 ? "ponto" : "pontos"} para decidir. ${f.action}`
                        : "Tudo conferido, sem exceções. Só falta aprovar."}
                    </span>
                    <em>{f ? "Revisar" : "Aprovar"} →</em>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="kpis" aria-label="Indicadores do mês">
        <div className="kpi">
          <div className="kpi-label">Clientes entregues</div>
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
          const busy = s.activeClients > 0 && live;
          return (
            <button
              key={s.agent.id}
              type="button"
              className="agent-chip"
              onClick={() => onAgent(s.agent.id)}
            >
              <span
                className={`avatar${busy ? " live" : ""}`}
                style={{ background: s.agent.color, "--c": s.agent.color } as CSSProperties}
              >
                <Icon name={s.agent.icon} />
              </span>
              <b>{AGENT_LABEL[s.agent.id]}</b>
              <span className="muted num">
                {s.activeClients > 0
                  ? `trabalhando em ${s.activeClients}`
                  : `${s.actions} ${s.actions === 1 ? "ação" : "ações"}`}
              </span>
            </button>
          );
        })}
      </section>

      <div className="work">
        <section className="card">
          <div className="card-head">
            Clientes × etapas
            <span>clique numa etapa para ver o que o agente fez</span>
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
                        <button type="button" className="client-btn" onClick={() => onClient(c.id)}>
                          <strong>{c.name}</strong>
                          <span className={`pill${isPresumido(c) ? " presumido" : ""}`}>
                            {SHORT_REGIME[c.regime]}
                          </span>
                        </button>
                        <Ceiling client={c} />
                      </td>
                      {PHASES.map((ph) => (
                        <td key={ph}>
                          <Cell
                            phase={ph}
                            p={p}
                            flags={open.filter((f) => f.phase === ph).length}
                            onPhase={() => onPhase(c.id, ph)}
                            onClient={() => onClient(c.id)}
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
        <Feed sim={sim} onOpen={onClient} />
      </div>
    </>
  );
}

function Ceiling({ client }: { client: Client }) {
  const u = ceilingUsage(client);
  return (
    <div
      className={`ceiling ${u.level}`}
      title={`${u.label[0]?.toUpperCase()}${u.label.slice(1)}: ${money(u.usedCents)} de ${money(u.limitCents)} nos últimos 12 meses${u.overSublimit ? " (acima do sublimite de R$ 3,6 milhões)" : ""}`}
    >
      <span className="bar">
        <i style={{ width: `${Math.min(u.pct, 100)}%` }} />
      </span>
      <span className="num">
        {u.pct}% · {u.label}
      </span>
    </div>
  );
}

function Cell({
  phase,
  p,
  flags,
  onPhase,
  onClient,
}: {
  phase: Phase;
  p: ClientProgress;
  flags: number;
  onPhase: () => void;
  onClient: () => void;
}) {
  const agent = agentOf(AGENT_BY_PHASE[phase]);
  const state = phaseState(p, phase);
  const title = `${PHASE_LABEL[phase]}: ver o que foi feito`;

  if (state === "done") {
    return flags ? (
      <button type="button" className="cell flag" onClick={onPhase} title={title}>
        <span className="count num">{flags}</span> exceção
      </button>
    ) : (
      <button
        type="button"
        className="cell done"
        onClick={onPhase}
        title={title}
        aria-label={title}
      >
        <Icon name="check" />
      </button>
    );
  }
  if (state === "not_started") return <div className="cell">·</div>;
  if (state === "waiting_you") {
    return (
      <button type="button" className="wait-btn" onClick={onClient}>
        Revisar
      </button>
    );
  }
  if (state === "blocked") {
    return (
      <button type="button" className="cell blocked" onClick={onPhase} title={title}>
        Bloqueada
      </button>
    );
  }
  if (state === "queued") return <div className="cell">na fila</div>;
  return (
    <button
      type="button"
      className="cell working"
      style={{ "--c": agent.color } as CSSProperties}
      onClick={onPhase}
      title={title}
    >
      <span className="pulse" />
      {AGENT_LABEL[agent.id]}
    </button>
  );
}
