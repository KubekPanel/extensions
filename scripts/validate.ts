// bun run validate                      local checks
// bun run validate --remote [files...]  also builds community entries from their pinned commits
import { basename, join } from "node:path";
import { checkManifest } from "./config";
import {
  type Blocked,
  checkCommon,
  checkEntry,
  type Entry,
  listCommunity,
  listOfficial,
  loadCommit,
  OFFICIAL_DIR,
  parseManifest,
  readBlocklist,
  readFolder,
} from "./lib";

// everything found, printed at the end, any problem fails the run
const problems: string[] = [];
const report = (where: string, errors: string[]) => {
  for (const e of errors) problems.push(`${where}: ${e}`);
};

// where each id was first seen, catches the same id in two places
const ids = new Map<string, string>();
const claim = (id: unknown, where: string) => {
  if (typeof id !== "string") return;
  const other = ids.get(id);
  if (other) report(where, [`id ${id} is already used by ${other}`]);
  else ids.set(id, where);
};

// official: the sources, CI builds the package from them
for (const dir of listOfficial()) {
  const where = `official/${dir}`;
  try {
    const files = readFolder(join(OFFICIAL_DIR, dir));
    const manifest = parseManifest(files);
    report(where, [...checkCommon(manifest, files), ...checkManifest(manifest, files)]);
    claim(manifest.id, where);

  } catch (e) {
    report(where, [(e as Error).message]);
  }
}

// community: only the entry files here, the pinned commits are checked with --remote
const entries = new Map<string, Entry>();
for (const { file, raw } of listCommunity()) {
  const where = `community/${file}`;
  const errors = checkEntry(file, raw);
  report(where, errors);
  if (!errors.length) {
    entries.set(file, raw as Entry);
    claim((raw as Entry).id, where);
  }
}

let blocklist: Blocked[] = [];
try {
  blocklist = readBlocklist();
} catch (e) {
  report("blocklist.json", [(e as Error).message]);
}
// a blocked id must not stay in the catalog
for (const b of blocklist)
  if (ids.has(b.id)) report(ids.get(b.id)!, [`${b.id} is blocked (${b.reason}), remove the entry`]);

const args = process.argv.slice(2);
if (args[0] === "--remote") {
  // CI passes only the changed files, without args every entry is checked
  const wanted = args.length > 1 ? args.slice(1).map((f) => basename(f)) : [...entries.keys()];
  for (const file of wanted) {
    const entry = entries.get(file);
    if (!entry) continue;
    const where = `community/${file}`;
    try {
      const { built, errors } = await loadCommit(entry);
      if (built) errors.push(...checkCommon(built.manifest, built.files), ...checkManifest(built.manifest, built.files));
      report(where, errors);
      if (built && !errors.length) console.log(`ok ${entry.id} ${built.manifest.version} at ${built.commit.slice(0, 7)}`);
    } catch (e) {
      report(where, [(e as Error).message]);
    }
  }
}

if (problems.length) {
  console.error(problems.map((p) => `x ${p}`).join("\n"));
  process.exit(1);
}
console.log(`ok: ${ids.size} item(s)`);
