import { AGENT_BY_PHASE, type AgentId, type SimState, selectAgentStats } from "../sim";
import { AGENT_INFO } from "./content";
import { Drawer } from "./Drawer";
import { AGENT_LABEL, agentOf, feedText, when } from "./format";
import { Icon } from "./icons";

/** Explains one agent: what it does, what it takes and gives, its skills, when it calls you, and its work now. */
export function AgentDrawer({
  sim,
  agentId,
  onClose,
  onClient,
}: {
  sim: SimState;
  agentId: AgentId;
  onClose: () => void;
  onClient: (id: string) => void;
}) {
  const a = agentOf(agentId);
  const info = AGENT_INFO[agentId];
  const stats = selectAgentStats(sim).find((s) => s.agent.id === agentId);
  const working = sim.progress
    .filter((p) => p.status === "working" && AGENT_BY_PHASE[p.phase] === agentId)
    .map((p) => sim.clients.find((c) => c.id === p.clientId))
    .filter((c) => c !== undefined);
  const recent = sim.feed
    .filter((e) => e.agent === agentId)
    .slice(-8)
    .reverse();

  return (
    <Drawer
      label={`Agente ${AGENT_LABEL[agentId]}`}
      onClose={onClose}
      head={
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span className="avatar lg" style={{ background: a.color }}>
            <Icon name={a.icon} />
          </span>
          <div>
            <div className="eyebrow">Agente</div>
            <h2>{AGENT_LABEL[agentId]}</h2>
            <p className="lede">{info.summary}</p>
          </div>
        </div>
      }
    >
      <section className="stats num">
        <div>
          <b>{stats?.actions ?? 0}</b>
          <span>ações neste mês</span>
        </div>
        <div>
          <b style={{ color: stats?.findings ? "var(--bad)" : undefined }}>
            {stats?.findings ?? 0}
          </b>
          <span>exceções achadas</span>
        </div>
        <div>
          <b>{working.length}</b>
          <span>clientes agora</span>
        </div>
      </section>

      <section>
        <h3 className="section-title">O que ele faz</h3>
        <ul className="story">
          {info.does.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>

      <div className="two">
        <section>
          <h3 className="section-title">Recebe</h3>
          <ul className="plain">
            {info.receives.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="section-title">Entrega</h3>
          <ul className="plain">
            {info.delivers.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      </div>

      <section>
        <h3 className="section-title">Chama você quando</h3>
        <ul className="plain">
          {info.callsYou.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="section-title">Habilidades (skills)</h3>
        <div className="skills">
          {info.skills.map((s) => (
            <code key={s}>{s}</code>
          ))}
        </div>
        <p className="muted-p" style={{ marginTop: 8 }}>
          No produto real ele se conecta a: {info.connects.join(" · ")}.
        </p>
      </section>

      <section>
        <h3 className="section-title">Trabalhando agora</h3>
        {working.length === 0 ? (
          <p className="muted-p">Nenhum cliente nesta etapa agora.</p>
        ) : (
          <div className="chips">
            {working.map((c) => (
              <button key={c.id} type="button" className="chip-btn" onClick={() => onClient(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="section-title">Últimas ações</h3>
        <ol className="timeline">
          {recent.map((e) => (
            <li key={e.id}>
              <span className="avatar" style={{ background: a.color }}>
                <Icon name={a.icon} />
              </span>
              <div>
                {feedText(e.text)}
                <div className="meta num">{when(e.tick)}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </Drawer>
  );
}
