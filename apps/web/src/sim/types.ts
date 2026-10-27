/** Simulation domain types. All data is fictional; money is integer centavos. */

export const PHASES = [
  "Captura",
  "Coleta",
  "Conferencia",
  "Conciliacao",
  "Apuracao",
  "Aprovacao",
  "Entrega",
] as const;
export type Phase = (typeof PHASES)[number];

export const AGENT_IDS = [
  "Coordenador",
  "Captura",
  "Coleta",
  "Conferencia",
  "Conciliacao",
  "Apuracao",
  "Entrega",
] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export interface Agent {
  id: AgentId;
  name: string;
  role: string;
  /** Hex color for the UI. */
  color: string;
  /** Icon name (lucide-style); the UI maps it to a component. */
  icon: string;
}

export type Regime =
  | "SimplesAnexoI"
  | "SimplesAnexoIII"
  | "SimplesAnexoV"
  | "LucroPresumido"
  | "ClinicaMedica";

export interface Client {
  id: string;
  /** Fictional company name. */
  name: string;
  regime: Regime;
  /** Human label of the regime, pt-BR. */
  regimeLabel: string;
  /** Monthly revenue in centavos. */
  monthlyRevenueCents: number;
  /** Gross revenue of the last 12 months in centavos, when known (otherwise 12x the month). */
  rbt12Cents?: number;
  /** Tax obligation produced by the closing. */
  obligation: "PGDAS-D" | "IRPJ/CSLL";
  /** Tick at which the closing starts for this client (staggered). */
  startsAtTick: number;
}

export type DocumentKind = "NFS-e" | "NF-e" | "Extrato" | "Folha" | "Guia";

export interface Document {
  id: string;
  clientId: string;
  kind: DocumentKind;
  /** Fictional document number. */
  number: string;
  amountCents: number;
}

export type Severity = "baixa" | "media" | "alta";

export interface Finding {
  id: string;
  clientId: string;
  /** Agent that raised it. */
  agent: AgentId;
  phase: Phase;
  severity: Severity;
  /** One-line summary, pt-BR. */
  message: string;
  /** Why the agent flagged it, pt-BR. */
  reasoning: string;
  /** Rule applied, pt-BR. */
  rule: string;
  /** Official source (fictional scenario, real legal reference). */
  source: string;
  /** What the accountant should do about it, pt-BR. */
  action: string;
  status: "open" | "resolved";
  resolution?: "approved" | "returned";
}

export type FeedEventKind = "info" | "finding" | "approval" | "return" | "delivery";

export interface FeedEvent {
  id: number;
  tick: number;
  agent: AgentId;
  clientId: string | null;
  phase: Phase | null;
  kind: FeedEventKind;
  /** pt-BR text. */
  text: string;
}

export type ClientStatus = "waiting" | "working" | "awaiting_approval" | "blocked" | "done";

export interface ClientProgress {
  clientId: string;
  phase: Phase;
  status: ClientStatus;
  /** Ticks left to complete the current phase. */
  ticksLeft: number;
  /** True after the accountant returned it once; no new findings are raised. */
  reworked: boolean;
  /** Minutes of manual work avoided so far. */
  savedMinutes: number;
  /** Fictional delivery protocol, set on Entrega. */
  protocol?: string;
}

export interface AgentCounters {
  actions: number;
  findings: number;
  returned: number;
}

export interface SimState {
  seed: number;
  /** PRNG state (mulberry32). */
  rng: number;
  tick: number;
  /** Competence being closed, "YYYY-MM". */
  competence: string;
  clients: Client[];
  documents: Document[];
  progress: ClientProgress[];
  findings: Finding[];
  feed: FeedEvent[];
  counters: Record<AgentId, AgentCounters>;
  nextEventId: number;
  nextFindingId: number;
}

export interface Kpis {
  totalClients: number;
  closedClients: number;
  openExceptions: number;
  hoursSaved: number;
  /** Days left until the nearest due date among the open clients (can be negative). */
  daysToDeadline: number;
  /** Summary label, e.g. "PGDAS-D vence dia 20 · IRPJ/CSLL vence dia 30". */
  deadlineLabel: string;
  /** One deadline per obligation present in the portfolio. */
  deadlines: ObligationDeadline[];
}

export interface ObligationDeadline {
  obligation: Client["obligation"];
  /** Due day of the month after the competence. */
  dueDay: number;
  daysLeft: number;
  /** Clients with this obligation. */
  clients: number;
  /** Clients with this obligation already delivered. */
  closed: number;
  label: string;
}

export interface QueueItem {
  client: Client;
  findings: Finding[];
  /** "approval": the agents finished and wait for sign-off; "exception": blocked with open findings. */
  kind: "approval" | "exception";
}

export interface AgentStats extends AgentCounters {
  agent: Agent;
  /** Clients currently in this agent's phase. */
  activeClients: number;
  /** Names of the clients the agent is working on right now. */
  currentClients: string[];
  /** Minutes of manual work this agent avoided so far. */
  savedMinutes: number;
  /** Actions per simulated day (never divides by less than one day). */
  perDay: number;
}
