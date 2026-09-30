import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("AI provider config is isolated per bot and masks secrets", async () => {
  const dataRoot = mkdtempSync(join(tmpdir(), "ngh-ai-provider-"));
  const previousRoot = process.env.NGH_DATA_ROOT;
  process.env.NGH_DATA_ROOT = dataRoot;

  try {
    const config = await import(`../src/service-ngh/api-crawl/assistant-ai/ai-provider-config.js?test=${Date.now()}`);

    config.setAIProviderConfig("bot-a", "gpt", "apiKey", "sk-test-1234567890");
    config.setAIProviderConfig("bot-a", "gpt", "baseURL", "https://api.example.com/v1/");
    config.setAIProviderConfig("bot-a", "gpt", "model", "example-model");

    assert.equal(config.isAIProviderConfigured("bot-a", "gpt"), true);
    assert.equal(config.isAIProviderConfigured("bot-b", "gpt"), false);
    assert.equal(config.getAIProviderConfig("bot-a", "gpt").baseURL, "https://api.example.com/v1/");
    assert.equal(config.formatAIProviderConfig("bot-a", "gpt").includes("sk-test-1234567890"), false);
    assert.match(config.formatAIProviderConfig("bot-a", "gpt"), /sk-tes\.\.\.7890/);

    const stored = JSON.parse(readFileSync(config.getAIProviderConfigPath(), "utf8"));
    assert.equal(stored["bot-a"].gpt.apiKey, "sk-test-1234567890");
    assert.equal(statSync(config.getAIProviderConfigPath()).mode & 0o777, 0o600);

    config.clearAIProviderConfig("bot-a", "gpt");
    assert.equal(config.isAIProviderConfigured("bot-a", "gpt"), false);
  } finally {
    if (previousRoot === undefined) delete process.env.NGH_DATA_ROOT;
    else process.env.NGH_DATA_ROOT = previousRoot;
    rmSync(dataRoot, { recursive: true, force: true });
  }
});
