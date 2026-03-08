/**
 * Smoke test script — minimal single-report run for fast local testing.
 *
 * Fetches only the first CLI repo, generates one Chinese summary, and writes
 * a single Markdown file. No GitHub issues, no English, no comparisons.
 *
 * Usage: pnpm smoke
 */

import { fetchRecentItems, fetchRecentReleases, fetchSkillsData } from "./github.ts";
import { buildCliPrompt, buildSkillsPrompt } from "./prompts.ts";
import { callLlm, validateProviderConfig, endpointLabel } from "./llm/index.ts";
import { saveFile, autoGenFooter } from "./report.ts";
import { loadConfig } from "./config.ts";

const { cliRepos: CLI_REPOS, skillsRepo: CLAUDE_SKILLS_REPO } = loadConfig();

async function smoke(): Promise<void> {
  const provider = validateProviderConfig();

  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateStr = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const utcStr = now.toISOString().slice(0, 16).replace("T", " ");

  const repo = CLI_REPOS[0]!;
  console.log(`[${now.toISOString()}] Smoke test | repo: ${repo.id} | provider: ${provider} | endpoint: ${endpointLabel()}`);

  // 1. Fetch one repo + skills in parallel
  const [issuesRaw, prs, releases, skillsData] = await Promise.all([
    fetchRecentItems(repo, "issues", since),
    fetchRecentItems(repo, "pulls", since),
    fetchRecentReleases(repo.repo, since),
    fetchSkillsData(CLAUDE_SKILLS_REPO),
  ]);
  const issues = issuesRaw.filter((i) => !i.pull_request);
  console.log(
    `  [${repo.id}] issues: ${issues.length}, prs: ${prs.length}, releases: ${releases.length}`,
  );
  console.log(
    `  [skills] prs: ${skillsData.prs.length}, issues: ${skillsData.issues.length}`,
  );

  // 2. Generate summaries
  console.log("  Calling LLM...");
  const [summary, skillsSummary] = await Promise.all([
    issues.length || prs.length || releases.length
      ? callLlm(buildCliPrompt(repo, issues, prs, releases, dateStr, "zh"))
      : Promise.resolve("过去24小时无活动。"),
    callLlm(buildSkillsPrompt(skillsData.prs, skillsData.issues, dateStr, "zh")),
  ]);

  // 3. Build + save one report
  const footer = autoGenFooter("zh");
  const skillsSection =
    `## Claude Code Skills 社区热点\n\n` +
    `> 数据来源: [anthropics/skills](https://github.com/${CLAUDE_SKILLS_REPO})\n\n` +
    `${skillsSummary}\n\n---\n\n`;
  const skills = repo.id === "claude-code" ? skillsSection : "";

  const content =
    `# AI CLI 冒烟测试报告 ${dateStr}\n\n` +
    `> 仅含 ${repo.name} | 生成时间: ${utcStr} UTC\n\n` +
    `- [${repo.name}](https://github.com/${repo.repo})\n` +
    `- [Claude Code Skills](https://github.com/${CLAUDE_SKILLS_REPO})\n\n` +
    `---\n\n` +
    skills +
    summary +
    footer;

  console.log(`  Saved ${saveFile(content, dateStr, "ai-cli.md")}`);
  console.log("Done (smoke test)!");
}

smoke().catch((err) => {
  console.error(err);
  process.exit(1);
});
