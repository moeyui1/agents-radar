/**
 * Token usage accumulator — tracks cumulative prompt/completion/total tokens
 * across all LLM calls in a single pipeline run.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

let accumulated: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/** Add token counts from a single LLM response. */
export function addTokenUsage(usage: Partial<TokenUsage>): void {
  accumulated.promptTokens += usage.promptTokens ?? 0;
  accumulated.completionTokens += usage.completionTokens ?? 0;
  accumulated.totalTokens += usage.totalTokens ?? 0;
}

/** Return a snapshot of the accumulated token usage. */
export function getTokenUsage(): Readonly<TokenUsage> {
  return { ...accumulated };
}

/** Reset the accumulator (useful in tests). */
export function resetTokenUsage(): void {
  accumulated = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}
