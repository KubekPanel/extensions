export type ProviderId = "minekube" | "pinggy" | "frp";
export type Status = "off" | "waiting" | "starting" | "online" | "error";

export const PROVIDERS: ProviderId[] = ["minekube", "pinggy", "frp"];

/** What GET /servers/:id returns, secrets only as tokenSet */
export interface TunnelView {
  config: {
    enabled: boolean;
    provider: ProviderId;
    minekube: { name: string };
    pinggy: { tokenSet: boolean };
    frp: {
      serverAddr: string;
      serverPort: number;
      remotePort: number;
      remoteUdpPort: number;
      tokenSet: boolean;
    };
  };
  state: {
    status: Status;
    address?: string;
    bedrockAddress?: string;
    error?: string;
    expiresAt?: number;
    log: string[];
  };
}

/** Form values, ports stay strings while typed */
export interface Draft {
  enabled: boolean;
  provider: ProviderId;
  name: string;
  pinggyToken: string;
  clearPinggyToken: boolean;
  serverAddr: string;
  serverPort: string;
  frpToken: string;
  clearFrpToken: boolean;
  remotePort: string;
  remoteUdpPort: string;
}

export type FieldErrors = Partial<Record<keyof Draft, string>>;
