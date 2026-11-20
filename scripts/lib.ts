import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { MANIFEST_FILE, PACKAGE_EXT, RESERVED_PREFIX } from "./config";

export const COMMUNITY_DIR = join(import.meta.dir, "..", "community");
export const OFFICIAL_DIR = join(import.meta.dir, "..", "official");

const ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
// relative folder inside the repo, no "..", no leading or trailing slash
const PATH_PATTERN = /^(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
// fields allowed in community/<id>.json
const ENTRY_KEYS = new Set(["id", "repo", "commit", "path"]);
// bigger source archives are rejected while downloading
const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
// stops zip bombs, fflate never unpacks more than the archive declares
const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type Files = Map<string, Uint8Array>;
export type Manifest = Record<string, any>;

export interface Entry {
  id: string;
  repo: string;
  commit: string;
  path?: string;
}

export interface Blocked {
  id: string;
  reason: string;
}

// ids pulled from the catalog, the build leaves them out of the index
export function readBlocklist(): Blocked[] {
  const list = JSON.parse(readFileSync(join(import.meta.dir, "..", "blocklist.json"), "utf-8"));
  if (!Array.isArray(list) || list.some((b) => typeof b?.id !== "string" || typeof b?.reason !== "string"))
    throw new Error("blocklist.json must be a list of { id, reason }");
  return list;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// all community/*.json, broken JSON comes back as raw: null so validate can report it
export function listCommunity(): { file: string; raw: unknown }[] {
  if (!existsSync(COMMUNITY_DIR)) return [];
  return readdirSync(COMMUNITY_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      try {
        return { file, raw: JSON.parse(readFileSync(join(COMMUNITY_DIR, file), "utf-8")) };
      } catch {
        return { file, raw: null };
      }
    });
}

// folder names in official/
export function listOfficial(): string[] {
  if (!existsSync(OFFICIAL_DIR)) return [];
  return readdirSync(OFFICIAL_DIR)
    .filter((d) => statSync(join(OFFICIAL_DIR, d)).isDirectory())
    .sort();
}

// checks one community/<id>.json, returns a list of problems
export function checkEntry(file: string, raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return ["not a JSON object"];
  const entry = raw as Record<string, unknown>;
  const errors: string[] = [];

  for (const key of Object.keys(entry))
    if (!ENTRY_KEYS.has(key)) errors.push(`unknown field "${key}"`);

  const id = entry.id;
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    errors.push("id must be reverse-domain, like com.author.name");
  } else {
    if (file !== `${id}.json`) errors.push(`file must be named ${id}.json`);
    if (id.startsWith(RESERVED_PREFIX))
      errors.push(`ids starting with ${RESERVED_PREFIX} are reserved`);
  }

  if (typeof entry.repo !== "string" || !REPO_PATTERN.test(entry.repo))
    errors.push('repo must be "owner/name" on GitHub');

  if (typeof entry.commit !== "string" || !COMMIT_PATTERN.test(entry.commit))
    errors.push("commit must be a full 40 character commit sha");

  if (entry.path !== undefined && (typeof entry.path !== "string" || !PATH_PATTERN.test(entry.path)))
    errors.push('path must be a folder inside the repo, like "packages/my-blueprint"');

  return errors;
}

// source files of a package, without dotfiles, node_modules and built packages
export function readFolder(dir: string, prefix = ""): Files {
  const files: Files = new Map();
  for (const name of readdirSync(dir)) {
    if (skipped(name)) continue;
    const path = join(dir, name);
    const rel = prefix + name;
    if (statSync(path).isDirectory()) {
      for (const [k, v] of readFolder(path, `${rel}/`)) files.set(k, v);
    } else {
      files.set(rel, new Uint8Array(readFileSync(path)));
    }
  }
  return files;
}

// dotfiles, node_modules and built packages never go into a package
function skipped(name: string): boolean {
  return name.startsWith(".") || name === "node_modules" || name.endsWith(PACKAGE_EXT);
}

// fixed date for every zip entry, so the same files always give the same sha256
const ZIP_MTIME = new Date("2000-01-01T00:00:00Z");

// zips files the same way every time, sorted paths and one mtime
export function pack(files: Files): Uint8Array {
  const tree: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const path of [...files.keys()].sort())
    if (!path.split("/").some(skipped)) tree[path] = [files.get(path)!, { mtime: ZIP_MTIME }];
  return zipSync(tree, { level: 9 });
}

export interface Package {
  manifest: Manifest;
  files: Files;
  bytes: Uint8Array;
}

// manifest can be in the root or one folder deep, the panel accepts both
function unpack(bytes: Uint8Array): Files {
  return manifestRoot(unzipLimited(bytes));
}

// unzips with the size limit, keeps only files
function unzipLimited(bytes: Uint8Array): Files {
  let total = 0;
  const all = unzipSync(bytes, {
    filter: (f) => {
      total += f.originalSize;
      if (total > MAX_UNPACKED_BYTES) throw new Error("package unpacks to more than 200 MB");
      return true;
    },
  });
  const files: Files = new Map();
  for (const [name, data] of Object.entries(all)) if (!name.endsWith("/")) files.set(name, data);
  return files;
}

// cuts the folder above the manifest
function manifestRoot(all: Files): Files {
  const names = [...all.keys()];
  let root = "";
  if (!names.includes(MANIFEST_FILE)) {
    const nested = names.find((n) => /^[^/]+\/[^/]+$/.test(n) && n.endsWith(`/${MANIFEST_FILE}`));
    if (!nested) throw new Error(`package has no ${MANIFEST_FILE}`);
    root = nested.slice(0, -MANIFEST_FILE.length);
  }
  const files: Files = new Map();
  for (const name of names)
    if (name.startsWith(root)) files.set(name.slice(root.length), all.get(name)!);
  return files;
}

