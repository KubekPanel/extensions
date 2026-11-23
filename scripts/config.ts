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
  "process:spawn",
];

const SLOTS = [
  "dashboard.header",
  "server.toolbar",
  "server.console.actions",
  "server.sidebar",
  "files.contextMenu",
  "settings.footer",
  "login.footer",
];

const SETTING_TYPES = ["string", "number", "boolean", "select", "multiselect", "secret"];

const ISOLATION = ["in-process", "worker"];

// core permission keys of the panel, an extension may not declare them again
const CORE_PERMISSIONS = [
  "servers_view",
  "servers_control",
  "servers_configure",
  "servers_create",
  "file_manager",
  "plugins_mgr",
  "backups",
  "scheduler_mgr",
  "java_mgr",
  "system_monitoring",
  "audit_log",
  "ai_assistant",
  "accounts_mgr",
  "kubek_settings",
];

// keep in sync with the panel, extension-validator.service.ts
export function checkManifest(m: Manifest, files: Files): string[] {
  const errors: string[] = [];
  const requires = m.permissions?.requires ?? [];
  if (!Array.isArray(requires)) errors.push("permissions.requires must be a list");
  else
    for (const cap of requires)
      if (!CAPABILITIES.includes(cap)) errors.push(`unknown capability "${cap}"`);
  errors.push(...checkDeclares(m.permissions?.declares));
  if (!m.backend && !m.frontend)
    errors.push("extension must declare a backend or frontend entry");
  for (const half of ["backend", "frontend"] as const) {
    const entry = m[half]?.entry;
    if (m[half] && !files.has(entry)) errors.push(`${half}.entry ${entry} is not in the package`);
  }
  const isolation = m.backend?.isolation;
  if (isolation !== undefined && !ISOLATION.includes(isolation))
    errors.push('backend.isolation must be "in-process" or "worker"');
  errors.push(...checkSlots(m.frontend?.contributes?.slots));
  errors.push(...checkSettingsSchema(m.settingsSchema));
  return errors;
}

function checkDeclares(declares: unknown): string[] {
  if (declares === undefined) return [];
  if (!Array.isArray(declares)) return ["permissions.declares must be a list"];
  const errors: string[] = [];
  for (const def of declares) {
    if (typeof def?.key !== "string" || !def.key) errors.push("every declared permission needs a key");
    else if (CORE_PERMISSIONS.includes(def.key)) errors.push(`permission "${def.key}" is a core permission`);
  }
  return errors;
}

function checkSlots(slots: unknown): string[] {
  if (slots === undefined) return [];
  if (!Array.isArray(slots)) return ["frontend.contributes.slots must be a list"];
  const errors: string[] = [];
  for (const s of slots) {
    if (!SLOTS.includes(s?.slot)) errors.push(`unknown slot "${s?.slot}"`);
    if (typeof s?.component !== "string" || !s.component) errors.push(`slot "${s?.slot}" needs a component`);
  }
  return errors;
}

function checkSettingsSchema(schema: unknown): string[] {
  if (schema === undefined) return [];
  if (!Array.isArray(schema)) return ["settingsSchema must be a list"];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const f of schema) {
    const key = f?.key;
    if (typeof key !== "string" || !key) {
      errors.push("every settingsSchema field needs a key");
      continue;
    }
    if (seen.has(key)) errors.push(`settingsSchema key "${key}" is used twice`);
    seen.add(key);
    if (!SETTING_TYPES.includes(f.type)) errors.push(`settingsSchema "${key}" has unknown type "${f.type}"`);
    if (
      (f.type === "select" || f.type === "multiselect") &&
      (!Array.isArray(f.options) || !f.options.length || f.options.some((o: unknown) => typeof o !== "string"))
    )
      errors.push(`settingsSchema "${key}" needs a list of options`);
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
