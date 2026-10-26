import { describe, expect, it } from "vitest";
import { configFromEnv, IntegraContadorClient, IntegraContadorError } from "./client";
import caixa from "./fixtures/caixapostal-indicador63.json";
import noProc from "./fixtures/error-no-procuracao.json";
import consDecl from "./fixtures/pgdasd-consdeclaracao13.json";
import gerarDasFx from "./fixtures/pgdasd-gerardas12.json";
import sitfisFx from "./fixtures/sitfis-protocolo91.json";
import {
  consultarDeclaracoes,
  emitirRelatorioSitfis,
  gerarDas,
  indicadorNovasMensagens,
  obterProcuracao,
  solicitarProtocoloSitfis,
} from "./services";

// Synthetic CNPJs with valid check digits; never real companies.
const CNPJ = "11222333000181";
const FIRM = "11444777000161";

interface Body {
  contribuinte: { numero: string; tipo: number };
  pedidoDados: { idSistema: string; idServico: string; dados: string };
}

function setup(body: unknown, status = 200, headers: Record<string, string> = {}) {
  const calls: { url: string; headers: Record<string, string>; body: Body }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string),
    });
    return new Response(JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
  const client = new IntegraContadorClient({
    accessToken: "token-placeholder",
    jwtToken: "jwt-placeholder",
    contratante: FIRM,
    autorPedidoDados: FIRM,
    fetch: fakeFetch,
  });
  return { client, calls };
}

describe("IntegraContadorClient", () => {
  it("builds the envelope with typed parties and stringified dados", async () => {
    const { client, calls } = setup(consDecl);
    const res = await consultarDeclaracoes(client, CNPJ, { periodo: "202501" });
    const call = calls[0];
    if (!call) throw new Error("no call");
    expect(call.url).toBe(
      "https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1/Consultar",
    );
    expect(call.headers.Authorization).toBe("Bearer token-placeholder");
    expect(call.body.contribuinte).toEqual({ numero: CNPJ, tipo: 2 });
    expect(call.body.pedidoDados).toMatchObject({
      idSistema: "PGDASD",
      idServico: "CONSDECLARACAO13",
    });
    expect(JSON.parse(call.body.pedidoDados.dados)).toEqual({ periodoApuracao: "202501" });
    expect(res.dados).toMatchObject({ anoCalendario: 2025 });
  });

  it("generates DAS via Emitir with optional consolidation date", async () => {
    const { client, calls } = setup(gerarDasFx);
    await gerarDas(client, CNPJ, "202501", "20250228");
    expect(calls[0]?.url.endsWith("/Emitir")).toBe(true);
    expect(JSON.parse(calls[0]?.body.pedidoDados.dados ?? "")).toEqual({
      periodoApuracao: "202501",
      dataConsolidacao: "20250228",
    });
  });

  it("runs SITFIS in two steps", async () => {
    const { client, calls } = setup(sitfisFx);
    const res = await solicitarProtocoloSitfis(client, CNPJ);
    await emitirRelatorioSitfis(
      client,
      CNPJ,
      (res.dados as { protocoloRelatorio: string }).protocoloRelatorio,
    );
    expect(calls.map((c) => c.body.pedidoDados.idServico)).toEqual([
      "SOLICITARPROTOCOLO91",
      "RELATORIOSITFIS92",
    ]);
    expect(JSON.parse(calls[1]?.body.pedidoDados.dados ?? "")).toEqual({
      protocoloRelatorio: "SYNTHETIC-PROTOCOL",
    });
  });

  it("monitors the caixa postal with empty dados", async () => {
    const { client, calls } = setup(caixa);
    const res = await indicadorNovasMensagens(client, CNPJ);
    expect(calls[0]?.url.endsWith("/Monitorar")).toBe(true);
    expect(calls[0]?.body.pedidoDados.dados).toBe("");
    expect(res.dados).toEqual({ indicadorMensagensNovas: 1 });
  });

  it("types CPF parties as 1 in PROCURACOES", async () => {
    const { client, calls } = setup({ status: 200, mensagens: [], dados: "" });
    const res = await obterProcuracao(client, "52998224725", FIRM);
    expect(calls[0]?.body.contribuinte.tipo).toBe(1);
    expect(JSON.parse(calls[0]?.body.pedidoDados.dados ?? "").tipoOutorgado).toBe("2");
    expect(res.dados).toBeNull();
  });

  it("forwards the procurador token on later calls", async () => {
    const { client, calls } = setup(caixa);
    client.setProcuradorToken("proc-token");
    await indicadorNovasMensagens(client, CNPJ);
    expect(calls[0]?.headers.autenticar_procurador_token).toBe("proc-token");
  });

  it("raises a typed error with the API message", async () => {
    const { client } = setup(noProc, 403);
    await expect(indicadorNovasMensagens(client, CNPJ)).rejects.toMatchObject({
      name: "IntegraContadorError",
      httpStatus: 403,
      message: "Sem procuração para o contribuinte.",
    });
  });

  it("refuses non-trial base URLs", () => {
    expect(
      () =>
        new IntegraContadorClient({
          accessToken: "a",
          jwtToken: "b",
          contratante: FIRM,
          autorPedidoDados: FIRM,
          baseUrl: "https://gateway.apiserpro.serpro.gov.br/integra-contador/v1",
        }),
    ).toThrow(IntegraContadorError);
  });

  it("reads credentials only from env and fails when missing", () => {
    expect(() => configFromEnv({})).toThrow(/INTEGRA_CONTADOR_TRIAL_TOKEN/);
    const cfg = configFromEnv({
      INTEGRA_CONTADOR_TRIAL_TOKEN: "t",
      INTEGRA_CONTADOR_CONTRATANTE: FIRM,
      INTEGRA_CONTADOR_AUTOR_PEDIDO_DADOS: FIRM,
    });
    expect(cfg.contratante).toBe(FIRM);
  });
});
