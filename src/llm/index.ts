/**
 * LLM provider selection, validation, and invocation helpers.
 */

import {
  type LlmProvider,
  type ProviderHandlers,
  endpointLabel,
  LLM_PROVIDER,
  PROVIDERS,
  validateProviderConfig,
} from "./providers.ts";

// ---------------------------------------------------------------------------
// Concurrency limiter — prevents rate-limit (429) errors when many LLM calls
// are fired in parallel. At most LLM_CONCURRENCY requests are in-flight at
// any given time; the rest queue and run as slots free up.
// ---------------------------------------------------------------------------

const LLM_CONCURRENCY = Math.max(1, Number(process.env["LLM_CONCURRENCY"]) || 5);
let llmSlots = LLM_CONCURRENCY;
const llmQueue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (llmSlots > 0) {
    llmSlots--;
    return Promise.resolve();
  }
  return new Promise((resolve) => llmQueue.push(resolve));
}

function releaseSlot(): void {
  const next = llmQueue.shift();
  if (next) {
    next();
  } else {
    llmSlots++;
  }
}

// ---------------------------------------------------------------------------
// LLM
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_BASE_MS = Math.max(1_000, Number(process.env["LLM_RETRY_BASE_MS"]) || 5_000);

function is429(err: unknown): boolean {
  return (err as { status?: number })?.status === 429 || String(err).includes("429");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface CallLlmOptions {
  provider?: LlmProvider;
  handlers?: ProviderHandlers;
  maxRetries?: number;
  retryBaseMs?: number;
  acquireSlot?: () => Promise<void>;
  releaseSlot?: () => void;
  is429?: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export function createCallLlm(options: CallLlmOptions = {}) {
  const provider = options.provider ?? LLM_PROVIDER;
  const handlers =
    options.handlers ??
    {
      anthropic: PROVIDERS.anthropic.build(),
      openai: PROVIDERS.openai.build(),
      "github-copilot": PROVIDERS["github-copilot"].build(),
      openrouter: PROVIDERS.openrouter.build(),
    };
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const retryBaseMs = options.retryBaseMs ?? RETRY_BASE_MS;
  const acquire = options.acquireSlot ?? acquireSlot;
  const release = options.releaseSlot ?? releaseSlot;
  const is429Fn = options.is429 ?? is429;
  const sleepFn = options.sleep ?? sleep;

  return async function callLlmWithOptions(prompt: string, maxTokens = 4096): Promise<string> {
    const handler = handlers[provider];
    if (!handler) {
      throw new Error(`No handler configured for provider: ${provider}`);
    }
    for (let attempt = 0; ; attempt++) {
      await acquire();
      let released = false;
      try {
        return await handler(prompt, maxTokens);
      } catch (err) {
        if (attempt < maxRetries && is429Fn(err)) {
          release();
          released = true;
          const wait = retryBaseMs * 2 ** attempt;
          console.error(`[llm] 429 — retry ${attempt + 1}/${maxRetries} in ${wait / 1000}s...`);
          await sleepFn(wait);
          continue;
        }
        throw err;
      } finally {
        if (!released) release();
      }
    }
  };
}

export const callLlm = createCallLlm();

export { endpointLabel, LLM_PROVIDER, validateProviderConfig } from "./providers.ts";
export type { LlmProvider, ProviderHandlers } from "./providers.ts";
