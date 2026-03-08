import Anthropic from "@anthropic-ai/sdk";
import type { Provider } from "./types.ts";
import { addTokenUsage } from "../usage.ts";

const DEFAULT_MODEL = "claude-sonnet-4-6";

function resolveModel(): string {
  return process.env["ANTHROPIC_MODEL"] ?? process.env["LLM_MODEL"] ?? DEFAULT_MODEL;
}

export const provider: Provider = {
  call: async (prompt, maxTokens) => {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: resolveModel(),
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    addTokenUsage({
      promptTokens: message.usage.input_tokens,
      completionTokens: message.usage.output_tokens,
      totalTokens: message.usage.input_tokens + message.usage.output_tokens,
    });
    const block = message.content[0];
    if (block?.type !== "text") throw new Error("Unexpected response type from LLM");
    return block.text;
  },
  endpointLabel: () => {
    const raw = process.env["ANTHROPIC_BASE_URL"] ?? "api.anthropic.com";
    try {
      return new URL(raw).hostname;
    } catch {
      return "custom-endpoint";
    }
  },
};
