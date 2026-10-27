# @ai4/integra-contador

Cliente do Serpro Integra Contador, só ambiente de demonstração (trial). Produção é a tarefa 5.2.

## Escopo e segurança
- `baseUrl` aceita apenas `https://gateway.apiserpro.serpro.gov.br/integra-contador-trial/v1`; qualquer outro host é rejeitado.
- CPF/CNPJ são normalizados e validados (11 ou 14 dígitos).
- Serviços cobertos: AUTENTICAPROCURADOR, PGDAS-D, DCTFWeb, SICALC, SITFIS, CAIXAPOSTAL, PROCURACOES.
- Os testes usam fixtures gravadas/sintéticas (`src/fixtures`); nenhuma chamada real é feita em `pnpm test`.

## Como rodar contra o trial (quando houver credencial)
A execução real contra o trial fica para a 5.2, porque exige credenciais do Serpro.

1. Defina no ambiente (nunca commite): `INTEGRA_CONTADOR_TRIAL_TOKEN`, `INTEGRA_CONTADOR_CONTRATANTE`, `INTEGRA_CONTADOR_AUTOR_PEDIDO_DADOS`. `INTEGRA_CONTADOR_BASE_URL` é opcional e só aceita o endpoint trial.
2. Crie o cliente com `new IntegraContadorClient(configFromEnv())` e chame cada função de `src/services.ts` com um CNPJ/CPF de teste do trial.
3. Registre só o resultado sanitizado (status HTTP e `idServico`), sem token, certificado ou dado real.
