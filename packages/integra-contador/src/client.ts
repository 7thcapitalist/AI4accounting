// Serpro Integra Contador HTTP client. Official docs:
// https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/
// Only the demonstration (trial) environment is supported until task 5.2 (production needs a contract and an e-CNPJ).

export const TRIAL_BASE_URL = "https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1";

/** The five operation paths of the API. Each service in the official catalog belongs to exactly one. */
export type Operation = "Apoiar" | "Consultar" | "Declarar" | "Emitir" | "Monitorar";

export interface Mensagem {
  codigo: string;
  texto: string;
}

export interface IntegraResponse<T = unknown> {
  status: number;
  mensagens: Mensagem[];
  /** The API returns `dados` as a JSON string; it is parsed here. Empty string becomes null. */
  dados: T | null;
  responseId?: string;
}

export interface IntegraConfig {
  /** Bearer token. In the trial environment no e-CNPJ is needed. */
  accessToken: string;
  jwtToken: string;
  /** CNPJ/CPF of whoever contracted the API (the accounting firm). Digits only. */
  contratante: string;
  /** CNPJ/CPF of whoever requests the data (the procurador). Digits only. */
  autorPedidoDados: string;
  baseUrl?: string;
  /** Injected so CI never touches the network. */
  fetch?: typeof fetch;
}

export class IntegraContadorError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
    readonly mensagens: Mensagem[] = [],
  ) {
    super(message);
    this.name = "IntegraContadorError";
  }
}

const digits = (value: string) => value.replace(/\D/g, "");

/** Normalizes a CPF/CNPJ to digits and rejects anything that is not 11 (CPF) or 14 (CNPJ) digits. */
export function normalizeDocument(value: string): string {
  const numero = digits(value);
  if (numero.length !== 11 && numero.length !== 14) {
    throw new IntegraContadorError("CPF/CNPJ must have 11 or 14 digits", 0);
  }
  return numero;
}

const party = (value: string) => {
  const numero = normalizeDocument(value);
  return { numero, tipo: numero.length === 11 ? 1 : 2 };
};

/**
 * Reads credentials from env (see .env.example). Throws if any is missing; values are never logged.
 */
export function configFromEnv(
  env: Record<string, string | undefined> = process.env,
): IntegraConfig {
  const need = (name: string) => {
    const value = env[name];
    if (!value) throw new IntegraContadorError(`Missing env var ${name}`, 0);
    return value;
  };
  const token = need("INTEGRA_CONTADOR_TRIAL_TOKEN");
  return {
    accessToken: token,
    jwtToken: token,
    contratante: need("INTEGRA_CONTADOR_CONTRATANTE"),
    autorPedidoDados: need("INTEGRA_CONTADOR_AUTOR_PEDIDO_DADOS"),
    baseUrl: env.INTEGRA_CONTADOR_BASE_URL,
  };
}

/** Accepts only the official trial endpoint over HTTPS (no userinfo, port, query or hash). */
function assertTrialBaseUrl(raw: string): string {
  const refuse = () =>
    new IntegraContadorError(
      "Only the official Serpro demonstration endpoint is allowed (production is task 5.2)",
      0,
    );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw refuse();
  }
  const official = new URL(TRIAL_BASE_URL);
  const path = url.pathname.replace(/\/$/, "");
  if (
    url.protocol !== "https:" ||
    url.host !== official.host ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    path !== official.pathname
  ) {
    throw refuse();
  }
  return TRIAL_BASE_URL;
}

export class IntegraContadorClient {
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;
  /** Token returned by AUTENTICAPROCURADOR, sent on later calls so they run under the procuração. */
  private procuradorToken: string | undefined;

  constructor(private readonly config: IntegraConfig) {
    this.baseUrl = assertTrialBaseUrl(config.baseUrl ?? TRIAL_BASE_URL);
    this.doFetch = config.fetch ?? fetch;
  }

  setProcuradorToken(token: string | undefined) {
    this.procuradorToken = token;
  }

  async call<T = unknown>(
    operation: Operation,
    contribuinte: string,
    idSistema: string,
    idServico: string,
    versaoSistema: string,
    dados: object | string = "",
  ): Promise<IntegraResponse<T>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.accessToken}`,
      jwt_token: this.config.jwtToken,
      "Content-Type": "application/json",
    };
    if (this.procuradorToken) headers.autenticar_procurador_token = this.procuradorToken;

    const res = await this.doFetch(`${this.baseUrl}/${operation}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contratante: party(this.config.contratante),
        autorPedidoDados: party(this.config.autorPedidoDados),
        contribuinte: party(contribuinte),
        pedidoDados: {
          idSistema,
          idServico,
          versaoSistema,
          dados: typeof dados === "string" ? dados : JSON.stringify(dados),
        },
      }),
    });

    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      throw new IntegraContadorError("Non-JSON response from Integra Contador", res.status);
    }
    const mensagens = (body.mensagens as Mensagem[] | undefined) ?? [];
    if (!res.ok) {
      throw new IntegraContadorError(
        mensagens[0]?.texto ?? `Integra Contador HTTP ${res.status}`,
        res.status,
        mensagens,
      );
    }
    if (idServico === "ENVIOXMLASSINADO81") {
      this.procuradorToken = res.headers.get("etag")?.replace(/"/g, "") ?? this.procuradorToken;
    }
    const raw = body.dados;
    return {
      status: (body.status as number | undefined) ?? res.status,
      mensagens,
      dados: typeof raw === "string" && raw !== "" ? (JSON.parse(raw) as T) : null,
      responseId: body.responseId as string | undefined,
    };
  }
}
