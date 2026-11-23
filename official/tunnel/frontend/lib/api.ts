import { http, query } from "../kubek";
import type { TunnelView } from "../types";

export const EXT = "com.kubek.tunnel";
export const tunnelKey = (serverId?: string) => [EXT, serverId];
export const tunnelPath = (serverId: string) => `ext/${EXT}/servers/${serverId}`;

export function useTunnel(serverId: string | undefined, live: boolean) {
  return query.useQuery<TunnelView>({
    queryKey: tunnelKey(serverId),
    queryFn: () => http.get<TunnelView>(tunnelPath(serverId!)),
    enabled: !!serverId,
    refetchInterval: live ? 2_000 : 15_000,
    // Users without the permission get 403 here, the card just stays hidden
    meta: { silent: true },
  });
}
