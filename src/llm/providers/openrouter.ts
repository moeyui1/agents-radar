import OpenAI from "openai";
import type { Provider } from "./types.ts";

const DEFAULT_MODEL = "openai/gpt-4o";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function resolveModel(): string {
  return process.env["LLM_MODEL"] ?? DEFAULT_MODEL;
}

export const provider: Provider = {
  call: async (prompt, maxTokens) => {
    const client = new OpenAI({
      apiKey: process.env["OPENROUTER_API_KEY"],
      baseURL: OPENROUTER_BASE_URL,
    });
    const completion = await client.chat.completions.create({
      model: resolveModel(),
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    });
    const text = completion.choices[0]?.message?.content;
    if (!text) throw new Error("Unexpected response type from LLM");
    return text;
  },
  endpointLabel: () => new URL(OPENROUTER_BASE_URL).hostname,
};
