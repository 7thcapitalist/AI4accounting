const brl = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** pt-BR delivery message for the client. Only a draft: nothing here sends it. */
export function draftDeliveryMessage(
  clientName: string,
  month: string,
  das: { numeroDas: string; amountCentavos: number },
): string {
  const [y, m] = month.split("-");
  return [
    `Olá, ${clientName}! Tudo bem? 😊`,
    `O fechamento da competência ${m}/${y} está pronto.`,
    `Segue a guia do DAS (Simples Nacional) no valor de ${brl(das.amountCentavos)}, número ${das.numeroDas}. O vencimento consta na própria guia.`,
    "Qualquer dúvida é só me chamar. Obrigado!",
  ].join("\n");
}
