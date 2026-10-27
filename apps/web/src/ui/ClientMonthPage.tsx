"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientMonth, FindingView } from "../store/read-client";
import { money, monthLabel } from "./format";
import { Icon } from "./icons";
import { postDecision } from "./post-decision";

const POLL_MS = 2000;
const PHASE_LABEL: Record<string, string> = {
  captura: "Captura",
  coleta: "Coleta",
  conferencia: "Conferência",
  conciliacao: "Conciliação",
  apuracao: "Apuração",
  aprovacao: "Aprovação",
  entrega: "Entrega",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Na fila",
  running: "Trabalhando",
  waiting: "Espera você",
  blocked: "Bloqueada",
  done: "Concluída",
};
const KIND_LABEL: Record<string, string> = {
  nfe: "NF-e",
  nfse: "NFS-e",
  ofx: "Extrato",
  ledger: "Livro do ERP",
};
const SEVERITY_LABEL: Record<string, string> = { info: "baixa", warning: "média", blocker: "alta" };

/** XML shown as plain text (escaped by React): the file the agents read, never rendered as markup. */
function SourceViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let stop = false;
    fetch(`/api/document/${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (b: { text?: string } | null) =>
          !stop && setText(b?.text ?? "Arquivo de origem indisponível."),
      )
      .catch(() => !stop && setText("Arquivo de origem indisponível."));
    return () => {
      stop = true;
    };
  }, [id]);
  return (
    <div className="source-viewer">
      <div className="meta">
        <b style={{ color: "var(--ink)" }}>Arquivo de origem</b>
        <button type="button" className="btn sm" onClick={onClose}>
          Fechar
        </button>
      </div>
      <pre>{text ?? "Carregando…"}</pre>
    </div>
  );
}

function FindingCard({ f, onSource }: { f: FindingView; onSource: (id: string) => void }) {
  return (
    <article className={`finding${f.resolved ? " resolved" : ""}`}>
      <div className="meta">
        <b style={{ color: "var(--ink)" }}>{PHASE_LABEL[f.phase]}</b>
        <span>· severidade {SEVERITY_LABEL[f.severity] ?? f.severity}</span>
        {f.resolved && <span>· resolvida</span>}
      </div>
      <h4>{f.message}</h4>
      <dl>
        {f.rule && (
          <>
            <dt>Regra</dt>
            <dd>{f.rule}</dd>
          </>
        )}
        <dt>Fonte</dt>
        <dd>{f.source ?? "sem fonte registrada pelo agente"}</dd>
        {f.ref && (
          <>
            <dt>Referência</dt>
            <dd>{f.ref}</dd>
          </>
        )}
      </dl>
      {f.documentId && (
        <div>
          <button type="button" className="btn sm" onClick={() => onSource(f.documentId as string)}>
            Ver documento de origem
          </button>
        </div>
      )}
    </article>
  );
}

export function ClientMonthPage({ clientId }: { clientId: string }) {
  const [data, setData] = useState<ClientMonth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  useEffect(() => setToken(sessionStorage.getItem("ai4-accountant-token") ?? ""), []);

  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/client/${encodeURIComponent(clientId)}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as { month?: ClientMonth };
        if (stop) return;
        if (res.ok && body.month) {
          setData(body.month);
          setError(null);
        } else if (res.status === 404) setError("Cliente ou base do mês não encontrados.");
      } catch {
        // restarting: keep what is on screen
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [clientId]);

  const decide = useCallback(
    async (decision: "approved" | "sent_back") => {
      setPending(true);
      setDecideError(null);
      const r = await postDecision(clientId, decision, token);
      setPending(false);
      if (!r.ok) setDecideError(r.message);
    },
    [clientId, token],
  );

  if (!data)
    return (
      <main className="client-page">
        <a href="/">← Painel do mês</a>
        <p>{error ?? "Carregando…"}</p>
      </main>
    );

  const open = data.findings.filter((f) => !f.resolved);
  const closed = data.phases.every((p) => p.status === "done");
  const blocked = data.phases.find((p) => p.status === "blocked");
  return (
    <main className="client-page">
      <a href="/">← Painel do mês</a>
      <header>
        <div className="eyebrow">Cliente · fechamento de {monthLabel(data.month)}</div>
        <h1>{data.client.name}</h1>
        <div className="meta num">
          <span className="pill">
            {data.client.regime === "presumido" ? "Lucro Presumido" : "Simples Nacional"}
          </span>
          <span>CNPJ {data.client.cnpj}</span>
        </div>
      </header>

      <section
        className={`todo ${data.waitingApproval || blocked ? "act" : closed ? "done" : "wait"}`}
      >
        <h3>O que você precisa fazer</h3>
        {data.waitingApproval && (
          <>
            <p>
              {open.length > 0
                ? `Os agentes terminaram e separaram ${open.length} ${open.length === 1 ? "ponto" : "pontos"} para você. Confira abaixo, depois aprove ou devolva.`
                : "Tudo conferido, sem exceções. Aprove para a Entrega emitir a guia."}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                className="btn ok"
                disabled={pending}
                onClick={() => decide("approved")}
              >
                <Icon name="check" size={14} />
                Aprovar e entregar
              </button>
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() => decide("sent_back")}
              >
                Devolver para ajuste
              </button>
              <input
                type="password"
                placeholder="Token do contador"
                aria-label="Token do contador"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  sessionStorage.setItem("ai4-accountant-token", e.target.value);
                }}
              />
            </div>
            {decideError && <p role="alert">{decideError}</p>}
          </>
        )}
        {blocked && !data.waitingApproval && (
          <p>
            A etapa <b>{PHASE_LABEL[blocked.phase]}</b> está bloqueada. Veja a linha do tempo e as
            exceções abaixo.
          </p>
        )}
        {closed && <p>Nada. O mês foi aprovado e entregue.</p>}
        {!data.waitingApproval && !blocked && !closed && (
          <p>Nada por enquanto. Você é chamado quando os agentes precisarem ou no fim.</p>
        )}
      </section>

      {source && <SourceViewer id={source} onClose={() => setSource(null)} />}

      <section>
        <h3 className="section-title">Etapas</h3>
        <ol className="phases">
          {data.phases.map((p) => (
            <li key={p.phase} className={p.status === "done" ? "done" : p.status}>
              <div className="ph-text">
                <b>{PHASE_LABEL[p.phase]}</b>
                <span>{STATUS_LABEL[p.status] ?? p.status}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="section-title">
          Exceções ({open.length} abertas de {data.findings.length})
        </h3>
        {data.findings.length === 0 && <p>Nenhuma exceção neste mês.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.findings.map((f) => (
            <FindingCard key={f.id} f={f} onSource={setSource} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="section-title">Documentos ({data.documents.length})</h3>
        <table className="docs">
          <tbody>
            {data.documents.map((d) => (
              <tr key={d.id}>
                <td>{KIND_LABEL[d.kind] ?? d.kind}</td>
                <td className="num">{d.key ?? d.id}</td>
                <td className="num">{d.amountCents === null ? "" : money(d.amountCents)}</td>
                <td>
                  {d.hasSource && (
                    <button type="button" className="btn sm" onClick={() => setSource(d.id)}>
                      Ver origem
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="section-title">O que os agentes fizeram</h3>
        <ol className="timeline">
          {data.timeline.map((t) => (
            <li key={t.seq}>
              <b className="tl-phase">{t.phase ? PHASE_LABEL[t.phase] : "—"}</b> {t.text}
            </li>
          ))}
        </ol>
      </section>

      {data.approvals.length > 0 && (
        <section>
          <h3 className="section-title">Decisões</h3>
          <ul>
            {data.approvals.map((a) => (
              <li key={`${a.at}-${a.decision}`}>
                {a.decision === "approved" ? "Aprovado" : "Devolvido"} por {a.by}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
