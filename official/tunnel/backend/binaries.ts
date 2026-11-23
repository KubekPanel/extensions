import type { KubekExtensionContext } from "@kubekpanel/extension-sdk";
import { createHash } from "node:crypto";
import { chmod, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type Platform =
  | "linux-x64"
  | "linux-arm64"
  | "darwin-x64"
  | "darwin-arm64"
  | "win32-x64"
  | "win32-arm64";

export interface BinaryAsset {
  url: string;
  sha256: string;
  /** an archive is unpacked with the system tar, entry is the file to keep */
  archive?: "tar.gz" | "zip";
}

export interface BinarySpec {
  name: string;
  version: string;
  /** file name of the program after install */
  entry: (platform: Platform) => string;
  assets: Partial<Record<Platform, BinaryAsset>>;
}

export function currentPlatform(): Platform | null {
  const key = `${process.platform}-${process.arch}`;
  const known: Platform[] = [
    "linux-x64",
    "linux-arm64",
    "darwin-x64",
    "darwin-arm64",
    "win32-x64",
    "win32-arm64",
  ];
  return (known as string[]).includes(key) ? (key as Platform) : null;
}

export class BinaryError extends Error {}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

async function findFile(dir: string, name: string): Promise<string | null> {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isFile() && item.name === name) return path;
    if (item.isDirectory()) {
      const found = await findFile(path, name);
      if (found) return found;
    }
  }
  return null;
}

const pending = new Map<string, Promise<string>>();

/** Pinned program in dataDir/bin, downloaded and checked by sha256 on first use */
export function ensureBinary(
  ctx: KubekExtensionContext,
  spec: BinarySpec,
): Promise<string> {
  const key = `${spec.name}-${spec.version}`;
  let job = pending.get(key);
  if (!job) {
    job = install(ctx, spec).finally(() => pending.delete(key));
    pending.set(key, job);
  }
  return job;
}

async function install(
  ctx: KubekExtensionContext,
  spec: BinarySpec,
): Promise<string> {
  const platform = currentPlatform();
  const asset = platform && spec.assets[platform];
  if (!platform || !asset) {
    throw new BinaryError(
      `${spec.name} has no build for ${process.platform}-${process.arch}`,
    );
  }
  const relDir = join("bin", `${spec.name}-${spec.version}`);
  const dir = join(ctx.dataDir, relDir);
  const target = join(dir, spec.entry(platform));
  if (await exists(target)) return target;

  ctx.logger.info(`downloading ${spec.name} ${spec.version}`);
  const response = await ctx.http.fetch(asset.url);
  if (!response.ok) {
    throw new BinaryError(`${spec.name} download failed: HTTP ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== asset.sha256) {
    throw new BinaryError(`${spec.name} download has a wrong checksum`);
  }

  // Unpack next to the target and move in at the end, a half done install is never used
  const tmpRel = `${relDir}.tmp`;
  const tmp = join(ctx.dataDir, tmpRel);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const entry = spec.entry(platform);

  if (asset.archive) {
    const archive = join(tmp, `download.${asset.archive}`);
    await writeFile(archive, bytes);
    const tar = ctx.processes.spawn({
      command: "tar",
      args: [asset.archive === "zip" ? "-xf" : "-xzf", archive, "-C", tmp],
      cwd: tmpRel,
    });
    const output: string[] = [];
    tar.onLine((line) => output.push(line));
    if ((await tar.exited) !== 0) {
      throw new BinaryError(`could not unpack ${spec.name}: ${output.join(" ")}`);
    }
    const found = await findFile(tmp, entry);
    if (!found) throw new BinaryError(`${entry} is missing in the ${spec.name} archive`);
    await rename(found, join(tmp, `${entry}.keep`));
    for (const item of await readdir(tmp)) {
      if (item !== `${entry}.keep`) await rm(join(tmp, item), { recursive: true, force: true });
    }
    await rename(join(tmp, `${entry}.keep`), join(tmp, entry));
  } else {
    await writeFile(join(tmp, entry), bytes);
  }

  await chmod(join(tmp, entry), 0o755);
  await rm(dir, { recursive: true, force: true });
  await rename(tmp, dir);
  return target;
}
