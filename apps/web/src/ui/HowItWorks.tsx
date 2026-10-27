import type { AgentId } from "../sim";
import { AGENT_INFO } from "./content";
import { AGENT_LABEL, agentOf } from "./format";
import { Icon } from "./icons";

const STEPS: { agent: AgentId; title: string }[] = [
  { agent: "Captura", title: "Captura" },
  { agent: "Coleta", title: "Coleta" },
  { agent: "Conferencia", title: "Conferência" },
  { agent: "Conciliacao", title: "Conciliação" },
  { agent: "Apuracao", title: "Apuração" },
  { agent: "Coordenador", title: "Aprovação (você)" },
  { agent: "Entrega", title: "Entrega" },
];

/** The product idea in one page, for anyone opening the prototype for the first time. */
export function HowItWorks({ onAgent }: { onAgent: (id: AgentId) => void }) {
  return (
    <div className="how">
      <section className="card how-hero">
        <h2>Agentes que fazem o mês do escritório</h2>
        <p>
          O escritório pluga os agentes na própria operação. Cada agente é um trabalhador
          especializado em uma etapa do fechamento: captura, cobrança, conferência, conciliação,
          apuração e entrega. Eles trabalham sozinhos, todo mês, para cada cliente, e você só entra
          para decidir o que precisa de um contador e aprovar.
        </p>
      </section>

      <section>
        <h3 className="section-title">O caminho de cada cliente no mês</h3>
        <ol className="how-flow">
          {STEPS.map((s, i) => {
            const a = agentOf(s.agent);
            const human = s.title.startsWith("Aprovação");
            return (
              <li key={s.title} className={human ? "human" : undefined}>
                <span className="num step">{i + 1}</span>
                <button type="button" className="how-step" onClick={() => onAgent(s.agent)}>
                  <span className="avatar" style={{ background: human ? "var(--warn)" : a.color }}>
                    <Icon name={human ? "check" : a.icon} />
                  </span>
                  <b>{s.title}</b>
                  <span>
                    {human ? "Você revisa as exceções e aprova." : AGENT_INFO[s.agent].summary}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="muted-p">
          O {AGENT_LABEL.Coordenador} cuida do calendário, abre o mês de cada cliente e passa o
          trabalho de um agente para o outro.
        </p>
      </section>

      <div className="two">
        <section className="card how-box">
          <h3>Você no controle</h3>
          <ul className="plain">
            <li>
              Você escolhe quanto cada agente faz sozinho: só observa, sugere, faz e pede aprovação,
              ou faz e avisa.
            </li>
            <li>Nada é transmitido ao governo nem enviado ao cliente sem a sua aprovação.</li>
            <li>Cada exceção traz o porquê, a regra legal, a fonte e o que fazer.</li>
            <li>Tudo o que um agente fez fica registrado, com quando e por quê.</li>
          </ul>
        </section>
        <section className="card how-box">
          <h3>Ao lado do que o escritório já usa</h3>
          <ul className="plain">
            <li>Os agentes leem e alimentam o ERP do escritório (Domínio, Alterdata, Questor).</li>
            <li>Documentos vêm da SEFAZ, do Ambiente Nacional da NFS-e e do banco.</li>
            <li>Declarações e guias saem pela API oficial da Receita (Integra Contador).</li>
            <li>A conversa com o cliente é pelo WhatsApp e pelo e-mail do escritório.</li>
          </ul>
        </section>
      </div>

      <section className="card how-box">
        <h3>Este protótipo</h3>
        <p>
          Mostra o fechamento de setembro de 12 empresas fictícias (Simples e Lucro Presumido). Os
          agentes avançam sozinhos; clique em qualquer etapa concluída para ver o que foi feito, num
          cliente para ver o que você precisa fazer, ou num agente para entender o trabalho dele. Os
          dados são simulados: nenhum cliente real, nenhuma chamada ao governo.
        </p>
      </section>
    </div>
  );
}
