export type DecisionResult = { ok: true } | { ok: false; status: number; message: string };

const MESSAGES: Record<number, string> = {
  401: "Informe o token do contador para decidir.",
  403: "Token do contador inválido ou não configurado.",
  404: "Cliente ou base do mês não encontrados.",
  409: "Este cliente não está mais esperando aprovação.",
  503: "Base ocupada, tente de novo.",
};

/** Sends the decision to the store; resolves `ok` only when the server confirmed it. */
export async function postDecision(
  clientId: string,
  decision: "approved" | "sent_back",
  token: string,
  doFetch: typeof fetch = fetch,
): Promise<DecisionResult> {
  try {
    const res = await doFetch("/api/decision", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ clientId, decision }),
    });
    if (res.ok) return { ok: true };
    return {
      ok: false,
      status: res.status,
      message: MESSAGES[res.status] ?? `Não foi possível gravar a decisão (erro ${res.status}).`,
    };
  } catch {
    return { ok: false, status: 0, message: "Sem conexão: a decisão não foi gravada." };
  }
}
