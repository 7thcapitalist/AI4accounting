import { execFile } from "node:child_process";

/**
 * The only way agent code calls a model (ADR 0008). Output is prose for the accountant, never the
 * source of a tax number. Prompts must not carry client data: pass rule ids and rule text only.
 */
export interface LlmProvider {
  readonly name: string;
  complete(prompt: string): Promise<string>;
}

/** Deterministic provider for tests and CI: answers from a function, records every prompt. */
export class FakeLlm implements LlmProvider {
  readonly name = "fake";
  readonly prompts: string[] = [];

  constructor(private reply: (prompt: string) => string = () => "Explicacao de teste.") {}

  async complete(prompt: string): Promise<string> {
    this.prompts.push(prompt);
    return this.reply(prompt);
  }
}

export type ExecFn = (
  file: string,
  args: string[],
  opts: { timeout: number; env: NodeJS.ProcessEnv; maxBuffer: number },
  cb: (err: Error | null, stdout: string) => void,
) => { stdin?: { end(input: string): void } | null };

/**
 * Development provider: `claude -p` on the existing Claude subscription. Never uses an API key:
 * ANTHROPIC_API_KEY is stripped from the child environment so the CLI falls back to the login.
 */
export class ClaudeCliProvider implements LlmProvider {
  readonly name = "claude-cli";

  constructor(private opts: { bin?: string; timeoutMs?: number; exec?: ExecFn } = {}) {}

  complete(prompt: string): Promise<string> {
    const { bin = "claude", timeoutMs = 120_000, exec = execFile as unknown as ExecFn } = this.opts;
    const { ANTHROPIC_API_KEY: _drop, ...env } = process.env;
    return new Promise((resolve, reject) => {
      const child = exec(
        bin,
        ["-p"],
        { timeout: timeoutMs, env, maxBuffer: 1024 * 1024 },
        (err, stdout) => (err ? reject(err) : resolve(stdout.trim())),
      );
      child.stdin?.end(prompt);
    });
  }
}
