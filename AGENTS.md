# AGENTS.md

Rules for every AI agent and human working in this repo. Read this file and `docs/CONTEXT.md` before doing anything. `CLAUDE.md` imports this file, so there is one source of truth.

## Team model

Three founders, each running several agents in parallel. That means many writers at once, so the rules below exist to prevent two things: agents overwriting each other, and unreviewed code reaching `main`.

Every agent works on behalf of exactly one human, its **owner**. The owner is accountable for what the agent ships.

## The golden rules

1. **Never push to `main`.** All changes land through a pull request.
2. **One task = one issue = one branch = one PR.** Do not mix unrelated changes.
3. **Claim before you code.** No issue assigned to your owner, no work.
4. **One agent per branch.** Never commit to a branch another agent or human is working on.
5. **Independent review before merge.** A PR is reviewed and merged by an independent reviewer agent (or a human), never by the agent that wrote it.
6. **Stay in scope.** Touch only what the issue requires. If you find something else broken, open a new issue instead of fixing it in place.
7. **Never commit secrets or real client data.** See "Data and secrets" below.

## Workflow

### 1. Claim

- Work starts from a GitHub issue. If none exists, create one with a clear goal and acceptance criteria.
- Assign the issue to your owner and add the `in-progress` label. An assigned issue is a lock: do not start work on an issue assigned to someone else.
- Before starting, check open PRs and branches for overlapping work. If there is overlap, stop and tell your owner.

### 2. Branch

Branch from the latest `main`:

```
<owner>/<issue-number>-<short-slug>
```

Example: `joao/12-xml-import-parser`. `<owner>` is the human's short name, even when an agent does the work.

When running several agents on one machine, give each its own git worktree so they do not share a working directory:

```
git worktree add ../AI4accounting-12 -b joao/12-xml-import-parser origin/main
```

### 3. Work

- Open a **draft PR** after the first commit so everyone can see the work exists.
- Keep PRs small: aim for under ~400 changed lines. Split larger work into stacked issues.
- Commit in small logical steps using Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Keep the branch current with `git fetch && git rebase origin/main` (or merge `main` in). Never force-push a branch someone else has checked out.
- If you hit a merge conflict in a file you did not need to touch, stop and ask your owner. Do not resolve conflicts by discarding the other side.

### 4. Pull request

- Fill in the PR template. Link the issue with `Closes #<n>`.
- Lint, typecheck, tests and build must pass before marking the PR ready.
- State plainly what you did not test and what you are unsure about. Do not claim something works unless you ran it.
- Mark the PR ready and hand it to an independent reviewer agent.

### 5. Merge

The reviewer is an **independent reviewer agent**: a fresh session that did not write any of the code and has not seen the author agent's conversation. It reads only the issue, the diff and the repo.

The reviewer agent:

- Checks the diff against the issue's acceptance criteria, these rules and `docs/CONTEXT.md`.
- Runs lint, typecheck, tests and build itself. It does not trust the PR description.
- Looks specifically for: out-of-scope changes, secrets or real client data, weakened tests, unsourced tax rules, and conflicts with other open PRs.
- Leaves a review comment stating what it checked and what it ran.
- If everything passes and CI is green: approves and **squash merges**, then deletes the branch.
- If not: requests changes and sends it back. It does not fix the PR itself, since that would make it an author.

**Human approval is still required** for PRs that touch: `AGENTS.md`, `CLAUDE.md`, `docs/CONTEXT.md`, `docs/decisions/`, CI workflows, auth or permissions, database migrations, anything handling secrets or credentials, and anything that sends data to third parties or government portals. The reviewer agent reviews these and then leaves them for a human to merge.

## Shared files (high conflict risk)

These files are touched by many tasks. Change them only in a dedicated, small PR, and merge it fast:

- `package.json` and lockfile (new dependencies need a line of justification in the PR)
- Database schema and migrations (one migration PR open at a time; announce it in the issue)
- Root config: `tsconfig`, lint, CI workflows, `vercel.json`, env var definitions
- `AGENTS.md`, `CLAUDE.md`, `docs/CONTEXT.md`

Never rewrite or reformat files outside your task. No drive-by refactors.

## Decisions

Anything that affects more than one task (architecture, a new dependency of substance, data model, product scope) is written up as a short record in `docs/decisions/NNNN-title.md` and merged through a PR. Agents propose; humans decide. If a decision is not written there, it is not decided.

## Data and secrets

We handle accounting data: invoices, payroll, CNPJ/CPF, bank statements, digital certificates. Treat it as highly sensitive (LGPD applies).

- No real client data in the repo, in issues, in PRs, in test fixtures or in logs. Use synthetic or anonymized fixtures only.
- No secrets in code or commits. Use `.env.local` (gitignored) and Vercel environment variables. Document new variables in `.env.example` with placeholder values.
- Never commit digital certificates (`.pfx`, `.p12`) or government portal credentials.
- If a secret is committed by mistake, tell your owner immediately so it can be rotated. Removing the commit is not enough.

## Stack and conventions

- TypeScript (strict), Next.js App Router, deployed on Vercel. Each PR gets a Vercel preview deployment.
- Package manager: pnpm.
- Code, comments, commits, issues and PRs in English. Keep Brazilian accounting terms in Portuguese (DAS, SPED, CFOP, NF-e, eSocial); do not translate them.
- User-facing product copy is Brazilian Portuguese.
- Tax and accounting rules are never guessed. Cite the official source (Receita Federal, Portal do Simples Nacional, SPED, eSocial, SEFAZ) in a comment or in the PR, and cover the rule with a test.
- Money is stored as integer centavos, never floats.

## What agents must not do

- Push to `main`, change branch protection, or approve or merge a PR they authored. Only an independent reviewer agent following the Merge section may approve and merge.
- Force-push shared branches, rewrite history on `main`, or delete branches they do not own.
- Deploy to production, change production environment variables, or run migrations against production.
- Send anything to third parties (emails, WhatsApp, government portals) outside a sandbox.
- Skip, disable or weaken tests, lint rules or CI checks to get a PR green.

When unsure, stop and ask your owner.
