/**
 * Provider configuration, validation, and handler wiring.
 */

import { provider as anthropicProvider } from "./providers/anthropic.ts";
import { provider as githubCopilotProvider } from "./providers/github-copilot.ts";
import { provider as openAiProvider } from "./providers/openai.ts";
import { provider as openRouterProvider } from "./providers/openrouter.ts";
import type { LlmProvider, ProviderBuilder } from "./providers/types.ts";

export type { LlmProvider, ProviderBuilder, ProviderHandler, ProviderHandlers } from "./providers/types.ts";

const VALID_PROVIDERS: ReadonlySet<string> = new Set([
  "anthropic",
  "openai",
  "github-copilot",
  "openrouter",
]);
const rawProvider = process.env["LLM_PROVIDER"] ?? "anthropic";
if (!VALID_PROVIDERS.has(rawProvider)) {
  throw new Error(
    `Unsupported LLM_PROVIDER "${rawProvider}". Valid values: anthropic, openai, github-copilot, openrouter`,
  );
}
export const LLM_PROVIDER = rawProvider as LlmProvider;

/** Required API-key env var per provider (null = uses GITHUB_TOKEN). */
const PROVIDER_API_KEYS: Record<LlmProvider, string | null> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  "github-copilot": null,
};

/**
 * Validates that all provider-specific env vars are present.
 * Returns the active provider. Throws on missing vars or invalid provider.
 */
export function validateProviderConfig(): LlmProvider {
  if (!process.env["GITHUB_TOKEN"]) {
    throw new Error("Missing required environment variable: GITHUB_TOKEN");
  }
  const apiKeyVar = PROVIDER_API_KEYS[LLM_PROVIDER];
  if (apiKeyVar && !process.env[apiKeyVar]) {
    throw new Error(`Missing required environment variable: ${apiKeyVar}`);
  }
  return LLM_PROVIDER;
}

/** Returns a log-safe label for the active provider's endpoint. */
export function endpointLabel(): string {
  return PROVIDERS[LLM_PROVIDER].endpointLabel();
}

export const PROVIDERS: Record<LlmProvider, ProviderBuilder> = {
  anthropic: anthropicProvider,
  openai: openAiProvider,
  "github-copilot": githubCopilotProvider,
  openrouter: openRouterProvider,
};
