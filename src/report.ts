/**
 * LLM invocation, file I/O, and GitHub issue creation helpers.
 *
 * Provider selection (LLM_PROVIDER env var):
 *   anthropic  (default) — Anthropic Claude or Kimi Code via ANTHROPIC_API_KEY + optional ANTHROPIC_BASE_URL
 *   openai               — OpenAI or any OpenAI-compatible endpoint via OPENAI_API_KEY + optional OPENAI_BASE_URL
 *   github               — GitHub Models (Copilot) via GITHUB_TOKEN at models.inference.ai.azure.com
 *   openrouter           — OpenRouter via OPENROUTER_API_KEY at openrouter.ai/api/v1
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";

type LlmProvider = "anthropic" | "openai" | "github" | "openrouter";

const VALID_PROVIDERS: ReadonlySet<string> = new Set(["anthropic", "openai", "github", "openrouter"]);
const rawProvider = process.env["LLM_PROVIDER"] ?? "anthropic";
if (!VALID_PROVIDERS.has(rawProvider)) {
  throw new Error(
    `Unsupported LLM_PROVIDER "${rawProvider}". Valid values: anthropic, openai, github, openrouter`,
  );
}
const LLM_PROVIDER = rawProvider as LlmProvider;

// Default model per provider
const ANTHROPIC_MODEL = process.env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-6";
const OPENAI_MODEL = process.env["OPENAI_MODEL"] ?? "gpt-4o";
const OPENROUTER_MODEL = process.env["OPENROUTER_MODEL"] ?? "openai/gpt-4o";

// ---------------------------------------------------------------------------
// Concurrency limiter — prevents rate-limit (429) errors when many LLM calls
// are fired in parallel. At most LLM_CONCURRENCY requests are in-flight at
// any given time; the rest queue and run as slots free up.
// ---------------------------------------------------------------------------

const LLM_CONCURRENCY = 5;
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
const RETRY_BASE_MS = 5_000; // 5 s, 10 s, 20 s

function is429(err: unknown): boolean {
  return (err as { status?: number })?.status === 429 || String(err).includes("429");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function callAnthropic(prompt: string, maxTokens: number): Promise<string> {
  // Reads ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL from env automatically
  const client = new Anthropic();
  const message = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const block = message.content[0];
  if (block?.type !== "text") throw new Error("Unexpected response type from LLM");
  return block.text;
}

async function callOpenAiCompatible(
  prompt: string,
  maxTokens: number,
  model: string,
  apiKey: string | undefined,
  baseURL?: string,
): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL });
  const completion = await client.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("Unexpected response type from LLM");
  return text;
}

export async function callLlm(prompt: string, maxTokens = 4096): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    await acquireSlot();
    let released = false;
    try {
      let result: string;
      if (LLM_PROVIDER === "openai") {
        const apiKey = process.env["OPENAI_API_KEY"];
        const baseURL = process.env["OPENAI_BASE_URL"];
        result = await callOpenAiCompatible(prompt, maxTokens, OPENAI_MODEL, apiKey, baseURL);
      } else if (LLM_PROVIDER === "github") {
        const apiKey = process.env["GITHUB_TOKEN"];
        result = await callOpenAiCompatible(
          prompt,
          maxTokens,
          OPENAI_MODEL,
          apiKey,
          "https://models.inference.ai.azure.com",
        );
      } else if (LLM_PROVIDER === "openrouter") {
        const apiKey = process.env["OPENROUTER_API_KEY"];
        result = await callOpenAiCompatible(
          prompt,
          maxTokens,
          OPENROUTER_MODEL,
          apiKey,
          "https://openrouter.ai/api/v1",
        );
      } else {
        result = await callAnthropic(prompt, maxTokens);
      }
      return result;
    } catch (err) {
      if (attempt < MAX_RETRIES && is429(err)) {
        releaseSlot();
        released = true;
        const wait = RETRY_BASE_MS * 2 ** attempt;
        console.error(`[llm] 429 — retry ${attempt + 1}/${MAX_RETRIES} in ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      throw err;
    } finally {
      if (!released) releaseSlot();
    }
  }
}

// ---------------------------------------------------------------------------
// File output
// ---------------------------------------------------------------------------

export function saveFile(content: string, ...segments: string[]): string {
  const filepath = path.join("digests", ...segments);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, content, "utf-8");
  return filepath;
}

export function autoGenFooter(lang: "zh" | "en" = "zh"): string {
  const digestRepo = process.env["DIGEST_REPO"] ?? "";
  if (!digestRepo) return "";
  return lang === "en"
    ? `\n\n---\n*This digest is auto-generated by [agents-radar](https://github.com/${digestRepo}).*`
    : `\n\n---\n*本日报由 [agents-radar](https://github.com/${digestRepo}) 自动生成。*`;
}
