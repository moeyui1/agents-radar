import OpenAI from "openai";
import type { Provider } from "./types.ts";

const DEFAULT_MODEL = "gpt-4o";

function resolveModel(): string {
  return process.env["LLM_MODEL"] ?? DEFAULT_MODEL;
}

export const provider: Provider = {
  call: async (prompt, maxTokens) => {
    const client = new OpenAI({
      apiKey: process.env["OPENAI_API_KEY"],
      baseURL: process.env["OPENAI_BASE_URL"],
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
  endpointLabel: () => {
    const raw = process.env["OPENAI_BASE_URL"] ?? "api.openai.com";
    try {
      return new URL(raw).hostname;
    } catch {
      return "custom-endpoint";
    }
  },
};
