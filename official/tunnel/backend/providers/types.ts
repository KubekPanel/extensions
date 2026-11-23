import type { KubekExtensionContext, ServerPort } from "@kubekpanel/extension-sdk";

export type ProviderId = "minekube" | "pinggy" | "frp";

export interface MinekubeSettings {
  /** endpoint name, the address is <name>.play.minekube.net */
  name: string;
}

export interface PinggySettings {
  /** Pro token, empty for the free plan */
  token: string;
}

export interface FrpSettings {
  serverAddr: string;
  serverPort: number;
  token: string;
  /** port players type, opened on the frp server */
  remotePort: number;
  /** Bedrock port on the frp server, 0 to skip */
  remoteUdpPort: number;
}

export interface TunnelConfig {
  enabled: boolean;
  provider: ProviderId;
  minekube: MinekubeSettings;
  pinggy: PinggySettings;
  frp: FrpSettings;
}

/** What a provider line tells about the tunnel */
export interface LineEvent {
  online?: boolean;
  /** Java address players type */
  address?: string;
  bedrockAddress?: string;
  error?: string;
}

export interface PreparedRun {
  command: string;
  args: string[];
  /** relative to dataDir */
  cwd: string;
  env?: Record<string, string>;
  /** known before the process says anything */
  address?: string;
  bedrockAddress?: string;
  /** the plan closes the tunnel after this long, the manager reopens it */
  sessionLimitMs?: number;
  parse(line: string): LineEvent | null;
}

export interface PrepareInput {
  ctx: KubekExtensionContext;
  serverId: string;
  /** per server work dir, relative to dataDir */
  workDir: string;
  ports: ServerPort[];
  config: TunnelConfig;
}

export interface Provider {
  id: ProviderId;
  /** problems with the settings, empty when it can start */
  validate(config: TunnelConfig, ports: ServerPort[]): string[];
  prepare(input: PrepareInput): Promise<PreparedRun>;
}

export class ProviderError extends Error {}

export const javaPort = (ports: ServerPort[]) =>
  ports.find((p) => p.primary && p.protocol !== "udp") ??
  ports.find((p) => p.protocol !== "udp");

/** Bedrock or Geyser port, any udp one that is not the primary */
export const bedrockPort = (ports: ServerPort[]) =>
  ports.find((p) => p.protocol !== "tcp" && !p.primary) ??
  ports.find((p) => p.protocol === "udp");

// Logs keep ANSI colors, parsers look at plain text
export const stripAnsi = (line: string) =>
  line.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
