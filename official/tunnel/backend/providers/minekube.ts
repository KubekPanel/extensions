import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import type { BinarySpec } from "../binaries";
import { ensureBinary } from "../binaries";
import {
  type Provider,
  ProviderError,
  javaPort,
  stripAnsi,
} from "./types";

const GATE_VERSION = "0.82.2";
const GATE_URL = `https://github.com/minekube/gate/releases/download/v${GATE_VERSION}`;

export const GATE: BinarySpec = {
  name: "gate",
  version: GATE_VERSION,
  entry: (platform) => (platform.startsWith("win32") ? "gate.exe" : "gate"),
  assets: {
    "linux-x64": {
      url: `${GATE_URL}/gate_${GATE_VERSION}_linux_amd64`,
      sha256: "fa4045ec28b3382de6b29ee0f1235870a0c2263a77f08877b5786f3e74f3d387",
    },
    "linux-arm64": {
      url: `${GATE_URL}/gate_${GATE_VERSION}_linux_arm64`,
      sha256: "9ea1788eb6b3939966479a60e933249a57bd7aedd1a8263cacf5a42e8c9f5eb0",
    },
    "darwin-x64": {
      url: `${GATE_URL}/gate_${GATE_VERSION}_darwin_amd64`,
      sha256: "228c5bcf2cbbeb080f4ea5bfab16d1d32446ad12f4a3a90fec5964d7e0c13bf1",
    },
    "darwin-arm64": {
      url: `${GATE_URL}/gate_${GATE_VERSION}_darwin_arm64`,
      sha256: "6a5c4164cca4bc6e208804a62e9dda6e1415ccb71bc21bba525ab167374ff7f6",
    },
    "win32-x64": {
      url: `${GATE_URL}/gate_${GATE_VERSION}_windows_amd64.exe`,
      sha256: "c1ac9512b236d62f3c73f4c19f3ad31f4fd6661cd021eb45b0fdad40f9fb34e3",
    },
    "win32-arm64": {
      url: `${GATE_URL}/gate_${GATE_VERSION}_windows_arm64.exe`,
      sha256: "7a1b5566000819883d6fb0d9390fc06cbdd4b600cb5e5931eef9cde2201d9099",
    },
  },
};

export const ENDPOINT_NAME = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** Gate needs its own local port, players never see it */
function freeLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no free port")),
      );
    });
  });
}

export function gateConfig(
  name: string,
  bindPort: number,
  backendPort: number,
): string {
  // Gate checks the Mojang session, the server behind it has to run in offline mode
  return [
    "config:",
    `  bind: 127.0.0.1:${bindPort}`,
    "  onlineMode: true",
    "  servers:",
    `    server: 127.0.0.1:${backendPort}`,
    "  try:",
    "    - server",
    "  forwarding:",
    "    mode: none",
    "connect:",
    "  enabled: true",
    `  name: ${name}`,
    "  allowOfflineModePlayers: false",
    "",
  ].join("\n");
}

export const minekube: Provider = {
  id: "minekube",

  validate(config, ports) {
    const errors: string[] = [];
    if (!ENDPOINT_NAME.test(config.minekube.name)) errors.push("minekube.name");
    if (!javaPort(ports)) errors.push("noJavaPort");
    return errors;
  },

  async prepare({ ctx, workDir, ports, config }) {
    const backend = javaPort(ports);
    if (!backend) throw new ProviderError("noJavaPort");
    const binary = await ensureBinary(ctx, GATE);
    const dir = join(ctx.dataDir, workDir);
    await mkdir(dir, { recursive: true });
    const name = config.minekube.name;
    await writeFile(
      join(dir, "config.yml"),
      gateConfig(name, await freeLocalPort(), backend.port),
    );
    const address = `${name}.play.minekube.net`;
    return {
      // connect.json with the endpoint token stays in workDir, it owns the name
      command: binary,
      args: ["--config", "config.yml", "--no-auto-reload"],
      cwd: workDir,
      address,
      parse(raw) {
        const line = stripAnsi(raw);
        if (/\bconnected\b.*\btook\b/i.test(line)) return { online: true };
        if (/\b401\b|unauthori[sz]ed|already (?:taken|in use)|auth.*reject/i.test(line)) {
          return { error: "minekube.nameTaken" };
        }
        if (/disconnected by (?:server|watch service)|connecting to watch service/i.test(line)) {
          return { online: false };
        }
        return null;
      },
    };
  },
};
