import type { ExtProcess, KubekExtensionContext } from "@kubekpanel/extension-sdk";
import { BinaryError } from "./binaries";
import { frp } from "./providers/frp";
import { minekube } from "./providers/minekube";
import { pinggy } from "./providers/pinggy";
import {
  type Provider,
  type ProviderId,
  ProviderError,
  type TunnelConfig,
} from "./providers/types";

export const PROVIDERS: Record<ProviderId, Provider> = { minekube, pinggy, frp };

export type TunnelStatus = "off" | "waiting" | "starting" | "online" | "error";

export interface TunnelState {
  status: TunnelStatus;
  address?: string;
  bedrockAddress?: string;
  /** i18n key suffix, or a raw message for unexpected failures */
  error?: string;
  /** when a free plan session ends */
  expiresAt?: number;
  log: string[];
}

const LOG_LINES = 40;
const MIN_RETRY_MS = 3_000;
const MAX_RETRY_MS = 5 * 60_000;
// A run this long counts as healthy, the backoff starts over
const HEALTHY_RUN_MS = 2 * 60_000;

export const defaultConfig = (): TunnelConfig => ({
  enabled: false,
  provider: "minekube",
  minekube: { name: "" },
  pinggy: { token: "" },
  frp: { serverAddr: "", serverPort: 7000, token: "", remotePort: 25565, remoteUdpPort: 0 },
});

interface Running {
  process: ExtProcess;
  startedAt: number;
  stopping: boolean;
}

/** One tunnel per server, up while the server runs and the tunnel is on */
export class TunnelManager {
  private readonly states = new Map<string, TunnelState>();
  private readonly running = new Map<string, Running>();
  private readonly retries = new Map<string, { timer: Timer; failures: number }>();
  private readonly failures = new Map<string, number>();
  // A binary download can take a while, a second sync must not start another copy
  private readonly starting = new Set<string>();

  constructor(private readonly ctx: KubekExtensionContext) {}

  config(serverId: string): TunnelConfig {
    const saved = this.ctx.storage.get<Partial<TunnelConfig>>(`config:${serverId}`) ?? {};
    const base = defaultConfig();
    return {
      ...base,
      ...saved,
      minekube: { ...base.minekube, ...saved.minekube },
      pinggy: { ...base.pinggy, ...saved.pinggy },
      frp: { ...base.frp, ...saved.frp },
    };
  }

  saveConfig(serverId: string, config: TunnelConfig): void {
    this.ctx.storage.set(`config:${serverId}`, config);
  }

  forget(serverId: string): void {
    void this.stop(serverId);
    this.ctx.storage.delete(`config:${serverId}`);
    this.states.delete(serverId);
  }

  state(serverId: string): TunnelState {
    return this.states.get(serverId) ?? { status: "off", log: [] };
  }

  /** Brings the tunnel to what the config and the server status ask for */
  async sync(serverId: string): Promise<void> {
    const config = this.config(serverId);
    const server = this.ctx.servers.get(serverId);
    if (!config.enabled || !server) {
      await this.stop(serverId);
      this.set(serverId, { status: "off", error: undefined, address: undefined, bedrockAddress: undefined });
      return;
    }
    if (server.status !== "running") {
      await this.stop(serverId);
      this.set(serverId, { status: "waiting", error: undefined, expiresAt: undefined });
      return;
    }
    if (this.running.has(serverId) || this.starting.has(serverId)) return;
    this.starting.add(serverId);
    try {
      await this.start(serverId, config);
    } finally {
      this.starting.delete(serverId);
    }
  }

