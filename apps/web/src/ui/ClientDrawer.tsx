import {
  AGENT_BY_PHASE,
  type AgentId,
  type ClientProgress,
  PHASES,
  type Phase,
  RETURNABLE_AGENTS,
  type SimState,
} from "../sim";
import { phaseStory } from "./content";
import { Drawer } from "./Drawer";
import { AGENT_LABEL, agentOf, money, monthLabel, PHASE_LABEL } from "./format";
import { Icon } from "./icons";

const SEVERITY: Record<string, string> = { baixa: "baixa", media: "média", alta: "alta" };

/** A client's month: what the accountant has to do first, then each phase with what the agents did. */
export function ClientDrawer({
  sim,
  clientId,
  onClose,
  onApprove,
  onReturn,
  onPhase,
  onAgent,
}: {
  sim: SimState;
  clientId: string;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReturn: (id: string, agent?: AgentId) => void;
  onPhase: (phase: Phase) => void;
  onAgent: (id: AgentId) => void;
}) {
  const c = sim.clients.find((x) => x.id === clientId);
  const p = sim.progress.find((x) => x.clientId === clientId) as ClientProgress;
  if (!c) return null;
  const findings = sim.findings.filter((f) => f.clientId === clientId);
  const open = findings.filter((f) => f.status === "open");
  const waiting = p.status === "awaiting_approval";
  const back = open[0]?.agent;
  const curAgent = agentOf(AGENT_BY_PHASE[p.phase]);

  return (
    <Drawer
      label={c.name}
      onClose={onClose}
      head={
        <>
          <div className="eyebrow">Cliente · fechamento de {monthLabel(sim.competence)}</div>
          <h2>{c.name}</h2>
          <div className="meta num">
            <span className="pill">{c.regimeLabel}</span>
            <span>{c.obligation}</span>
            <span>·</span>
            <span>faturamento do mês {money(c.monthlyRevenueCents)}</span>
          </div>
        </>
      }
      foot={
        waiting ? (
          <>
            {back && RETURNABLE_AGENTS.includes(back) && (
              <button type="button" className="btn" onClick={() => onReturn(c.id, back)}>
                Devolver para {AGENT_LABEL[back]}
              </button>
            )}
            <button type="button" className="btn ok" onClick={() => onApprove(c.id)}>
              <Icon name="check" size={14} />
              Aprovar e entregar
            </button>
          </>
        ) : undefined
      }
    >
      <section className={`todo ${waiting ? "act" : p.status === "done" ? "done" : "wait"}`}>
        <h3>O que você precisa fazer</h3>
        {waiting && open.length > 0 && (
          <>
            <p>
              Os agentes terminaram o mês deste cliente e separaram {open.length}{" "}
              {open.length === 1 ? "ponto" : "pontos"} para você decidir. Depois, aprove ou devolva.
            </p>
            <ol>
              {open.map((f) => (
                <li key={f.id}>
                  <b>{f.message}</b>
                  <span>{f.action}</span>
                </li>
              ))}
            </ol>
          </>
        )}
        {waiting && open.length === 0 && (
          <p>
            Tudo conferido, sem exceções. Só falta você aprovar para a Entrega transmitir e mandar a
            guia.
          </p>
        )}
        {p.status === "working" && (
          <p>
            Nada por enquanto. O agente <b>{AGENT_LABEL[curAgent.id]}</b> está na etapa{" "}
            <b>{PHASE_LABEL[p.phase]}</b>. Você é chamado quando ele precisar ou no fim.
          </p>
        )}
        {p.status === "waiting" && <p>Nada por enquanto. O mês deste cliente começa em breve.</p>}
        {p.status === "done" && (
          <p>
            Nada. O {c.obligation} foi transmitido (protocolo {p.protocol}) e a guia foi enviada ao
            cliente.
          </p>
        )}
      </section>

      <section>
        <h3 className="section-title">As etapas do mês</h3>
        <ol className="phases">
          {PHASES.map((ph) => {
            const s = phaseStory(sim, c, ph);
            const a = agentOf(AGENT_BY_PHASE[ph]);
            const clickable = s.state !== "not_started" && s.state !== "queued";
            return (
              <li key={ph} className={s.state}>
                <span
                  className="ph-icon"
                  style={{ background: s.state === "done" ? undefined : a.color }}
                >
                  {s.state === "done" ? (
                    <Icon name="check" size={13} />
                  ) : (
                    <Icon name={a.icon} size={12} />
                  )}
                </span>
                <div className="ph-text">
                  <b>{PHASE_LABEL[ph]}</b>
                  <span>{s.headline}</span>
                </div>
                {clickable && (
                  <button type="button" className="btn sm" onClick={() => onPhase(ph)}>
                    Ver o que foi feito
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {findings.length > 0 && (
        <section>
          <h3 className="section-title">
            Exceções ({open.length} abertas de {findings.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {findings.map((f) => {
              const a = agentOf(f.agent);
              return (
                <article
                  key={f.id}
                  className={`finding${f.status === "resolved" ? " resolved" : ""}`}
                >
                  <div className="meta">
                    <button type="button" className="agent-link" onClick={() => onAgent(f.agent)}>
                      <span
                        className="avatar"
                        style={{ background: a.color, width: 20, height: 20 }}
                      >
                        <Icon name={a.icon} size={11} />
                      </span>
                      <b style={{ color: "var(--ink)" }}>{AGENT_LABEL[f.agent]}</b>
                    </button>
                    <span>· severidade {SEVERITY[f.severity]}</span>
                    {f.status === "resolved" && (
                      <span>
                        · {f.resolution === "approved" ? "aceita por você" : "devolvida e refeita"}
                      </span>
                    )}
                  </div>
                  <h4>{f.message}</h4>
                  <dl>
                    <dt>Por quê</dt>
                    <dd>{f.reasoning}</dd>
                    <dt>Regra</dt>
                    <dd>{f.rule}</dd>
                    <dt>Fonte</dt>
                    <dd>{f.source}</dd>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </Drawer>
  );
}
