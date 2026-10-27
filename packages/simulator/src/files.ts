import type { BankLine, Company, LedgerLine, SimMonth } from "./month";
import { reais } from "./xml";

/** OFX 1.02 (SGML) bank statement, the format Brazilian banks export. */
export function toOfx(company: Company, m: SimMonth): string {
  const d = (date: string) => date.replace(/-/g, "");
  const lines = m.bank
    .map(
      (b: BankLine) =>
        `<STMTTRN><TRNTYPE>${b.valor >= 0 ? "CREDIT" : "DEBIT"}<DTPOSTED>${d(b.date)}<TRNAMT>${reais(b.valor)}<FITID>${b.fitid}<MEMO>${b.memo}</STMTTRN>`,
    )
    .join("\n");
  const first = `${m.competencia}-01`;
  const last = m.bank.at(-1)?.date ?? first;
  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:UTF-8
CHARSET:NONE
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>999<ACCTID>${company.cnpj.slice(0, 8)}<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>${d(first)}<DTEND>${d(last)}
${lines}
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
`;
}

/** ERP ledger export (CSV, ";" separated, amounts with "." decimals), one line per document. */
export function toLedgerCsv(m: SimMonth): string {
  const rows = m.ledger.map((l: LedgerLine) =>
    [l.date, l.account, l.ref, l.counterpart, reais(l.valor)].join(";"),
  );
  return ["data;conta;documento;contraparte;valor", ...rows].join("\n") + "\n";
}
