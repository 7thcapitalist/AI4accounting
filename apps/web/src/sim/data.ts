import type { Agent, AgentId, Client, Phase, Regime, Severity } from "./types";

export const AGENTS: Agent[] = [
  {
    id: "Coordenador",
    name: "Coordenador",
    role: "Orquestra o fechamento e a fila do contador",
    color: "#7c3aed",
    icon: "workflow",
  },
  {
    id: "Captura",
    name: "Captura",
    role: "Captura XMLs e notas nos portais",
    color: "#0ea5e9",
    icon: "download",
  },
  {
    id: "Coleta",
    name: "Coleta",
    role: "Coleta extratos e documentos do cliente",
    color: "#14b8a6",
    icon: "inbox",
  },
  {
    id: "Conferencia",
    name: "Conferencia",
    role: "Confere notas, retenções e CFOP",
    color: "#f59e0b",
    icon: "search-check",
  },
  {
    id: "Conciliacao",
    name: "Conciliacao",
    role: "Concilia notas com o extrato bancário",
    color: "#ec4899",
    icon: "scale",
  },
  {
    id: "Apuracao",
    name: "Apuracao",
    role: "Apura PGDAS-D e DARF",
    color: "#22c55e",
    icon: "calculator",
  },
  {
    id: "Entrega",
    name: "Entrega",
    role: "Transmite e entrega as guias ao cliente",
    color: "#64748b",
    icon: "send",
  },
];

export const AGENT_BY_PHASE: Record<Phase, AgentId> = {
  Captura: "Captura",
  Coleta: "Coleta",
  Conferencia: "Conferencia",
  Conciliacao: "Conciliacao",
  Apuracao: "Apuracao",
  Aprovacao: "Coordenador",
  Entrega: "Entrega",
};

/** Minutes of manual work avoided when an agent completes its phase. */
export const SAVED_MINUTES: Record<Regime, Record<Phase, number>> = {
  SimplesAnexoI: {
    Captura: 10,
    Coleta: 15,
    Conferencia: 25,
    Conciliacao: 20,
    Apuracao: 15,
    Aprovacao: 0,
    Entrega: 5,
  },
  SimplesAnexoIII: {
    Captura: 10,
    Coleta: 15,
    Conferencia: 30,
    Conciliacao: 25,
    Apuracao: 20,
    Aprovacao: 0,
    Entrega: 5,
  },
  SimplesAnexoV: {
    Captura: 10,
    Coleta: 15,
    Conferencia: 35,
    Conciliacao: 25,
    Apuracao: 25,
    Aprovacao: 0,
    Entrega: 5,
  },
  LucroPresumido: {
    Captura: 15,
    Coleta: 20,
    Conferencia: 45,
    Conciliacao: 35,
    Apuracao: 45,
    Aprovacao: 0,
    Entrega: 10,
  },
  ClinicaMedica: {
    Captura: 15,
    Coleta: 20,
    Conferencia: 50,
    Conciliacao: 35,
    Apuracao: 45,
    Aprovacao: 0,
    Entrega: 10,
  },
};

const REGIME_LABEL: Record<Regime, string> = {
  SimplesAnexoI: "Simples Nacional - Anexo I (comércio)",
  SimplesAnexoIII: "Simples Nacional - Anexo III (serviços)",
  SimplesAnexoV: "Simples Nacional - Anexo V (serviços)",
  LucroPresumido: "Lucro Presumido",
  ClinicaMedica: "Lucro Presumido - clínica médica",
};

const CLIENT_SEED: Array<[string, Regime, number]> = [
  ["Padaria Alvorada Ltda", "SimplesAnexoI", 8_500_000],
  ["Mercadinho Boa Compra ME", "SimplesAnexoI", 12_000_000],
  ["Papelaria Traço Fino ME", "SimplesAnexoI", 6_200_000],
  ["Estúdio Pixel Verde Ltda", "SimplesAnexoIII", 9_800_000],
  ["Academia Corpo em Foco ME", "SimplesAnexoIII", 14_500_000],
  ["Escola de Idiomas Horizonte Ltda", "SimplesAnexoIII", 18_000_000],
  ["Agência Voo Alto Ltda", "SimplesAnexoV", 11_000_000],
  ["Consultoria Norte Digital ME", "SimplesAnexoV", 7_300_000],
  ["Construtora Pedra Firme Ltda", "LucroPresumido", 85_000_000],
  ["Distribuidora Rio Claro Ltda", "LucroPresumido", 120_000_000],
  ["Transportes Serra Azul Ltda", "LucroPresumido", 64_000_000],
  ["Clínica Vida Plena Ltda", "ClinicaMedica", 95_000_000],
];

export function buildClients(): Client[] {
  return CLIENT_SEED.map(([name, regime, monthlyRevenueCents], i) => ({
    id: `c${String(i + 1).padStart(2, "0")}`,
    name,
    regime,
    regimeLabel: REGIME_LABEL[regime],
    monthlyRevenueCents,
    obligation: regime.startsWith("Simples") ? "PGDAS-D" : "DARF",
    startsAtTick: Math.floor(i * 1.5),
  }));
}

export interface FindingTemplate {
  agent: AgentId;
  phase: Phase;
  severity: Severity;
  regimes: Regime[] | "all";
  /** `{n}` is replaced by a document number, `{c}` by the client name. */
  message: string;
  reasoning: string;
  rule: string;
  source: string;
}

