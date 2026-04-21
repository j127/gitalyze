#!/usr/bin/env bun

import { $ } from "bun";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function run(cmd: string[]): Promise<string> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    cwd: process.cwd(),
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text.trim();
}

async function shell(command: string): Promise<string> {
  const proc = Bun.spawn(["bash", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: process.cwd(),
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text.trim();
}

function heading(title: string, description: string) {
  const bar = "─".repeat(60);
  console.log(`\n\x1b[36m${bar}\x1b[0m`);
  console.log(`\x1b[1;33m${title}\x1b[0m`);
  console.log(`\x1b[2m${description}\x1b[0m`);
  console.log(`\x1b[36m${bar}\x1b[0m`);
}

function hasGnuplot(): boolean {
  try {
    Bun.spawnSync(["which", "gnuplot"]);
    return Bun.spawnSync(["which", "gnuplot"]).exitCode === 0;
  } catch {
    return false;
  }
}

async function plotBarChart(
  title: string,
  data: { label: string; value: number }[]
) {
  if (!hasGnuplot() || data.length === 0) return;

  const tmpDir = mkdtempSync(join(tmpdir(), "gitalyze-"));
  const dataFile = join(tmpDir, "data.dat");
  const scriptFile = join(tmpDir, "plot.gp");

  const dataContent = data
    .map((d, i) => `${i}\t${d.value}\t${d.label}`)
    .join("\n");

  await Bun.write(dataFile, dataContent);

  const script = `
set terminal dumb 100 25
set title "${title}"
set style fill solid
set boxwidth 0.6
set xtics rotate by -45
set xtics (${data.map((d, i) => `"${d.label.slice(0, 20)}" ${i}`).join(", ")})
set nokey
plot "${dataFile}" using 1:2 with boxes
`;
  await Bun.write(scriptFile, script);

  const output = await shell(`gnuplot "${scriptFile}" 2>/dev/null`);
  if (output) {
    console.log(`\x1b[2m${output}\x1b[0m`);
  }

  rmSync(tmpDir, { recursive: true, force: true });
}

async function plotTimeSeries(
  title: string,
  data: { date: string; value: number }[]
) {
  if (!hasGnuplot() || data.length === 0) return;

  const tmpDir = mkdtempSync(join(tmpdir(), "gitalyze-"));
  const dataFile = join(tmpDir, "data.dat");
  const scriptFile = join(tmpDir, "plot.gp");

  const dataContent = data.map((d) => `${d.date}-01\t${d.value}`).join("\n");
  await Bun.write(dataFile, dataContent);

  const script = `
set terminal dumb 100 25
set title "${title}"
set xdata time
set timefmt "%Y-%m-%d"
set format x "%Y-%m"
set xtics rotate by -45
set nokey
plot "${dataFile}" using 1:2 with linespoints
`;
  await Bun.write(scriptFile, script);

  const output = await shell(`gnuplot "${scriptFile}" 2>/dev/null`);
  if (output) {
    console.log(`\x1b[2m${output}\x1b[0m`);
  }

  rmSync(tmpDir, { recursive: true, force: true });
}

// ── Analysis commands ────────────────────────────────────────────────────────

async function codeChurnHotspots() {
  heading(
    "Code Churn Hotspots",
    "Most frequently modified files in the past year. High churn may indicate\nproblematic code the team fears touching, or areas under active development."
  );

  const raw = await shell(
    `git log --format=format: --name-only --since="1 year ago" | grep -v '^$' | sort | uniq -c | sort -nr | head -20`
  );

  if (!raw) {
    console.log("  No file changes found in the past year.");
    return;
  }

  const lines = raw.split("\n").filter(Boolean);
  const parsed = lines
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      return match
        ? { label: match[2]!, value: parseInt(match[1]!, 10) }
        : null;
    })
    .filter((x): x is { label: string; value: number } => x !== null);

  for (const { value, label } of parsed) {
    console.log(`  \x1b[1m${String(value).padStart(6)}\x1b[0m  ${label}`);
  }

  await plotBarChart("Code Churn Hotspots (top 20 files)", parsed.slice(0, 15));
}

async function contributorActivity() {
  heading(
    "Contributor Activity (All Time)",
    'All contributors ranked by commit count. Reveals the "bus factor" — whether\nkey knowledge is concentrated in one person.'
  );

  const raw = await run(["git", "shortlog", "-sn", "--no-merges"]);

  if (!raw) {
    console.log("  No contributors found.");
    return;
  }

  const lines = raw.split("\n").filter(Boolean);
  const parsed = lines
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      return match
        ? { label: match[2]!, value: parseInt(match[1]!, 10) }
        : null;
    })
    .filter((x): x is { label: string; value: number } => x !== null);

  for (const { value, label } of parsed) {
    console.log(`  \x1b[1m${String(value).padStart(6)}\x1b[0m  ${label}`);
  }

  await plotBarChart("Contributor Activity (all time)", parsed.slice(0, 15));
}

