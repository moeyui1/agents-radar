import assert from "node:assert/strict";
import { test } from "node:test";

type EnvSnapshot = Record<string, string | undefined>;

function snapshotEnv(): EnvSnapshot {
  return { ...process.env };
}

function restoreEnv(snapshot: EnvSnapshot): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function importLlmFresh(tag: string) {
  return await import(`../llm/index.ts?fresh=${tag}`);
}

async function importProvidersFresh(tag: string) {
  return await import(`../llm/providers.ts?fresh=${tag}`);
}

test("createCallLlm uses selected provider handler", async () => {
  const env = snapshotEnv();
  try {
    process.env["LLM_PROVIDER"] = "anthropic";
    const { createCallLlm } = await importLlmFresh("handlers");

    const calls = { anthropic: 0, openai: 0, "github-copilot": 0, openrouter: 0 };
    const handlers = {
      anthropic: async () => {
        calls.anthropic += 1;
        return "anthropic";
      },
      openai: async () => {
        calls.openai += 1;
        return "openai";
      },
      "github-copilot": async () => {
        calls["github-copilot"] += 1;
        return "github-copilot";
      },
      openrouter: async () => {
        calls.openrouter += 1;
        return "openrouter";
      },
    };

    const callLlm = createCallLlm({
      provider: "openai",
      handlers,
      acquireSlot: async () => {},
      releaseSlot: () => {},
      is429: () => false,
      sleep: async () => {},
    });

    const result = await callLlm("ping", 1);
    assert.equal(result, "openai");
    assert.equal(calls.openai, 1);
    assert.equal(calls.anthropic, 0);
  } finally {
    restoreEnv(env);
  }
});

test("createCallLlm retries on 429", async () => {
  const env = snapshotEnv();
  try {
    process.env["LLM_PROVIDER"] = "anthropic";
    const { createCallLlm } = await importLlmFresh("retries");

    let attempts = 0;
    const handler = async () => {
      attempts += 1;
      if (attempts < 3) {
        const err = new Error("rate-limited") as Error & { status?: number };
        err.status = 429;
        throw err;
      }
      return "ok";
    };

    const handlers = {
      anthropic: handler,
      openai: async () => "openai",
      "github-copilot": async () => "github-copilot",
      openrouter: async () => "openrouter",
    };

    const callLlm = createCallLlm({
      provider: "anthropic",
      handlers,
      maxRetries: 3,
      retryBaseMs: 1,
      acquireSlot: async () => {},
      releaseSlot: () => {},
      sleep: async () => {},
    });

    const result = await callLlm("ping", 1);
    assert.equal(result, "ok");
    assert.equal(attempts, 3);
  } finally {
    restoreEnv(env);
  }
});

test("validateProviderConfig requires GITHUB_TOKEN", async () => {
  const env = snapshotEnv();
  try {
    delete process.env["GITHUB_TOKEN"];
    process.env["LLM_PROVIDER"] = "anthropic";
    process.env["ANTHROPIC_API_KEY"] = "test";
    const { validateProviderConfig } = await importProvidersFresh("missing-gh");
    assert.throws(() => validateProviderConfig(), /GITHUB_TOKEN/);
  } finally {
    restoreEnv(env);
  }
});

test("validateProviderConfig requires provider API key", async () => {
  const env = snapshotEnv();
  try {
    process.env["GITHUB_TOKEN"] = "test";
    process.env["LLM_PROVIDER"] = "openai";
    delete process.env["OPENAI_API_KEY"];
    const { validateProviderConfig } = await importProvidersFresh("missing-openai");
    assert.throws(() => validateProviderConfig(), /OPENAI_API_KEY/);
  } finally {
    restoreEnv(env);
  }
});

test("validateProviderConfig returns provider when configured", async () => {
  const env = snapshotEnv();
  try {
    process.env["GITHUB_TOKEN"] = "test";
    process.env["LLM_PROVIDER"] = "openai";
    process.env["OPENAI_API_KEY"] = "test";
    const { validateProviderConfig } = await importProvidersFresh("configured-openai");
    assert.equal(validateProviderConfig(), "openai");
  } finally {
    restoreEnv(env);
  }
});

test("invalid provider throws on import", async () => {
  const env = snapshotEnv();
  try {
    process.env["LLM_PROVIDER"] = "invalid";
    await assert.rejects(
      async () => importProvidersFresh("invalid-provider"),
      /Unsupported LLM_PROVIDER/,
    );
  } finally {
    restoreEnv(env);
  }
});
