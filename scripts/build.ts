// writes dist/index.json, dist/icons, dist/readme and dist/packages, publish.yml deploys them to Pages
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkManifest, indexFields, KIND, PACKAGE_EXT, PAGES_URL, REPO } from "./config";
import {
  checkCommon,
  type Entry,
  type Files,
  httpsUrl,
  listCommunity,
  listOfficial,
  loadCommit,
  type Manifest,
  OFFICIAL_DIR,
  pack,
  parseManifest,
  readBlocklist,
  readFolder,
  sha256,
} from "./lib";

const DIST = join(import.meta.dir, "..", "dist");
rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "icons"), { recursive: true });
mkdirSync(join(DIST, "packages"), { recursive: true });
mkdirSync(join(DIST, "readme"), { recursive: true });

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

// README.md and README.<lang>.md from the package root, the panel shows the one in its language
function readme(manifest: Manifest, files: Files, base: string) {
  const out: Record<string, string> = {};
  for (const [path, bytes] of files) {
    const match = /^README(?:\.([a-z]{2}))?\.md$/i.exec(path);
    if (!match) continue;
    const lang = match[1]?.toLowerCase() ?? "default";
    const name = lang === "default" ? `${manifest.id}.md` : `${manifest.id}.${lang}.md`;
    writeFileSync(join(DIST, "readme", name), bytes);
    out[lang] = `${PAGES_URL}/readme/${name}`;
  }
  return Object.keys(out).length ? { files: out, base } : null;
}

// one item of index.json
function toItem(
  manifest: Manifest,
  files: Files,
  readmeBase: string,
  extra: { source: string } & Record<string, unknown>,
): Item {
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
    readme: readme(manifest, files, readmeBase),
    ...extra,
  };
}

// last commit that touched the file, needs the full git history (fetch-depth: 0)
function lastChange(path: string): { commit: string | null; updatedAt: string | null } {
  const out = Bun.spawnSync(["git", "log", "-1", "--format=%H %cI", "--", path], { cwd: OFFICIAL_DIR });
  const [commit, updatedAt] = out.stdout.toString().trim().split(" ");
  return { commit: commit || null, updatedAt: updatedAt || null };
}

// official packages are built from the sources in official/, the same way as community ones
for (const dir of listOfficial()) {
  const files = readFolder(join(OFFICIAL_DIR, dir));
  const manifest = parseManifest(files);
  if (blockedIds.has(manifest.id)) continue;
  const bytes = pack(files);
  const file = `${manifest.id}-${manifest.version}${PACKAGE_EXT}`;
  writeFileSync(join(DIST, "packages", file), bytes);
  const changed = lastChange(join(OFFICIAL_DIR, dir));
  items.push(
    toItem(manifest, files, `https://github.com/${REPO}/blob/${changed.commit ?? "main"}/official/${dir}/`, {
      source: "official",
      repo: REPO,
      homepage: `https://github.com/${REPO}/tree/main/official/${dir}`,
      license: "MIT",
      download: { url: `${PAGES_URL}/packages/${file}`, sha256: sha256(bytes), size: bytes.length },
      ...changed,
    }),
  );
}

// copies a url into dist, deploy replaces the whole site so kept files must be fetched again
async function keep(url: string, path: string): Promise<boolean> {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return false;
  writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
  return true;
}

// community packages are built here from the pinned commit, so what was reviewed is what ships
for (const { raw } of listCommunity()) {
  const entry = raw as Entry;
  if (blockedIds.has(entry.id)) continue;
  try {
    const { built, errors } = await loadCommit(entry);
    if (built)
      errors.push(...checkCommon(built.manifest, built.files), ...checkManifest(built.manifest, built.files));
    if (!built || errors.length) throw new Error(errors.join("; "));
    const file = `${built.manifest.id}-${built.manifest.version}${PACKAGE_EXT}`;
    writeFileSync(join(DIST, "packages", file), built.bytes);
    const folder = entry.path ? `${entry.path.replace(/^\/+|\/+$/g, "")}/` : "";
    items.push(
      toItem(built.manifest, built.files, `https://github.com/${entry.repo}/blob/${built.commit}/${folder}`, {
        source: "community",
        repo: entry.repo,
        commit: built.commit,
        homepage: built.homepage,
        license: built.license,
        download: { url: `${PAGES_URL}/packages/${file}`, sha256: sha256(built.bytes), size: built.bytes.length },
        updatedAt: built.committedAt,
      }),
    );
  } catch (e) {
    const prev = previous.get(entry.id);
    let kept = prev?.source === "community" ? prev : null;
    // the old package must come along, otherwise the kept item points at nothing
    if (kept) {
      const file = kept.download?.url?.split("/").pop();
      if (!file || !(await keep(kept.download.url, join(DIST, "packages", file)))) kept = null;
    }
    warnings.push(`${entry.id}: ${(e as Error).message}, ${kept ? `kept ${kept.version}` : "skipped"}`);
    if (!kept) continue;
    if (kept.icon && !(await keep(kept.icon, join(DIST, "icons", `${kept.id}.png`)))) kept.icon = null;
    for (const [lang, url] of Object.entries((kept.readme?.files ?? {}) as Record<string, string>)) {
      if (!(await keep(url, join(DIST, "readme", url.split("/").pop()!)))) delete kept.readme.files[lang];
    }
    if (kept.readme && !Object.keys(kept.readme.files).length) kept.readme = null;
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