async function recentContributorActivity() {
  heading(
    "Recent Contributor Activity (6 months)",
    "Active contributors in the last 6 months. Shows whether the original team\nstill maintains the codebase or if new people are driving development."
  );

  const raw = await run([
    "git",
    "shortlog",
    "-sn",
    "--no-merges",
    "--since=6 months ago",
  ]);

  if (!raw) {
    console.log("  No recent contributors found.");
    return;
  }

  const lines = raw.split("\n").filter(Boolean);
  const parsed = lines
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      return match
        ? { label: match[2]!, value: parseInt(match[1]!, 10) }
        : null;
    })
    .filter((x): x is { label: string; value: number } => x !== null);

  for (const { value, label } of parsed) {
    console.log(`  \x1b[1m${String(value).padStart(6)}\x1b[0m  ${label}`);
  }

  await plotBarChart("Recent Contributors (6 months)", parsed.slice(0, 15));
}

async function bugHotspots() {
  heading(
    "Bug Hotspots",
    "Files with the most bug-related commits. Combined with churn data, these\nhighlight high-risk code that repeatedly breaks and gets patched."
  );

  const raw = await shell(
    `git log -i -E --grep="fix|bug|broken" --name-only --format='' | grep -v '^$' | sort | uniq -c | sort -nr | head -20`
  );

  if (!raw) {
    console.log("  No bug-related commits found.");
    return;
  }

  const lines = raw.split("\n").filter(Boolean);
  const parsed = lines
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      return match
        ? { label: match[2]!, value: parseInt(match[1]!, 10) }
        : null;
    })
    .filter((x): x is { label: string; value: number } => x !== null);

  for (const { value, label } of parsed) {
    console.log(`  \x1b[1m${String(value).padStart(6)}\x1b[0m  ${label}`);
  }

  await plotBarChart("Bug Hotspots (top 20 files)", parsed.slice(0, 15));
}

async function developmentVelocity() {
  heading(
    "Development Velocity",
    "Monthly commit frequency over the repository's history. Reveals whether the\nteam maintains steady momentum or shows declining/accelerating patterns."
  );

  const raw = await shell(
    `git log --format='%ad' --date=format:'%Y-%m' | sort | uniq -c | sort -k2`
  );

  if (!raw) {
    console.log("  No commit history found.");
    return;
  }

  const lines = raw.split("\n").filter(Boolean);
  const parsed = lines
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d{4}-\d{2})$/);
      return match ? { date: match[2]!, value: parseInt(match[1]!, 10) } : null;
    })
    .filter((x): x is { date: string; value: number } => x !== null);

  for (const { value, date } of parsed) {
    const bar = "█".repeat(Math.min(value, 60));
    console.log(
      `  \x1b[2m${date}\x1b[0m  \x1b[1m${String(value).padStart(5)}\x1b[0m  \x1b[32m${bar}\x1b[0m`
    );
  }

  await plotTimeSeries("Development Velocity (commits/month)", parsed);
}

async function firefightingFrequency() {
  heading(
    "Firefighting Frequency (past year)",
    "Reverts, hotfixes, and emergency commits in the past year. Frequent reverts\nindicate deployment anxiety and deeper process issues."
  );

  const raw = await shell(
    `git log --oneline --since="1 year ago" | grep -iE 'revert|hotfix|emergency|rollback'`
  );

  if (!raw) {
    console.log("  No firefighting commits found in the past year. Nice!");
    return;
  }

  const lines = raw.split("\n").filter(Boolean);
  console.log(
    `  Found \x1b[1;31m${lines.length}\x1b[0m firefighting commits:\n`
  );

  for (const line of lines) {
    console.log(`  \x1b[31m•\x1b[0m ${line}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Verify we're in a git repo
  const gitCheck = Bun.spawnSync(["git", "rev-parse", "--is-inside-work-tree"]);
  if (gitCheck.exitCode !== 0) {
    console.error(
      "\x1b[1;31mError:\x1b[0m Not inside a git repository. Run this from a git repo."
    );
    process.exit(1);
  }

  const repoName = await run(["git", "rev-parse", "--show-toplevel"]);
  const name = repoName.split("/").pop() ?? "unknown";

  console.log(
    `\n\x1b[1;35m╔══════════════════════════════════════════════════════════════╗\x1b[0m`
  );
  console.log(
    `\x1b[1;35m║\x1b[0m  \x1b[1mgitalyze\x1b[0m — Git Repository Analysis                         \x1b[1;35m║\x1b[0m`
  );
  console.log(
    `\x1b[1;35m║\x1b[0m  Repository: \x1b[1m${name.padEnd(47)}\x1b[0m\x1b[1;35m║\x1b[0m`
  );
  console.log(
    `\x1b[1;35m╚══════════════════════════════════════════════════════════════╝\x1b[0m`
  );

  if (!hasGnuplot()) {
    console.log(
      `\n\x1b[33m⚠  gnuplot not found — charts will be skipped.\x1b[0m`
    );
    console.log(
      `\x1b[2m   Install with: brew install gnuplot (macOS) or apt install gnuplot (Linux)\x1b[0m`
    );
  }

  await codeChurnHotspots();
  await contributorActivity();
  await recentContributorActivity();
  await bugHotspots();
  await developmentVelocity();
  await firefightingFrequency();

  console.log(
    `\n\x1b[1;35m── Analysis complete ───────────────────────────────────────────\x1b[0m\n`
  );
}

main();
