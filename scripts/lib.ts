import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { MANIFEST_FILE, PACKAGE_EXT, RESERVED_PREFIX } from "./config";

export const COMMUNITY_DIR = join(import.meta.dir, "..", "community");
export const OFFICIAL_DIR = join(import.meta.dir, "..", "official");

const ID_PATTERN = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const REPO_PATTERN = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
// fields allowed in community/<id>.json
const ENTRY_KEYS = new Set(["id", "repo", "asset"]);
// bigger packages are rejected before download
const MAX_PACKAGE_BYTES = 50 * 1024 * 1024;
// stops zip bombs, fflate never unpacks more than the archive declares
const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type Files = Map<string, Uint8Array>;
export type Manifest = Record<string, any>;

export interface Entry {
  id: string;
  repo: string;
  asset?: string;
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

  if (
    entry.asset !== undefined &&
    (typeof entry.asset !== "string" || !entry.asset.endsWith(PACKAGE_EXT))
  )
    errors.push(`asset must be a ${PACKAGE_EXT} file name`);

  return errors;
}

// source files of an official item, without dotfiles, node_modules and the built package
export function readFolder(dir: string, prefix = ""): Files {
  const files: Files = new Map();
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules" || name.endsWith(PACKAGE_EXT)) continue;
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

export interface Package {
  manifest: Manifest;
  files: Files;
  bytes: Uint8Array;
}

// the built package in official/<name>/, there must be exactly one
export function officialPackage(dir: string): Package & { file: string } {
  const found = readdirSync(dir).filter((f) => f.endsWith(PACKAGE_EXT));
  if (found.length !== 1) throw new Error(`needs exactly one ${PACKAGE_EXT}, found ${found.length}`);
  const file = found[0]!;
  const bytes = new Uint8Array(readFileSync(join(dir, file)));
  const files = unpack(bytes);
  return { file, bytes, files, manifest: parseManifest(files) };
}

// manifest can be in the root or one folder deep, the panel accepts both
function unpack(bytes: Uint8Array): Files {
  let total = 0;
  const all = unzipSync(bytes, {
    filter: (f) => {
      total += f.originalSize;
      if (total > MAX_UNPACKED_BYTES) throw new Error("package unpacks to more than 200 MB");
      return true;
    },
  });
  const names = Object.keys(all).filter((n) => !n.endsWith("/"));
  let root = "";
  if (!names.includes(MANIFEST_FILE)) {
    const nested = names.find((n) => /^[^/]+\/[^/]+$/.test(n) && n.endsWith(`/${MANIFEST_FILE}`));
    if (!nested) throw new Error(`package has no ${MANIFEST_FILE}`);
    root = nested.slice(0, -MANIFEST_FILE.length);
  }
  const files: Files = new Map();
  for (const name of names)
    if (name.startsWith(root)) files.set(name.slice(root.length), all[name]!);
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
async function gh<T>(path: string): Promise<T> {
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

interface GhRelease {
  tag_name: string;
  published_at: string;
  assets: { name: string; size: number; browser_download_url: string }[];
}

export interface Release extends Package {
  tag: string;
  url: string;
  publishedAt: string;
  license: string | null;
  homepage: string;
}

// downloads the package from the latest release of an entry and checks it against the entry
// throws only on network errors, broken rules go to errors
export async function loadRelease(
  entry: Entry,
): Promise<{ release: Release | null; errors: string[] }> {
  const errors: string[] = [];
  const fail = () => ({ release: null, errors });

  const repo = await gh<GhRepo>(`/repos/${entry.repo}`);
  if (repo.archived) errors.push("repo is archived");
  if (!repo.license) errors.push("repo has no license");

  let release: GhRelease;
  try {
    release = await gh<GhRelease>(`/repos/${entry.repo}/releases/latest`);
  } catch {
    errors.push("repo has no published release");
    return fail();
  }
  const tag = release.tag_name;

  const assets = release.assets.filter((a) =>
    entry.asset ? a.name === entry.asset : a.name.endsWith(PACKAGE_EXT),
  );
  if (assets.length !== 1) {
    errors.push(`release ${tag} must have exactly one ${entry.asset ?? `*${PACKAGE_EXT}`} asset, found ${assets.length}`);
    return fail();
  }
  const asset = assets[0]!;
  if (asset.size > MAX_PACKAGE_BYTES) {
    errors.push(`${asset.name} is bigger than 50 MB`);
    return fail();
  }

  const res = await fetch(asset.browser_download_url);
  if (!res.ok) throw new Error(`download ${asset.name}: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());

  let files: Files;
  let manifest: Manifest;
  try {
    files = unpack(bytes);
    manifest = parseManifest(files);
  } catch (e) {
    errors.push(`${asset.name}: ${(e as Error).message}`);
    return fail();
  }

  if (manifest.id !== entry.id)
    errors.push(`manifest id ${manifest.id} doesn't match entry id ${entry.id}`);
  if (manifest.version !== tag.replace(/^v/, ""))
    errors.push(`release tag ${tag} doesn't match manifest version ${manifest.version}`);

  return {
    errors,
    release: {
      manifest,
      files,
      bytes,
      tag,
      url: asset.browser_download_url,
      publishedAt: release.published_at,
      license: repo.license?.spdx_id ?? null,
      homepage: httpsUrl(manifest.homepage) ?? repo.html_url,
    },
  };
}