  /** Settings changed, a running tunnel comes back with them */
  async restart(serverId: string): Promise<void> {
    await this.stop(serverId);
    this.failures.delete(serverId);
    await this.sync(serverId);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.running.keys()].map((id) => this.stop(id)));
  }

  private async start(serverId: string, config: TunnelConfig): Promise<void> {
    const provider = PROVIDERS[config.provider];
    const ports = await this.ctx.servers.ports(serverId);
    const problems = provider.validate(config, ports);
    if (problems.length) {
      this.set(serverId, { status: "error", error: `invalid.${problems[0]}` });
      return;
    }
    this.set(serverId, {
      status: "starting",
      error: undefined,
      address: undefined,
      bedrockAddress: undefined,
      expiresAt: undefined,
      log: [],
    });

    let child: ExtProcess;
    try {
      const run = await provider.prepare({
        ctx: this.ctx,
        serverId,
        workDir: `servers/${serverId}/${provider.id}`,
        ports,
        config,
      });
      // Settings or the server may have changed while a binary downloaded
      if (!this.config(serverId).enabled || this.ctx.servers.get(serverId)?.status !== "running") {
        this.set(serverId, { status: this.config(serverId).enabled ? "waiting" : "off" });
        return;
      }
      try {
        child = this.ctx.processes.spawn({
          command: run.command,
          args: run.args,
          cwd: run.cwd,
          env: run.env,
        });
      } catch {
        this.set(serverId, { status: "error", error: `missing.${run.command === "ssh" ? "ssh" : "binary"}` });
        return;
      }
      this.set(serverId, { address: run.address, bedrockAddress: run.bedrockAddress });
      const entry: Running = { process: child, startedAt: Date.now(), stopping: false };
      this.running.set(serverId, entry);

      child.onLine((line) => {
        this.pushLog(serverId, line);
        const event = run.parse(line);
        if (!event) return;
        const patch: Partial<TunnelState> = {};
        if (event.address) patch.address = event.address;
        if (event.bedrockAddress) patch.bedrockAddress = event.bedrockAddress;
        if (event.online) {
          patch.status = "online";
          patch.error = undefined;
          if (run.sessionLimitMs) patch.expiresAt = Date.now() + run.sessionLimitMs;
          this.failures.delete(serverId);
        } else if (event.online === false) {
          patch.status = "starting";
        }
        if (event.error) {
          patch.error = event.error;
          patch.status = "error";
        }
        this.set(serverId, patch);
      });

      void child.exited.then((code) => this.onExit(serverId, entry, code));
    } catch (error) {
      const message =
        error instanceof ProviderError
          ? `invalid.${error.message}`
          : error instanceof BinaryError
            ? error.message
            : String(error);
      this.ctx.logger.warn(`tunnel for ${serverId} failed to start: ${message}`);
      this.set(serverId, { status: "error", error: message });
    }
  }

  private onExit(serverId: string, entry: Running, code: number | null): void {
    if (this.running.get(serverId) === entry) this.running.delete(serverId);
    if (entry.stopping) return;
    const state = this.state(serverId);
    this.pushLog(serverId, `exited with code ${code ?? "signal"}`);
    const healthy = Date.now() - entry.startedAt > HEALTHY_RUN_MS;
    const failures = healthy ? 0 : (this.failures.get(serverId) ?? 0) + 1;
    this.failures.set(serverId, failures);
    const delay = Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** failures);
    this.set(serverId, {
      status: state.status === "error" ? "error" : "starting",
      error: state.error ?? "exited",
      expiresAt: undefined,
    });
    const timer = setTimeout(() => {
      this.retries.delete(serverId);
      void this.sync(serverId);
    }, delay);
    this.retries.set(serverId, { timer, failures });
  }

  private async stop(serverId: string): Promise<void> {
    const retry = this.retries.get(serverId);
    if (retry) clearTimeout(retry.timer);
    this.retries.delete(serverId);
    const entry = this.running.get(serverId);
    if (!entry) return;
    entry.stopping = true;
    this.running.delete(serverId);
    await entry.process.kill();
  }

  private pushLog(serverId: string, line: string): void {
    const state = this.state(serverId);
    this.set(serverId, { log: [...state.log, line].slice(-LOG_LINES) });
  }

  private set(serverId: string, patch: Partial<TunnelState>): void {
    this.states.set(serverId, { ...this.state(serverId), ...patch });
  }
}
