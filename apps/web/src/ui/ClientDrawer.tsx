import { type CSSProperties, useEffect } from "react";
import {
  AGENT_BY_PHASE,
  type AgentId,
  type ClientProgress,
  PHASES,
  RETURNABLE_AGENTS,
  type SimState,
} from "../sim";
import { AGENT_LABEL, agentOf, feedText, money, PHASE_LABEL, when } from "./format";
import { Icon } from "./icons";

const SEVERITY: Record<string, string> = { baixa: "baixa", media: "média", alta: "alta" };

export function ClientDrawer({
  sim,
  clientId,
  onClose,
  onApprove,
  onReturn,
}: {
  sim: SimState;
  clientId: string;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReturn: (id: string, agent?: AgentId) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const c = sim.clients.find((x) => x.id === clientId);
  const p = sim.progress.find((x) => x.clientId === clientId) as ClientProgress;
  if (!c) return null;
  const findings = sim.findings.filter((f) => f.clientId === clientId);
  const open = findings.filter((f) => f.status === "open");
  const docs = sim.documents.filter((d) => d.clientId === clientId);
  const events = sim.feed.filter((e) => e.clientId === clientId).reverse();
  const cur = PHASES.indexOf(p.phase);
  const waiting = p.status === "awaiting_approval";
  const target = open[0]?.agent;

  return (
    <>
      <button type="button" className="scrim" aria-label="Fechar" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={c.name}>
        <div className="drawer-head">
          <h2>{c.name}</h2>
          <div className="meta num">
            <span className="pill">{c.regimeLabel}</span>
            <span>{c.obligation}</span>
            <span>·</span>
            <span>faturamento do mês {money(c.monthlyRevenueCents)}</span>
            {p.protocol && (
              <>
                <span>·</span>
                <span>protocolo {p.protocol}</span>
              </>
            )}
          </div>
        </div>

        <div className="drawer-body">
          <section>
            <h3 className="section-title">Onde está</h3>
            <div className="stepper">
              {PHASES.map((ph, i) => {
                const done = p.status === "done" || i < cur;
                const here = !done && i === cur;
                return (
                  <div
                    key={ph}
                    className={done ? "on" : here ? "cur" : undefined}
                    style={{ "--c": agentOf(AGENT_BY_PHASE[ph]).color } as CSSProperties}
                  >
                    <i />
                    {PHASE_LABEL[ph]}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="section-title">
              Exceções {findings.length ? `(${open.length} abertas de ${findings.length})` : ""}
            </h3>
            {findings.length === 0 ? (
              <div className="ok-line">
                Nenhuma exceção até agora. Os agentes não acharam divergências.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {findings.map((f) => {
                  const a = agentOf(f.agent);
                  return (
                    <article
                      key={f.id}
                      className={`finding${f.status === "resolved" ? " resolved" : ""}`}
                    >
                      <div className="meta">
                        <span
                          className="avatar"
                          style={{ background: a.color, width: 20, height: 20 }}
                        >
                          <Icon name={a.icon} size={11} />
                        </span>
                        <b style={{ color: "var(--ink)" }}>{AGENT_LABEL[f.agent]}</b>
                        <span>· severidade {SEVERITY[f.severity]}</span>
                        {f.status === "resolved" && (
                          <span>
                            ·{" "}
                            {f.resolution === "approved"
                              ? "aceita pelo contador"
                              : "devolvida e refeita"}
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
            )}
          </section>

          <section>
            <h3 className="section-title">Documentos capturados ({docs.length})</h3>
            <div className="docs num">
              {docs.map((d) => (
                <div key={d.id} className="doc">
                  <b>
                    {d.kind} {d.kind !== "Extrato" ? d.number : ""}
                  </b>
                  <span>{money(d.amountCents)}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="section-title">O que os agentes fizeram</h3>
            {events.length === 0 ? (
              <div className="empty" style={{ padding: 0, textAlign: "left" }}>
                Ainda não começou.
              </div>
            ) : (
              <ol className="timeline">
                {events.map((e) => {
                  const a = agentOf(e.agent);
                  return (
                    <li key={e.id}>
                      <span className="avatar" style={{ background: a.color }}>
                        <Icon name={a.icon} />
                      </span>
                      <div>
                        <b style={{ color: "var(--ink)" }}>{AGENT_LABEL[e.agent]}</b>{" "}
                        {feedText(e.text)}
                        <div className="meta num">{when(e.tick)}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        <div className="drawer-foot">
          {waiting ? (
            <>
              {target && RETURNABLE_AGENTS.includes(target) && (
                <button type="button" className="btn" onClick={() => onReturn(c.id, target)}>
                  Devolver para {AGENT_LABEL[target]}
                </button>
              )}
              <button type="button" className="btn ok" onClick={() => onApprove(c.id)}>
                <Icon name="check" size={14} />
                Aprovar e entregar
              </button>
            </>
          ) : (
            <span className="meta">
              {p.status === "done"
                ? "Entregue ao cliente."
                : "Aprovar fica disponível quando os agentes terminarem."}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
