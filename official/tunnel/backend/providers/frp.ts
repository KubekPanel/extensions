import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BinarySpec } from "../binaries";
import { ensureBinary } from "../binaries";
import {
  type FrpSettings,
  type Provider,
  ProviderError,
  bedrockPort,
  javaPort,
  stripAnsi,
} from "./types";

const FRP_VERSION = "0.72.0";
const FRP_URL = `https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}`;

export const FRPC: BinarySpec = {
  name: "frpc",
  version: FRP_VERSION,
  entry: (platform) => (platform.startsWith("win32") ? "frpc.exe" : "frpc"),
  assets: {
    "linux-x64": {
      url: `${FRP_URL}/frp_${FRP_VERSION}_linux_amd64.tar.gz`,
      sha256: "daf719b32ca2778770bb92955e231a07414d754378b9af328aa2642862479804",
      archive: "tar.gz",
    },
    "linux-arm64": {
      url: `${FRP_URL}/frp_${FRP_VERSION}_linux_arm64.tar.gz`,
      sha256: "02180b857480302fd934e9ddbd50fe2f73229f99062f88756abc6de9df5e95cf",
      archive: "tar.gz",
    },
    "darwin-x64": {
      url: `${FRP_URL}/frp_${FRP_VERSION}_darwin_amd64.tar.gz`,
      sha256: "60439dc6bf794c4182a1a4cac147d642f839d55201607208979eb23aecd09be9",
      archive: "tar.gz",
    },
    "darwin-arm64": {
      url: `${FRP_URL}/frp_${FRP_VERSION}_darwin_arm64.tar.gz`,
      sha256: "6e8576c5b6b9914a86850f6ff4fb81c5a09e706f91f70f64d5f398558bdc9db8",
      archive: "tar.gz",
    },
    "win32-x64": {
      url: `${FRP_URL}/frp_${FRP_VERSION}_windows_amd64.zip`,
      sha256: "5197c1b69564089cdc229fc1260a0e25db1e722b1b7db45fe1542c3c43edf9ae",
      archive: "zip",
    },
    "win32-arm64": {
      url: `${FRP_URL}/frp_${FRP_VERSION}_windows_arm64.zip`,
      sha256: "e4b83b66c4045971dd9a47cdef16dd02af471aaa6667dd303e63b1a669162927",
      archive: "zip",
    },
  },
};

const HOST = /^[a-z0-9.-]+$|^\[?[0-9a-f:]+\]?$/i;
const validPort = (port: number) => Number.isInteger(port) && port > 0 && port < 65536;

// JSON strings are valid TOML basic strings
const str = (value: string) => JSON.stringify(value);

export function frpcConfig(
  serverId: string,
  frp: FrpSettings,
  java: number,
  bedrock?: number,
): string {
  const id = serverId.slice(0, 8);
  const lines = [
    `serverAddr = ${str(frp.serverAddr)}`,
    `serverPort = ${frp.serverPort}`,
    // frpc keeps retrying instead of exiting when the server is down
    "loginFailExit = false",
  ];
  if (frp.token) lines.push('auth.method = "token"', `auth.token = ${str(frp.token)}`);
  lines.push(
    "",
    "[[proxies]]",
    `name = ${str(`kubek-${id}-java`)}`,
    'type = "tcp"',
    'localIP = "127.0.0.1"',
    `localPort = ${java}`,
    `remotePort = ${frp.remotePort}`,
  );
  if (bedrock && frp.remoteUdpPort) {
    lines.push(
      "",
      "[[proxies]]",
      `name = ${str(`kubek-${id}-bedrock`)}`,
      'type = "udp"',
      'localIP = "127.0.0.1"',
      `localPort = ${bedrock}`,
      `remotePort = ${frp.remoteUdpPort}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

const hostPort = (host: string, port: number) =>
  host.includes(":") && !host.startsWith("[") ? `[${host}]:${port}` : `${host}:${port}`;

export const frp: Provider = {
  id: "frp",

  validate(config, ports) {
    const { serverAddr, serverPort, remotePort, remoteUdpPort } = config.frp;
    const errors: string[] = [];
    if (!serverAddr || !HOST.test(serverAddr)) errors.push("frp.serverAddr");
    if (!validPort(serverPort)) errors.push("frp.serverPort");
    if (!validPort(remotePort)) errors.push("frp.remotePort");
    if (remoteUdpPort && !validPort(remoteUdpPort)) errors.push("frp.remoteUdpPort");
    if (!javaPort(ports)) errors.push("noJavaPort");
    return errors;
  },

  async prepare({ ctx, serverId, workDir, ports, config }) {
    const java = javaPort(ports);
    if (!java) throw new ProviderError("noJavaPort");
    const bedrock = config.frp.remoteUdpPort ? bedrockPort(ports) : undefined;
    const binary = await ensureBinary(ctx, FRPC);
    const dir = join(ctx.dataDir, workDir);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "frpc.toml"),
      frpcConfig(serverId, config.frp, java.port, bedrock?.port),
      { mode: 0o600 },
    );
    const host = config.frp.serverAddr;
    return {
      command: binary,
      args: ["-c", "frpc.toml"],
      cwd: workDir,
      address: hostPort(host, config.frp.remotePort),
      bedrockAddress: bedrock ? hostPort(host, config.frp.remoteUdpPort) : undefined,
      parse(raw) {
        const line = stripAnsi(raw);
        if (/-java\].*start proxy success/i.test(line)) return { online: true };
        if (/start error:.*(?:already used|address already in use|port not allowed)/i.test(line)) {
          return { error: "frp.portTaken" };
        }
        if (/token.*(?:invalid|mismatch)|authorization failed/i.test(line)) {
          return { error: "frp.auth" };
        }
        if (/login to (?:the )?server failed/i.test(line)) return { error: "network", online: false };
        return null;
      },
    };
  },
};
