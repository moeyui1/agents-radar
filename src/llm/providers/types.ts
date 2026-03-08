/**
 * Provider type definitions.
 */

export type LlmProvider = "anthropic" | "openai" | "github-copilot" | "openrouter";

export type ProviderHandler = (prompt: string, maxTokens: number) => Promise<string>;
export type ProviderHandlers = Record<LlmProvider, ProviderHandler>;

export interface ProviderBuilder {
	build: () => ProviderHandler;
	endpointLabel: () => string;
}
