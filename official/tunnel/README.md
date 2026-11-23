# Tunnel

**English** · [Русский](README.ru.md)

Lets friends join a server hosted at home without port forwarding. Adds a **Tunnel** card next to the server
console: click it, pick a provider, turn the tunnel on and copy the address from the card. The tunnel opens when the server starts and
closes when it stops.

| Provider | Price | Address | Bedrock |
|---|---|---|---|
| [Minekube Connect](https://connect.minekube.com) | free | `name.play.minekube.net`, no port | no |
| [Pinggy](https://pinggy.io) | free for an hour at a time, Pro keeps the address | `host:port`, changes every hour on free | no |
| Your own [frp](https://github.com/fatedier/frp) server | your VPS | `your-vps:port` | yes |

## Before you use it

- **Minekube Connect** runs [Gate](https://github.com/minekube/gate) in front of the server. Gate checks
  accounts itself, so the server needs `online-mode=false`. Players get offline UUIDs: on a server that ran
  in online mode their inventories and progress start over. Anyone who reaches the server port directly,
  for example from your local network, can join under any name.
- **Pinggy** goes through the system `ssh`, it must be installed on the panel host (the Docker image has it).
  The free plan closes the tunnel every hour, it reopens with a new address.
- **frp** needs `frps` on your server with the remote ports allowed and the same token:
  ```toml
  bindPort = 7000
  auth.method = "token"
  auth.token = "CHANGE_ME"
  allowPorts = [ { single = 25565 }, { single = 19132 } ]
  ```

## Permissions

- `process:spawn` runs Gate, frpc or ssh from the extension folder. The panel stops them when the extension
  is disabled
- `http:outbound` downloads Gate and frpc from their GitHub releases on first use. Versions are pinned and
  checked by sha256
- `servers:read` and `events:server` find the server port and follow starts and stops
- `http:routes` and `storage` keep the settings per server, tokens never go back to the browser

Users need the **Open servers to the internet** permission and access to the server.

## Limits

- One tunnel per server
- Minekube and Pinggy are Java only
- Needs Kubek 4.1.3 or newer
