import {
  AGENT_BY_PHASE,
  type AgentId,
  type Client,
  type ClientProgress,
  PHASES,
  type Phase,
  SAVED_MINUTES,
  type SimState,
} from "../sim";
import { AGENT_LABEL, money, monthLabel, PHASE_LABEL, when } from "./format";

export interface AgentInfo {
  summary: string;
  does: string[];
  receives: string[];
  delivers: string[];
  skills: string[];
  callsYou: string[];
  /** Where the data comes from or goes to in the real product. */
  connects: string[];
}

/** What each agent is for, in plain pt-BR. Mirrors the concept document (docs/ROADMAP.md, ADR 0006-0009). */
export const AGENT_INFO: Record<AgentId, AgentInfo> = {
  Coordenador: {
    summary:
      "Abre o mês de cada cliente, segue o calendário e passa o trabalho de um agente para o outro.",
    does: [
      "Abre o fechamento de cada cliente no começo do mês",
      "Move o cliente de uma etapa para a próxima quando o agente termina",
      "Monta a fila do que precisa do contador e avisa quando um prazo aperta",
    ],
    receives: [
      "Cadastro dos clientes (regime, município, obrigações)",
      "O andamento de cada agente",
    ],
    delivers: ["O mês organizado por cliente", "A fila do contador"],
    skills: [
      "abrir-mes",
      "calendario-de-obrigacoes",
      "mover-etapa",
      "fila-do-contador",
      "alerta-de-prazo",
    ],
    callsYou: ["Um cliente está pronto para aprovar", "Um prazo está em risco"],
    connects: ["Cadastro de CNPJ da Receita", "Carteira de clientes exportada do ERP"],
  },
  Captura: {
    summary: "Puxa todos os documentos do mês do cliente, sem o cliente precisar mandar nada.",
    does: [
      "Baixa as NF-e emitidas e recebidas e os CT-e na SEFAZ",
      "Baixa as NFS-e prestadas e tomadas no Ambiente Nacional da NFS-e",
      "Importa o extrato do banco",
      "Guarda cada documento sem duplicata e com marca de origem",
    ],
    receives: ["Cliente e competência", "Acesso autorizado do cliente (certificado ou procuração)"],
    delivers: ["Todos os documentos do mês, prontos para conferir"],
    skills: [
      "baixar-nfe-por-nsu",
      "manifestar-ciencia",
      "baixar-nfse-adn",
      "importar-extrato",
      "sem-duplicata",
    ],
    callsYou: ["O certificado do cliente venceu", "Uma fonte não respondeu"],
    connects: [
      "SEFAZ (Distribuição DF-e)",
      "Ambiente Nacional da NFS-e",
      "Extrato OFX ou Open Finance",
    ],
  },
  Coleta: {
    summary:
      "Descobre o que falta e pede ao cliente, do jeito que o escritório pediria, até chegar.",
    does: [
      "Compara o que chegou com o que era esperado para o cliente",
      "Escreve a mensagem de cobrança com a lista exata do que falta",
      "Lê os anexos que o cliente manda (foto, PDF) e classifica",
    ],
    receives: ["O que a Captura trouxe", "O que era esperado para o regime do cliente"],
    delivers: ["Os documentos que faltavam", "O histórico da conversa com o cliente"],
    skills: ["lista-de-pendencias", "mensagem-de-cobranca", "lembrete", "ler-anexo"],
    callsYou: [
      "O cliente não responde depois de alguns lembretes",
      "O cliente manda uma dúvida em vez do documento",
    ],
    connects: ["WhatsApp Business", "E-mail do escritório", "Link de envio de arquivos"],
  },
  Conferencia: {
    summary: "Confere nota por nota o que um analista fiscal conferiria e explica cada problema.",
    does: [
      "Confere CFOP, CST/CSOSN e NCM contra o regime da empresa",
      "Confere as retenções de ISS, IRRF e CSRF",
      "Confere se a nota é mesmo da empresa, se foi cancelada ou está repetida",
    ],
    receives: ["Os documentos do mês", "O perfil do cliente (regime, atividade, município)"],
    delivers: [
      "Cada nota certa ou com exceção",
      "A exceção com o porquê, a regra, a fonte e o que fazer",
    ],
    skills: [
      "conferir-cfop",
      "conferir-cst-csosn",
      "conferir-ncm-st",
      "conferir-retencoes",
      "explicar-excecao",
    ],
    callsYou: ["Um erro muda o imposto", "A regra depende de algo que só o cliente sabe"],
    connects: ["Tabelas oficiais (NCM, CFOP, CEST, lista de serviços)", "Regras do motor fiscal"],
  },
  Conciliacao: {
    summary: "Cruza nota, banco e ERP e aponta o que não bate.",
    does: [
      "Casa cada nota com o pagamento no extrato",
      "Aponta dinheiro que entrou sem nota e nota sem pagamento",
      "Prepara os lançamentos para o ERP do escritório",
    ],
    receives: ["Notas conferidas", "Extrato bancário", "Lançamentos do ERP"],
    delivers: ["O que bateu e o que sobrou", "Arquivo para importar no ERP"],
    skills: ["casar-nota-extrato", "casar-nota-erp", "sugerir-lancamento", "exportar-para-erp"],
    callsYou: ["Entrou dinheiro sem nota", "A diferença passa do limite que o escritório definiu"],
    connects: ["Extrato bancário", "Importação e exportação do ERP"],
  },
  Apuracao: {
    summary: "Calcula o imposto do mês com código exato e mostra de onde veio cada número.",
    does: [
      "Simples: calcula o PGDAS-D (RBT12, anexo, alíquota efetiva, fator R)",
      "Lucro Presumido: PIS, COFINS e ISS do mês; IRPJ e CSLL no trimestre",
      "Vigia teto e sublimite do Simples e compara regimes",
    ],
    receives: ["Receitas e retenções conferidas e conciliadas", "Histórico de 12 meses"],
    delivers: ["A apuração pronta para aprovar", "Alertas de regime"],
    skills: ["apurar-simples", "segregar-receitas", "apurar-presumido", "vigiar-regime"],
    callsYou: ["O valor muda muito em relação ao mês anterior", "Um limite de regime está perto"],
    connects: [
      "Motores do Simples e do Lucro Presumido",
      "Integra Contador (declarações anteriores)",
    ],
  },
  Entrega: {
    summary: "Depois da sua aprovação, transmite, gera as guias e entrega ao cliente.",
    does: [
      "Transmite a declaração e guarda o protocolo",
      "Gera a guia (DAS, DARF, ISS)",
      "Manda a guia ao cliente com o vencimento",
    ],
    receives: ["A apuração aprovada por você"],
    delivers: ["Declaração transmitida, guia e mensagem ao cliente"],
    skills: ["transmitir-pgdas", "gerar-das", "gerar-darf", "gerar-guia-iss", "enviar-ao-cliente"],
    callsYou: ["Sempre antes de transmitir", "O governo devolve erro"],
    connects: ["Integra Contador (Serpro)", "Portal da prefeitura (ISS)", "WhatsApp e e-mail"],
  },
};

