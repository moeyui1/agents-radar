/**
 * Provider type definitions.
 */

export interface Provider {
	call: (prompt: string, maxTokens: number) => Promise<string>;
	endpointLabel: () => string;
}
