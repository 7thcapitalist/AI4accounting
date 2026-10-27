import type { Centavos } from "@ai4a/fiscal-core";
import { SIMPLES_CEILING } from "@ai4a/fiscal-core";
import type { Comparison, CrossingProjection, FatorRResult, RbtConsequence } from "./engine";

export function brl(c: Centavos): string {
  const neg = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg}R$ ${reais},${String(abs % 100).padStart(2, "0")}`;
}

const monthName = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;

const WHAT_NEXT: Record<RbtConsequence, string> = {
  next_year: "excesso de ate 20%: em regra a exclusao vale a partir do ano seguinte",
  from_excess_month:
    "excesso acima de 20%: em regra a exclusao vale a partir do mes seguinte ao excesso",
};

/** pt-BR flag for the accountant. A flag, not a legal conclusion: the accountant confirms. */
export function ceilingText(
  month: string,
  rbt12: Centavos,
  p: CrossingProjection,
  cons: RbtConsequence,
): string {
  if (p.alreadyAbove) {
    return `RBT12 de ${brl(rbt12)} em ${monthName(month)} ja esta acima do teto do Simples (${brl(SIMPLES_CEILING)}). Verificar com o contador a exclusao do regime.`;
  }
  return `Mantido o ritmo dos ultimos meses, o RBT12 passa do teto do Simples (${brl(SIMPLES_CEILING)}) em ${monthName(p.month ?? month)}, chegando a ${brl(p.atEnd)} ao fim de 12 meses (${WHAT_NEXT[cons]}). Sinalizacao para o contador, nao conclusao juridica.`;
}

export function sublimitText(
  p: CrossingProjection,
  sublimit: Centavos,
  cons: RbtConsequence,
): string {
  const when = p.alreadyAbove
    ? "a receita acumulada no ano ja passou"
    : `a receita acumulada no ano passa, em ${monthName(p.month ?? "")}, `;
  return `${p.alreadyAbove ? "Atencao: " : ""}${when} do sublimite de ICMS/ISS (${brl(sublimit)}), chegando a ${brl(p.atEnd)} ate dezembro (${WHAT_NEXT[cons]}). ICMS/ISS passam a ser recolhidos fora do DAS conforme o caso; confirmar com o contador.`;
}

export function fatorRText(fr: FatorRResult, rbt12: Centavos, payroll12: Centavos): string {
  if (fr.annex === "V") {
    return `Fator R de ${fr.ratioPct.toFixed(2).replace(".", ",")}% (folha 12m ${brl(payroll12)} / RBT12 ${brl(rbt12)}): abaixo de 28%, tributacao pelo Anexo V. Para voltar ao Anexo III a folha dos 12 meses precisa de ${brl(fr.payrollNeeded)} (faltam ${brl(fr.payrollGap)}).`;
  }
  return `Fator R de ${fr.ratioPct.toFixed(2).replace(".", ",")}% (folha 12m ${brl(payroll12)} / RBT12 ${brl(rbt12)}): perto do minimo de 28%. Para manter o Anexo III a folha dos 12 meses deve ser de pelo menos ${brl(fr.payrollNeeded)}.`;
}

export function comparisonText(
  current: "simples" | "presumido",
  rbt12: Centavos,
  c: Comparison,
): string {
  const cheaper =
    c.simplesAdvantage > 0 ? "Simples" : c.simplesAdvantage < 0 ? "Lucro Presumido" : "empate";
  return `Comparacao anual sobre receita de ${brl(rbt12)}: Simples (Anexo ${c.simples.annex}) ${brl(c.simples.total)} x Lucro Presumido ${brl(c.presumido.total)} (PIS ${brl(c.presumido.pis ?? 0)}, COFINS ${brl(c.presumido.cofins ?? 0)}, ISS ${brl(c.presumido.iss ?? 0)}, IRPJ ${brl(c.presumido.irpj ?? 0)}, CSLL ${brl(c.presumido.csll ?? 0)}). Mais barato: ${cheaper}, diferenca de ${brl(Math.abs(c.simplesAdvantage))}. Regime atual: ${current === "simples" ? "Simples" : "Lucro Presumido"}. Nao inclui INSS patronal do Presumido (no Simples ja esta no DAS); o contador soma a partir da folha.`;
}
