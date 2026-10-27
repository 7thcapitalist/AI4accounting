import type { Agent, AgentId, Client, Phase } from "../sim";
import { AGENTS, TICKS_PER_DAY } from "../sim";

export const PHASE_LABEL: Record<Phase, string> = {
  Captura: "Captura",
  Coleta: "Coleta",
  Conferencia: "Conferência",
  Conciliacao: "Conciliação",
  Apuracao: "Apuração",
  Aprovacao: "Aprovação",
  Entrega: "Entrega",
};

export const AGENT_LABEL: Record<AgentId, string> = {
  Coordenador: "Coordenador",
  Captura: "Captura",
  Coleta: "Coleta",
  Conferencia: "Conferência",
  Conciliacao: "Conciliação",
  Apuracao: "Apuração",
  Entrega: "Entrega",
};

export function agentOf(id: AgentId): Agent {
  return AGENTS.find((a) => a.id === id) ?? (AGENTS[0] as Agent);
}

/** "dia 3, 14h": simulated day of the month after the competence, 6 ticks per working day. */
export function when(tick: number): string {
  const day = 1 + Math.floor(tick / TICKS_PER_DAY);
  const hour = 8 + (tick % TICKS_PER_DAY) * 2;
  return `dia ${day}, ${hour}h`;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
/** "2026-09" -> "setembro/2026" */
export function monthLabel(competence: string): string {
  const [y, m] = competence.split("-");
  return `${MESES[Number(m) - 1] ?? m}/${y}`;
}

export function money(cents: number): string {
  return BRL.format(cents / 100);
}

export function isPresumido(c: Client): boolean {
  return c.obligation === "IRPJ/CSLL";
}

/** Engine texts start with the raw agent id ("Conferencia: ..."); show them with accents. */
export function feedText(text: string): string {
  const i = text.indexOf(": ");
  return i > 0 ? text.slice(i + 2) : text;
}