export type PhaseState = "done" | "working" | "waiting_you" | "blocked" | "queued" | "not_started";

export function phaseState(p: ClientProgress, phase: Phase): PhaseState {
  const idx = PHASES.indexOf(phase);
  const cur = PHASES.indexOf(p.phase);
  if (p.status === "done" || idx < cur) return "done";
  if (idx > cur) return "not_started";
  if (p.status === "awaiting_approval") return "waiting_you";
  if (p.status === "blocked") return "blocked";
  if (p.status === "waiting") return "queued";
  return "working";
}

export interface PhaseStory {
  state: PhaseState;
  /** One line for lists. */
  headline: string;
  /** What was done, in plain words. */
  lines: string[];
  /** When the agent finished the phase, if it did. */
  finishedAt?: string;
  savedMinutes: number;
}

const SOURCE: Record<string, string> = {
  "NF-e": "SEFAZ-GO (distribuição de documentos)",
  "NFS-e": "Ambiente Nacional da NFS-e",
  Extrato: "banco (arquivo OFX)",
  Guia: "portal da prefeitura",
  Folha: "sistema de folha do cliente",
};

/** "a, b e c" */
function listPt(items: string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

export function sourceOf(kind: string): string {
  return SOURCE[kind] ?? "cliente";
}

/** What an agent did in one phase for one client, built from the simulation's documents, findings and feed. */
export function phaseStory(sim: SimState, client: Client, phase: Phase): PhaseStory {
  const p = sim.progress.find((x) => x.clientId === client.id) as ClientProgress;
  const state = phaseState(p, phase);
  const docs = sim.documents.filter((d) => d.clientId === client.id);
  const notas = docs.filter((d) => d.kind === "NF-e" || d.kind === "NFS-e");
  const count = (k: string) => docs.filter((d) => d.kind === k).length;
  const findings = sim.findings.filter((f) => f.clientId === client.id && f.phase === phase);
  const events = sim.feed.filter((e) => e.clientId === client.id && e.phase === phase);
  const last = events.at(-1);
  const agent = AGENT_LABEL[AGENT_BY_PHASE[phase]];
  const total = notas.reduce((s, d) => s + d.amountCents, 0);
  const achados = findings.length
    ? `Encontrou ${findings.length} ${findings.length === 1 ? "exceção" : "exceções"} e mandou para você revisar.`
    : "Nada fora do lugar.";

  if (state === "not_started" || state === "queued") {
    return {
      state,
      headline: "Ainda não começou",
      lines: [`${agent} assume quando a etapa anterior terminar.`],
      savedMinutes: 0,
    };
  }

  const done = state === "done";
  const lines: string[] = [];
  let headline = "";
  switch (phase) {
    case "Captura": {
      const parts = [
        count("NF-e") && `${count("NF-e")} NF-e`,
        count("NFS-e") && `${count("NFS-e")} NFS-e`,
        count("Guia") && `${count("Guia")} guia${count("Guia") > 1 ? "s" : ""}`,
        count("Extrato") && "o extrato bancário",
      ].filter(Boolean);
      headline = `${docs.length} documentos capturados`;
      lines.push(`Capturou ${docs.length} documentos do mês: ${listPt(parts as string[])}.`);
      lines.push(
        `Fontes: ${[...new Set(docs.map((d) => sourceOf(d.kind)))].join("; ")}. O cliente não precisou mandar nada.`,
      );
      lines.push("Cada documento foi guardado com marca de origem e conferido contra duplicata.");
      break;
    }
    case "Coleta":
      headline = "Documentos completos";
      lines.push(`Comparou o que chegou com o esperado para ${client.regimeLabel}.`);
      lines.push(
        `Pediu ao cliente e recebeu o extrato de ${monthLabel(sim.competence)} e os comprovantes que faltavam.`,
      );
      break;
    case "Conferencia":
      headline = findings.length
        ? `${findings.length} exceção para revisar`
        : `${notas.length} notas conferidas`;
      lines.push(
        `Conferiu ${notas.length} notas uma a uma: CFOP, CST/CSOSN, NCM, retenções de ISS, IRRF e CSRF, e se cada nota é mesmo da empresa.`,
      );
      lines.push(achados);
      break;
    case "Conciliacao":
      headline = findings.length ? "Diferença encontrada" : "Tudo bateu";
      lines.push(
        `Cruzou ${notas.length} notas (${money(total)}) com o extrato bancário e com os lançamentos do ERP.`,
      );
      lines.push(achados);
      break;
    case "Apuracao":
      headline = `${client.obligation} calculado`;
      lines.push(
        `Calculou o ${client.obligation} de ${monthLabel(sim.competence)} sobre o faturamento de ${money(client.monthlyRevenueCents)}.`,
      );
      lines.push(
        client.obligation === "PGDAS-D"
          ? "Usou a receita dos últimos 12 meses (RBT12), o anexo e a alíquota efetiva da LC 123/2006."
          : "PIS 0,65% e COFINS 3% no mês; IRPJ e CSLL do trimestre pela presunção da Lei 9.249/1995.",
      );
      lines.push(achados);
      break;
    case "Aprovacao": {
      const open = sim.findings.filter(
        (f) => f.clientId === client.id && f.status === "open",
      ).length;
      headline = done ? "Aprovado por você" : "Esperando você";
      lines.push(
        done
          ? "Você aprovou o fechamento. O cliente seguiu para a entrega."
          : open
            ? `Os agentes terminaram. Há ${open} ${open === 1 ? "exceção" : "exceções"} para você decidir antes de entregar.`
            : "Os agentes terminaram e não acharam nada. Só falta a sua aprovação.",
      );
      break;
    }
    case "Entrega":
      headline = done ? "Entregue" : "Transmitindo";
      lines.push(
        done
          ? `Transmitiu o ${client.obligation} (protocolo ${p.protocol}) e mandou a guia ao cliente com o vencimento.`
          : `Transmitindo o ${client.obligation} e gerando a guia.`,
      );
      break;
  }
  if (!done && state === "working") lines.unshift(`${agent} está trabalhando nesta etapa agora.`);
  return {
    state,
    headline,
    lines,
    finishedAt: done && last ? when(last.tick) : undefined,
    savedMinutes: done ? SAVED_MINUTES[client.regime][phase] : 0,
  };
}

export { PHASE_LABEL };
