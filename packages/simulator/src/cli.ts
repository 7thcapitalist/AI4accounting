// pnpm --filter @ai4a/simulator sim --seed 7 --out ./sim-out
// Writes <out>/<company>/<competencia>/{*.xml, extrato.ofx, razao.csv, esperado.json} and <out>/carteira.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { toLedgerCsv, toOfx } from "./files";
import { generatePortfolio } from "./portfolio";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const seed = Number(arg("seed", "1"));
const out = resolve(arg("out", "sim-out"));

const portfolio = generatePortfolio(seed);
const carteira = [];
for (const { company, months } of portfolio.companies) {
  for (const m of months) {
    const dir = join(out, `${company.id}-${company.cnpj}`, m.competencia);
    mkdirSync(dir, { recursive: true });
    for (const d of m.documents) writeFileSync(join(dir, d.file), d.xml);
    writeFileSync(join(dir, "extrato.ofx"), toOfx(company, m));
    writeFileSync(join(dir, "razao.csv"), toLedgerCsv(m));
    writeFileSync(join(dir, "esperado.json"), `${JSON.stringify(m.expected, null, 2)}\n`);
  }
  carteira.push({
    id: company.id,
    name: company.name,
    cnpj: company.cnpj,
    profile: company.profile.key,
    label: company.profile.label,
  });
}
writeFileSync(
  join(out, "carteira.json"),
  `${JSON.stringify({ seed, companies: carteira }, null, 2)}\n`,
);
console.log(
  `seed ${seed}: ${carteira.length} empresas x ${portfolio.companies[0]?.months.length ?? 0} meses em ${out}`,
);
