import type { CSSProperties } from "react";
import type { SimState } from "../sim";
import { AGENT_LABEL, agentOf, feedText, when } from "./format";
import { Icon } from "./icons";

const MAX = 60;

export function Feed({ sim, onOpen }: { sim: SimState; onOpen: (clientId: string) => void }) {
  const items = sim.feed.slice(-MAX).reverse();
  return (
    <aside className="card feed" aria-label="Atividade dos agentes">
      <div className="card-head">
        Atividade dos agentes
        <span className="num">{sim.feed.length} ações</span>
      </div>
      {items.length <= 1 && sim.tick === 0 ? (
        <div className="empty">Aperte “Rodar o mês” para ver os agentes trabalhando.</div>
      ) : (
        <ol aria-live="polite">
          {items.map((e) => {
            const a = agentOf(e.agent);
            return (
              <li key={e.id} className={`ev-${e.kind}`}>
                <span
                  className="avatar"
                  style={{ background: a.color, "--c": a.color } as CSSProperties}
                >
                  <Icon name={a.icon} />
                </span>
                <div>
                  <div className="txt">
                    <span className="who">{AGENT_LABEL[e.agent]}</span> {feedText(e.text)}
                  </div>
                  <time className="num">
                    {when(e.tick)}
                    {e.clientId && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => onOpen(e.clientId as string)}
                          style={{
                            border: 0,
                            background: "none",
                            padding: 0,
                            color: "var(--accent)",
                            fontSize: 11,
                          }}
                        >
                          abrir cliente
                        </button>
                      </>
                    )}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
