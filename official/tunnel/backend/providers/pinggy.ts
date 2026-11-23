import type { KubekExtensionContext } from "@kubekpanel/extension-sdk";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { type Provider, ProviderError, javaPort, stripAnsi } from "./types";

// Free tunnels close after an hour and come back with a new address
const FREE_SESSION_MS = 60 * 60_000;
const PINGGY_HOST = "a.pinggy.io";

export const PINGGY_TOKEN = /^[A-Za-z0-9_-]{1,128}$/;

// Plain ssh, the Pinggy CLI keeps tunnels in a daemon that outlives it. No UDP over ssh
export function pinggyArgs(
  token: string,
  localPort: number,
  knownHosts: string,
  identity: string,
): string[] {
  const user = token ? `${token}+tcp` : "tcp";
  return [
    "-p",
    "443",
    "-T",
    "-i",
    identity,
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "PreferredAuthentications=publickey",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `UserKnownHostsFile=${knownHosts}`,
    "-o",
    "BatchMode=yes",
    "-o",
    "ServerAliveInterval=30",
    "-o",
    "ServerAliveCountMax=3",
    "-o",
    "ExitOnForwardFailure=yes",
    `-R0:127.0.0.1:${localPort}`,
    `${user}@${PINGGY_HOST}`,
  ];
}

// Pinggy takes any key, without one ssh would ask for a password nobody can type
async function ensureKey(ctx: KubekExtensionContext, workDir: string): Promise<string> {
  const keyRel = `${workDir}/id_ed25519`;
  const key = join(ctx.dataDir, keyRel);
  if (await stat(key).then(() => true, () => false)) return key;
  let exited: Promise<number | null>;
  try {
    exited = ctx.processes.spawn({
      command: "ssh-keygen",
      args: ["-q", "-t", "ed25519", "-N", "", "-C", "kubek-tunnel", "-f", key],
      cwd: workDir,
    }).exited;
  } catch {
    throw new ProviderError("sshKey");
  }
  if ((await exited) !== 0) throw new ProviderError("sshKey");
  return key;
}

export const pinggy: Provider = {
  id: "pinggy",

  validate(config, ports) {
    const errors: string[] = [];
    if (config.pinggy.token && !PINGGY_TOKEN.test(config.pinggy.token)) {
      errors.push("pinggy.token");
    }
    if (!javaPort(ports)) errors.push("noJavaPort");
    return errors;
  },

  async prepare({ ctx, workDir, ports, config }) {
    const backend = javaPort(ports);
    if (!backend) throw new ProviderError("noJavaPort");
    const dir = join(ctx.dataDir, workDir);
    await mkdir(dir, { recursive: true });
    const token = config.pinggy.token;
    const identity = await ensureKey(ctx, workDir);
    return {
      command: "ssh",
      args: pinggyArgs(token, backend.port, join(dir, "known_hosts"), identity),
      cwd: workDir,
      sessionLimitMs: token ? undefined : FREE_SESSION_MS,
      parse(raw) {
        const line = stripAnsi(raw);
        const url = /tcp:\/\/([a-z0-9.-]+:\d+)/i.exec(line);
        if (url) return { online: true, address: url[1] };
        if (/permission denied|authentication fail|invalid token/i.test(line)) {
          return { error: "pinggy.auth" };
        }
        if (/could not resolve|connection refused|network is unreachable|timed out/i.test(line)) {
          return { error: "network" };
        }
        return null;
      },
    };
  },
};
