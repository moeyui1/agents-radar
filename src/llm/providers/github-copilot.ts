import OpenAI from "openai";
import type { Provider } from "./types.ts";

const DEFAULT_MODEL = "gpt-4o";
const GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference";

function resolveModel(): string {
  return process.env["LLM_MODEL"] ?? DEFAULT_MODEL;
}

export const provider: Provider = {
  call: async (prompt, maxTokens) => {
    const client = new OpenAI({
      apiKey: process.env["GITHUB_TOKEN"],
      baseURL: GITHUB_MODELS_BASE_URL,
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
  endpointLabel: () => new URL(GITHUB_MODELS_BASE_URL).hostname,
};
