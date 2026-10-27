import type { CSSProperties } from "react";
import { AGENT_BY_PHASE, type AgentId, PHASES, type Phase, type SimState } from "../sim";
import { phaseStory, sourceOf } from "./content";
import { Drawer } from "./Drawer";
import { AGENT_LABEL, agentOf, feedText, money, PHASE_LABEL, when } from "./format";
import { Icon } from "./icons";

const STATE_LABEL = {
  done: "Concluída",
  working: "Em andamento",
  waiting_you: "Esperando você",
  queued: "Na fila",
  not_started: "Ainda não começou",
} as const;

/** What one agent did in one phase for one client: the story, the documents, the exceptions and the log. */
export function PhaseDrawer({
  sim,
  clientId,
  phase,
  onClose,
  onPhase,
  onClient,
  onAgent,
}: {
  sim: SimState;
  clientId: string;
  phase: Phase;
  onClose: () => void;
  onPhase: (phase: Phase) => void;
  onClient: () => void;
  onAgent: (id: AgentId) => void;
}) {
  const client = sim.clients.find((c) => c.id === clientId);
  if (!client) return null;
  const agent = agentOf(AGENT_BY_PHASE[phase]);
  const story = phaseStory(sim, client, phase);
  const docs = sim.documents.filter((d) => d.clientId === clientId);
  const findings = sim.findings.filter((f) => f.clientId === clientId && f.phase === phase);
  const events = sim.feed.filter((e) => e.clientId === clientId && e.phase === phase).reverse();
  const i = PHASES.indexOf(phase);
  const prev = PHASES[i - 1];
  const next = PHASES[i + 1];

  return (
    <Drawer
      label={`${PHASE_LABEL[phase]} de ${client.name}`}
      onClose={onClose}
      head={
        <>
          <div className="eyebrow">{client.name}</div>
          <h2>{PHASE_LABEL[phase]}</h2>
          <div className="meta">
            <button type="button" className="agent-link" onClick={() => onAgent(agent.id)}>
              <span className="avatar" style={{ background: agent.color, width: 20, height: 20 }}>
                <Icon name={agent.icon} size={11} />
              </span>
              feito pelo agente {AGENT_LABEL[agent.id]}
            </button>
            <span className={`state ${story.state}`}>{STATE_LABEL[story.state]}</span>
            {story.finishedAt && <span className="num">terminou {story.finishedAt}</span>}
          </div>
        </>
      }
      foot={
        <>
          {prev && (
            <button type="button" className="btn sm" onClick={() => onPhase(prev)}>
              ← {PHASE_LABEL[prev]}
            </button>
          )}
          <button type="button" className="btn sm" onClick={onClient}>
            Ver o cliente
          </button>
          {next && (
            <button type="button" className="btn sm" onClick={() => onPhase(next)}>
              {PHASE_LABEL[next]} →
            </button>
          )}
        </>
      }
    >
      <section>
        <h3 className="section-title">O que foi feito</h3>
        <ul className="story">
          {story.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {story.savedMinutes > 0 && (
          <p className="saved num">
            {story.savedMinutes} minutos de trabalho manual economizados nesta etapa.
          </p>
        )}
      </section>

      {phase === "Captura" && story.state === "done" && (
        <section>
          <h3 className="section-title">Documentos capturados ({docs.length})</h3>
          <div className="doc-table">
            {docs.map((d) => (
              <div key={d.id} className="doc-row num">
                <b>
                  {d.kind}
                  {d.kind !== "Extrato" ? ` ${d.number}` : ""}
                </b>
                <span>{sourceOf(d.kind)}</span>
                <span>{money(d.amountCents)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {findings.length > 0 && (
        <section>
          <h3 className="section-title">Exceções desta etapa</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {findings.map((f) => (
              <article
                key={f.id}
                className={`finding${f.status === "resolved" ? " resolved" : ""}`}
              >
                <h4>{f.message}</h4>
                <div className="todo-action">
                  <b>O que fazer:</b> {f.action}
                </div>
                <dl>
                  <dt>Por quê</dt>
                  <dd>{f.reasoning}</dd>
                  <dt>Regra</dt>
                  <dd>{f.rule}</dd>
                  <dt>Fonte</dt>
                  <dd>{f.source}</dd>
                </dl>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="section-title">Registro do agente</h3>
        {events.length === 0 ? (
          <p className="muted-p">Sem registros ainda.</p>
        ) : (
          <ol className="timeline">
            {events.map((e) => {
              const a = agentOf(e.agent);
              return (
                <li key={e.id}>
                  <span
                    className="avatar"
                    style={{ background: a.color, "--c": a.color } as CSSProperties}
                  >
                    <Icon name={a.icon} />
                  </span>
                  <div>
                    <b style={{ color: "var(--ink)" }}>{AGENT_LABEL[e.agent]}</b> {feedText(e.text)}
                    <div className="meta num">{when(e.tick)}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </Drawer>
  );
}