/** Findings the agents may raise. Legal references are real; scenarios are fictional. */
export const FINDING_TEMPLATES: FindingTemplate[] = [
  {
    agent: "Conferencia",
    phase: "Conferencia",
    severity: "alta",
    regimes: ["ClinicaMedica"],
    message:
      "NFS-e {n} de serviço médico para operadora privada sem IRRF retido (exceção de ambulatório); CSRF a confirmar, enviada para revisão",
    reasoning:
      "A tomadora é pessoa jurídica privada (operadora de plano de saúde), não órgão público: Lei 9.430/1996, art. 64 e IN RFB 1.234/2012 não se aplicam. Para IRRF de serviços profissionais vale o RIR/2018, art. 714, que exclui serviços de medicina prestados por ambulatório, então a ausência de IRRF na nota é esperada. A CSRF (PIS/Cofins/CSLL) privada segue a Lei 10.833/2003, art. 30 e a IN SRF 459/2004; o enquadramento do serviço depende da natureza da clínica e fica para decisão do contador.",
    rule: "Pagamento privado: IRRF de serviços profissionais (RIR/2018, art. 714) não é retido em serviços de medicina prestados por ambulatório; CSRF privada (PIS/Cofins/CSLL) só se o serviço se enquadrar no art. 30 da Lei 10.833/2003.",
    source: "RIR/2018 (Decreto 9.580/2018), art. 714; Lei 10.833/2003, art. 30; IN SRF 459/2004",
  },
  {
    agent: "Conferencia",
    phase: "Conferencia",
    severity: "media",
    regimes: ["SimplesAnexoI", "LucroPresumido"],
    message: "NF-e {n} com CFOP 5102 em operação com substituição tributária, enviada para revisão",
    reasoning:
      "O produto tem NCM sujeito a ST, mas a nota usa CFOP de venda sem ST. Isso pode inflar a receita tributável no PGDAS-D ou omitir o ICMS-ST.",
    rule: "CFOP deve refletir a operação: vendas de mercadoria com ICMS-ST usam o grupo 54xx.",
    source: "Ajuste SINIEF 07/2001 (tabela de CFOP)",
  },
  {
    agent: "Conferencia",
    phase: "Conferencia",
    severity: "baixa",
    regimes: ["SimplesAnexoIII", "SimplesAnexoV"],
    message: "NFS-e {n} com código de serviço divergente do cadastro, enviada para revisão",
    reasoning:
      "O item de serviço da nota não corresponde à atividade cadastrada. A atividade define o anexo do Simples (III ou V), então o erro muda a alíquota.",
    rule: "A atividade prestada determina o anexo do Simples Nacional; o Fator r pode migrar o Anexo V para o III.",
    source: "LC 123/2006, art. 18, §§ 5º-J a 5º-M; Resolução CGSN 140/2018",
  },
  {
    agent: "Conciliacao",
    phase: "Conciliacao",
    severity: "media",
    regimes: "all",
    message: "Crédito no extrato sem nota correspondente, enviado para revisão",
    reasoning:
      "Existe um recebimento no extrato sem NFS-e ou NF-e que o explique. Pode ser receita sem nota (omissão) ou transferência entre contas do próprio cliente.",
    rule: "Receita recebida deve ter documento fiscal; valor sem lastro precisa de justificativa do cliente antes da apuração.",
    source: "LC 123/2006, art. 26 (omissão de receita); Lei 9.430/1996, art. 42",
  },
  {
    agent: "Conciliacao",
    phase: "Conciliacao",
    severity: "baixa",
    regimes: "all",
    message: "Nota {n} sem baixa no extrato (possível recebimento futuro), enviada para revisão",
    reasoning:
      "A nota foi emitida na competência, mas o pagamento não apareceu no extrato. Pode ser venda a prazo; o agente não assume, pede confirmação.",
    rule: "Regime de competência x caixa: a receita da nota entra na competência da emissão mesmo sem recebimento no Simples (regime de competência opcional) e no Presumido.",
    source: "Resolução CGSN 140/2018, art. 4º",
  },
  {
    agent: "Apuracao",
    phase: "Apuracao",
    severity: "media",
    regimes: ["SimplesAnexoI", "SimplesAnexoIII", "SimplesAnexoV"],
    message: "RBT12 próxima do sublimite, alíquota efetiva exige conferência",
    reasoning:
      "A receita bruta dos últimos 12 meses está a menos de 10% do sublimite estadual. Ao ultrapassar, ICMS/ISS passam a ser recolhidos fora do DAS.",
    rule: "Ao exceder o sublimite, ICMS e ISS são recolhidos separadamente a partir do mês seguinte.",
    source: "LC 123/2006, art. 19 e art. 20",
  },
  {
    agent: "Apuracao",
    phase: "Apuracao",
    severity: "alta",
    regimes: ["LucroPresumido", "ClinicaMedica"],
    message: "Retenções na fonte somam valor maior que o IRPJ apurado, enviado para revisão",
    reasoning:
      "O IRRF retido nas notas supera o IRPJ devido no trimestre. O saldo vira crédito a compensar, e isso precisa de decisão do contador.",
    rule: "IRRF retido pode ser deduzido do IRPJ devido; o excedente é compensado via PER/DCOMP.",
    source: "Lei 9.430/1996, art. 6º e art. 74",
  },
];
