// writes dist/index.json and dist/icons, publish.yml deploys them to Pages
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkManifest, indexFields, KIND, PAGES_URL, REPO } from "./config";
import {
  checkCommon,
  type Entry,
  type Files,
  httpsUrl,
  listCommunity,
  listOfficial,
  loadRelease,
  type Manifest,
  OFFICIAL_DIR,
  officialPackage,
  readBlocklist,
  sha256,
} from "./lib";

const DIST = join(import.meta.dir, "..", "dist");
rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "icons"), { recursive: true });

type Item = Record<string, any> & { id: string; source: string; icon: string | null };

const warnings: string[] = [];
const items: Item[] = [];
const blocked = readBlocklist();
const blockedIds = new Set(blocked.map((b) => b.id));

// keep the last good version when a release is broken or GitHub is down
const previous = new Map<string, Item>();
try {
  const res = await fetch(`${PAGES_URL}/index.json`);
  if (res.ok) for (const i of (await res.json()).items as Item[]) previous.set(i.id, i);
} catch {
  // first deploy has no index yet
}

// copies a png icon to dist/icons and returns its Pages url
function icon(manifest: Manifest, files: Files) {
  const bytes = typeof manifest.icon === "string" ? files.get(manifest.icon) : undefined;
  if (bytes) {
    writeFileSync(join(DIST, "icons", `${manifest.id}.png`), bytes);
    return { icon: `${PAGES_URL}/icons/${manifest.id}.png`, iconText: null };
  }
  // icon can also be an emoji
  const text = typeof manifest.icon === "string" && !manifest.icon.includes(".") ? manifest.icon : null;
  return { icon: null, iconText: text };
}

// one item of index.json
function toItem(manifest: Manifest, files: Files, extra: { source: string } & Record<string, unknown>): Item {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author.name,
    authorUrl: httpsUrl(manifest.author.url),
    engines: manifest.engines,
    ...indexFields(manifest),
    ...icon(manifest, files),
    ...extra,
  };
}

// date of the last commit that touched the file, needs the full git history (fetch-depth: 0)
function lastChange(path: string): string | null {
  const out = Bun.spawnSync(["git", "log", "-1", "--format=%cI", "--", path], { cwd: OFFICIAL_DIR });
  return out.stdout.toString().trim() || null;
}

// official packages are downloaded straight from the repo
for (const dir of listOfficial()) {
  const pkg = officialPackage(join(OFFICIAL_DIR, dir));
  if (blockedIds.has(pkg.manifest.id)) continue;
  const path = `official/${dir}/${pkg.file}`;
  items.push(
    toItem(pkg.manifest, pkg.files, {
      source: "official",
      repo: REPO,
      homepage: `https://github.com/${REPO}/tree/main/official/${dir}`,
      license: "MIT",
      download: {
        url: `https://raw.githubusercontent.com/${REPO}/main/${path}`,
        sha256: sha256(pkg.bytes),
        size: pkg.bytes.length,
      },
      updatedAt: lastChange(join(OFFICIAL_DIR, dir, pkg.file)),
    }),
  );
}

// community packages come from the latest release in the author's repo
for (const { raw } of listCommunity()) {
  const entry = raw as Entry;
  if (blockedIds.has(entry.id)) continue;
  try {
    const { release, errors } = await loadRelease(entry);
    if (release)
      errors.push(...checkCommon(release.manifest, release.files), ...checkManifest(release.manifest, release.files));
    if (!release || errors.length) throw new Error(errors.join("; "));
    items.push(
      toItem(release.manifest, release.files, {
        source: "community",
        repo: entry.repo,
        homepage: release.homepage,
        license: release.license,
        download: { url: release.url, sha256: sha256(release.bytes), size: release.bytes.length },
        updatedAt: release.publishedAt,
      }),
    );
  } catch (e) {
    const prev = previous.get(entry.id);
    const kept = prev?.source === "community" ? prev : null;
    warnings.push(`${entry.id}: ${(e as Error).message}, ${kept ? `kept ${kept.version}` : "skipped"}`);
    if (!kept) continue;
    // deploy replaces the whole site, so the old icon has to be copied too
    if (kept.icon) {
      const res = await fetch(kept.icon).catch(() => null);
      if (res?.ok) writeFileSync(join(DIST, "icons", `${kept.id}.png`), new Uint8Array(await res.arrayBuffer()));
      else kept.icon = null;
    }
    items.push(kept);
  }
}

// official first, then by name
items.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));

const index = { schemaVersion: 1, kind: KIND, generatedAt: new Date().toISOString(), items, blocked };
writeFileSync(join(DIST, "index.json"), JSON.stringify(index, null, 2));

for (const w of warnings) console.warn(`! ${w}`);
// warnings also show up on the workflow run page
if (warnings.length && process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Warnings\n\n${warnings.map((w) => `- ${w}`).join("\n")}\n`);
console.log(`built ${items.length} item(s) into dist/`);
