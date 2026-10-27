import type { MissingDoc } from "./client";

const brl = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const day = (iso: string) => iso.split("-").reverse().join("/");

/** WhatsApp-style request in pt-BR listing what is missing. Only a draft: nothing here sends it. */
export function draftCollectionMessage(
  clientName: string,
  month: string,
  missing: MissingDoc[],
): string {
  const [y, m] = month.split("-");
  const lines = missing.map(
    (d) => `• ${day(d.date)} - ${d.counterpart} - ${brl(d.amountCentavos)} (doc. ${d.ref})`,
  );
  return [
    `Olá, ${clientName}! Tudo bem? 😊`,
    `Para fechar a competência ${m}/${y} está faltando o arquivo (XML) de ${
      missing.length === 1 ? "1 nota" : `${missing.length} notas`
    } que aparece${missing.length === 1 ? "" : "m"} na sua contabilidade:`,
    ...lines,
    "Consegue enviar por aqui? Se alguma não existir, me avisa. Obrigado!",
  ].join("\n");
}
