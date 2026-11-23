import type { Draft, TunnelView } from "../types";

export const toDraft = (view: TunnelView): Draft => ({
  enabled: view.config.enabled,
  provider: view.config.provider,
  name: view.config.minekube.name,
  pinggyToken: "",
  clearPinggyToken: false,
  serverAddr: view.config.frp.serverAddr,
  serverPort: String(view.config.frp.serverPort),
  frpToken: "",
  clearFrpToken: false,
  remotePort: String(view.config.frp.remotePort),
  remoteUdpPort: String(view.config.frp.remoteUdpPort),
});

// Empty tokens keep the saved ones on the backend
export const toBody = (draft: Draft) => ({
  enabled: draft.enabled,
  provider: draft.provider,
  minekube: { name: draft.name },
  pinggy: { token: draft.pinggyToken, clearToken: draft.clearPinggyToken },
  frp: {
    serverAddr: draft.serverAddr,
    serverPort: Number(draft.serverPort),
    token: draft.frpToken,
    clearToken: draft.clearFrpToken,
    remotePort: Number(draft.remotePort),
    remoteUdpPort: Number(draft.remoteUdpPort || 0),
  },
});

/** Backend field names to the inputs they belong to */
export const FIELD_INPUT: Record<string, keyof Draft> = {
  "minekube.name": "name",
  "pinggy.token": "pinggyToken",
  "frp.serverAddr": "serverAddr",
  "frp.serverPort": "serverPort",
  "frp.remotePort": "remotePort",
  "frp.remoteUdpPort": "remoteUdpPort",
};
