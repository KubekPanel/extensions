// opens a PR when an author tags a new version, the new commit gets reviewed before merge
// runs in bump.yml, needs git and gh with GITHUB_TOKEN
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkManifest } from "./config";
import { checkCommon, COMMUNITY_DIR, type Entry, gh, listCommunity, loadCommit } from "./lib";

const BASE = process.env.BASE_BRANCH ?? "main";

// runs a command, throws with its output when it fails
function run(cmd: string[]): string {
  const out = Bun.spawnSync(cmd, { stderr: "pipe" });
  if (out.exitCode !== 0) throw new Error(`${cmd.join(" ")}: ${out.stderr.toString().trim()}`);
  return out.stdout.toString().trim();
}

// latest release tag, or the newest tag when the author doesn't publish releases
async function latestTag(repo: string): Promise<string | null> {
  try {
    return (await gh<{ tag_name: string }>(`/repos/${repo}/releases/latest`)).tag_name;
  } catch {
    const tags = await gh<{ name: string }[]>(`/repos/${repo}/tags?per_page=1`);
    return tags[0]?.name ?? null;
  }
}

for (const { file, raw } of listCommunity()) {
  const entry = raw as Entry;
  if (!entry?.id || !entry.repo || !entry.commit) continue;
  try {
    const tag = await latestTag(entry.repo);
    if (!tag) continue;
    // commits/<tag> also resolves annotated tags to their commit
    const sha = (await gh<{ sha: string }>(`/repos/${entry.repo}/commits/${encodeURIComponent(tag)}`)).sha;
    if (sha === entry.commit) continue;

    const branch = `bump/${entry.id}`;
    const open = JSON.parse(run(["gh", "pr", "list", "--head", branch, "--state", "open", "--json", "number"]));
    if (open.length) {
      console.log(`${entry.id}: PR already open`);
      continue;
    }

    // PRs opened with GITHUB_TOKEN don't trigger validate.yml, so the checks go into the body
    const { built, errors } = await loadCommit({ ...entry, commit: sha });
    if (built) errors.push(...checkCommon(built.manifest, built.files), ...checkManifest(built.manifest, built.files));
    const checks = errors.length ? errors.map((e) => `- ${e}`).join("\n") : `- ok, version ${built?.manifest.version}`;

    run(["git", "switch", "-C", branch, `origin/${BASE}`]);
    writeFileSync(join(COMMUNITY_DIR, file), `${JSON.stringify({ ...entry, commit: sha }, null, 2)}\n`);
    run(["git", "commit", "-am", `bump ${entry.id} to ${tag}`]);
    run(["git", "push", "-f", "origin", branch]);
    run([
      "gh", "pr", "create", "--base", BASE, "--head", branch,
      "--title", `bump ${entry.id} to ${tag}`,
      "--body", [
        `New commit for \`${entry.id}\` from ${entry.repo} tag \`${tag}\`.`,
        "",
        `Diff: https://github.com/${entry.repo}/compare/${entry.commit}...${sha}`,
        "",
        "Review the whole diff before merging, after merge this code goes to every panel.",
        "",
        "Checks:",
        checks,
      ].join("\n"),
    ]);
    run(["git", "switch", BASE]);
    console.log(`${entry.id}: PR opened for ${tag}`);
  } catch (e) {
    console.warn(`! ${entry.id}: ${(e as Error).message}`);
  }
}
