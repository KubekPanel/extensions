import type {
  ExtRequest,
  ExtResponse,
  ExtUser,
  KubekExtensionContext,
} from "@kubekpanel/extension-sdk";
import { PROVIDERS, TunnelManager } from "./manager";
import type { ProviderId, TunnelConfig } from "./providers/types";

const USE = "ext.tunnel.use";

let manager: TunnelManager | null = null;

const canTouch = (user: ExtUser, serverId: string) =>
  !user.servers || user.servers === "all" || user.servers.includes(serverId);

const text = (value: unknown, max = 256) =>
  typeof value === "string" ? value.trim().slice(0, max) : undefined;

const int = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) ? n : undefined;
};

/** Merges a form into the saved config, an empty secret keeps the old one */
export function mergeConfig(current: TunnelConfig, body: Record<string, any>): TunnelConfig {
  const next = structuredClone(current);
  if (typeof body.enabled === "boolean") next.enabled = body.enabled;
  if (body.provider in PROVIDERS) next.provider = body.provider as ProviderId;
  const m = body.minekube ?? {};
  const name = text(m.name, 32);
  if (name !== undefined) next.minekube.name = name.toLowerCase();
  const p = body.pinggy ?? {};
  if (p.clearToken === true) next.pinggy.token = "";
  else if (text(p.token)) next.pinggy.token = text(p.token)!;
  const f = body.frp ?? {};
  const addr = text(f.serverAddr);
  if (addr !== undefined) next.frp.serverAddr = addr;
  for (const key of ["serverPort", "remotePort", "remoteUdpPort"] as const) {
    const n = int(f[key]);
    if (n !== undefined) next.frp[key] = n;
  }
  if (f.clearToken === true) next.frp.token = "";
  else if (text(f.token)) next.frp.token = text(f.token)!;
  return next;
}

/** What the UI may see, secrets only as "set" */
function publicView(config: TunnelConfig) {
  return {
    ...config,
    pinggy: { tokenSet: !!config.pinggy.token },
    frp: { ...config.frp, token: undefined, tokenSet: !!config.frp.token },
  };
}

export async function activate(ctx: KubekExtensionContext): Promise<void> {
  const tunnels = new TunnelManager(ctx);
  manager = tunnels;

  const guard = (req: ExtRequest, res: ExtResponse): string | null => {
    const id = req.params.id ?? "";
    if (!ctx.servers.get(id)) {
      res.status(404).json({ error: "unknown server" });
      return null;
    }
    if (!canTouch(req.user, id)) {
      res.status(403).json({ error: "forbidden" });
      return null;
    }
    return id;
  };

  const view = async (id: string) => ({
    config: publicView(tunnels.config(id)),
    state: tunnels.state(id),
    ports: await ctx.servers.ports(id),
    platform: `${process.platform}-${process.arch}`,
  });

  ctx.http.registerRoutes([
    {
      method: "GET",
      path: "/servers/:id",
      permission: USE,
      handler: async (req, res) => {
        const id = guard(req, res);
        if (id) res.json(await view(id));
      },
    },
    {
      method: "POST",
      path: "/servers/:id",
      permission: USE,
      handler: async (req, res) => {
        const id = guard(req, res);
        if (!id) return;
        const body = (req.body ?? {}) as Record<string, any>;
        const next = mergeConfig(tunnels.config(id), body);
        const problems = next.enabled
          ? PROVIDERS[next.provider].validate(next, await ctx.servers.ports(id))
          : [];
        if (problems.length) {
          res.status(400).json({ error: "invalid", fields: problems });
          return;
        }
        tunnels.saveConfig(id, next);
        await tunnels.restart(id);
        res.json(await view(id));
      },
    },
  ]);

  ctx.events.on("server.running", (e) => void tunnels.sync(e.serverId));
  ctx.events.on("server.stopped", (e) => void tunnels.sync(e.serverId));
  ctx.events.on("server.crashed", (e) => void tunnels.sync(e.serverId));
  ctx.events.on("server.deleted", (e) => tunnels.forget(e.serverId));

  // Servers that were already up when the panel or the extension started
  for (const server of ctx.servers.list()) {
    if (tunnels.config(server.id).enabled) void tunnels.sync(server.id);
  }
}

export async function deactivate(): Promise<void> {
  await manager?.stopAll();
  manager = null;
}
