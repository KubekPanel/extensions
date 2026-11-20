import type { Capability, KubekExtensionManifest } from "@kubekpanel/extension-sdk";
import type { Files, Manifest } from "./lib";

export const KIND = "extension";
export const REPO = "KubekPanel/extensions";
export const PAGES_URL = "https://kubekpanel.github.io/extensions";
export const MANIFEST_FILE = "kubek-extension.json";
export const PACKAGE_EXT = ".kubekext";
export const RESERVED_PREFIX = "com.kubek.";

// capabilities the panel knows, with any other the install fails
const CAPABILITIES: Capability[] = [
  "events:server",
  "events:logs",
  "events:tasks",
  "events:backups",
  "events:players",
  "events:auth",
  "events:files",
  "servers:read",
  "servers:control",
  "http:routes",
  "http:outbound",
  "storage",
  "settings",
  "commands",
  "tasks",
];

// keep in sync with the panel, extension-validator.service.ts
export function checkManifest(m: Manifest, files: Files): string[] {
  const errors: string[] = [];
  for (const cap of m.permissions?.requires ?? [])
    if (!CAPABILITIES.includes(cap)) errors.push(`unknown capability "${cap}"`);
  if (!m.backend && !m.frontend)
    errors.push("extension must declare a backend or frontend entry");
  for (const half of ["backend", "frontend"] as const) {
    const entry = m[half]?.entry;
    if (m[half] && !files.has(entry)) errors.push(`${half}.entry ${entry} is not in the package`);
  }
  return errors;
}

// what the panel shows before download
export function indexFields(manifest: Manifest) {
  const m = manifest as KubekExtensionManifest;
  return {
    keywords: m.keywords ?? [],
    capabilities: m.permissions?.requires ?? [],
    hasBackend: !!m.backend,
    hasFrontend: !!m.frontend,
  };
}