// manifest from an unpacked package or a source folder
export function parseManifest(files: Files): Manifest {
  const raw = files.get(MANIFEST_FILE);
  if (!raw) throw new Error(`no ${MANIFEST_FILE}`);
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch (e) {
    throw new Error(`${MANIFEST_FILE} is not valid JSON: ${(e as Error).message}`);
  }
}

// manifest rules shared by blueprints and extensions, the rest is in config.ts
export function checkCommon(m: Manifest, files: Files): string[] {
  const errors: string[] = [];
  if (m.manifestVersion !== 1) errors.push("manifestVersion must be 1");
  if (typeof m.id !== "string" || !ID_PATTERN.test(m.id))
    errors.push("id must be reverse-domain, like com.author.name");
  // these go into index.json as is, keep them short plain strings
  if (typeof m.name !== "string" || !m.name || m.name.length > 100)
    errors.push("name is required, up to 100 characters");
  if (typeof m.description !== "string" || !m.description || m.description.length > 300)
    errors.push("description is required, up to 300 characters");
  if (!m.author?.name) errors.push("author.name is required");
  if (typeof m.version !== "string" || !SEMVER.test(m.version))
    errors.push("version must be valid semver");
  if (!m.engines?.kubek) errors.push("engines.kubek is required");

  if (typeof m.icon === "string" && /\.[a-z0-9]+$/i.test(m.icon)) {
    if (!/\.png$/i.test(m.icon)) errors.push("icon must be a .png file");
    else if (!files.has(m.icon)) errors.push(`icon ${m.icon} is not in the package`);
    else if (!PNG_MAGIC.every((b, i) => files.get(m.icon)![i] === b)) errors.push(`icon ${m.icon} is not a real png`);
  }
  return errors;
}

// links from manifests end up in the panel UI, javascript: and other schemes are dropped
export function httpsUrl(value: unknown): string | null {
  return typeof value === "string" && /^https:\/\/[^\s]+$/.test(value) ? value : null;
}

// GET to the GitHub API, with GITHUB_TOKEN the limit is 1000 requests an hour instead of 60
export async function gh<T>(path: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      // GitHub API rejects requests without it
      "user-agent": "kubek-catalog",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 404) throw new Error(`${path} not found`);
  if (!res.ok) throw new Error(`GitHub API ${path}: ${res.status}`);
  return (await res.json()) as T;
}

interface GhRepo {
  archived: boolean;
  html_url: string;
  license: { spdx_id: string } | null;
}

interface GhCommit {
  sha: string;
  commit: { committer: { date: string } | null };
}

export interface Built extends Package {
  commit: string;
  committedAt: string;
  license: string | null;
  homepage: string;
}

// reads the body with a byte limit, content-length is not always there
async function download(url: string, limit: number): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { "user-agent": "kubek-catalog" } });
  if (!res.ok || !res.body) throw new Error(`download ${url}: ${res.status}`);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body) {
    total += chunk.byteLength;
    if (total > limit) throw new Error("source archive is bigger than 50 MB");
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

// downloads the pinned commit of an entry and builds the package from it
// throws only on network errors, broken rules go to errors
export async function loadCommit(
  entry: Entry,
): Promise<{ built: Built | null; errors: string[] }> {
  const errors: string[] = [];
  const fail = () => ({ built: null, errors });

  const repo = await gh<GhRepo>(`/repos/${entry.repo}`);
  if (repo.archived) errors.push("repo is archived");
  if (!repo.license) errors.push("repo has no license");

  let commit: GhCommit;
  try {
    commit = await gh<GhCommit>(`/repos/${entry.repo}/commits/${entry.commit}`);
  } catch {
    errors.push(`commit ${entry.commit} not found in ${entry.repo}`);
    return fail();
  }

  let files: Files;
  let manifest: Manifest;
  try {
    // codeload puts everything into <repo>-<sha>/
    const archive = unzipLimited(await download(`https://codeload.github.com/${entry.repo}/zip/${entry.commit}`, MAX_PACKAGE_BYTES));
    const top = [...archive.keys()][0]?.split("/")[0] ?? "";
    const prefix = `${top}/${entry.path ? `${entry.path}/` : ""}`;
    const tree: Files = new Map();
    for (const [name, data] of archive) if (name.startsWith(prefix)) tree.set(name.slice(prefix.length), data);
    if (!tree.has(MANIFEST_FILE)) throw new Error(`no ${MANIFEST_FILE} in ${entry.path ?? "the repo root"}`);
    files = unpack(pack(tree));
    manifest = parseManifest(files);
  } catch (e) {
    errors.push((e as Error).message);
    return fail();
  }

  if (manifest.id !== entry.id)
    errors.push(`manifest id ${manifest.id} doesn't match entry id ${entry.id}`);

  const bytes = pack(files);
  return {
    errors,
    built: {
      manifest,
      files,
      bytes,
      commit: commit.sha,
      committedAt: commit.commit.committer?.date ?? new Date().toISOString(),
      license: repo.license?.spdx_id ?? null,
      homepage: httpsUrl(manifest.homepage) ?? `${repo.html_url}/tree/${entry.commit}${entry.path ? `/${entry.path}` : ""}`,
    },
  };
}
