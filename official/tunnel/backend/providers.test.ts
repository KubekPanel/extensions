import { describe, expect, test } from "bun:test";
import { mergeConfig } from "./index";
import { defaultConfig } from "./manager";
import { frpcConfig } from "./providers/frp";
import { ENDPOINT_NAME, gateConfig } from "./providers/minekube";
import { pinggyArgs } from "./providers/pinggy";
import { bedrockPort, javaPort } from "./providers/types";

describe("ports", () => {
  const ports = [
    { key: "game", port: 25565, protocol: "tcp" as const, primary: true },
    { key: "bedrock", port: 19132, protocol: "udp" as const, primary: false },
  ];
  test("picks the java and bedrock ports", () => {
    expect(javaPort(ports)?.port).toBe(25565);
    expect(bedrockPort(ports)?.port).toBe(19132);
    expect(bedrockPort([ports[0]!])).toBeUndefined();
  });
});

describe("minekube", () => {
  test("endpoint names", () => {
    expect(ENDPOINT_NAME.test("my-server")).toBe(true);
    expect(ENDPOINT_NAME.test("ab")).toBe(false);
    expect(ENDPOINT_NAME.test("-bad")).toBe(false);
    expect(ENDPOINT_NAME.test("Bad")).toBe(false);
  });
  test("gate forwards to the server on loopback", () => {
    const yml = gateConfig("my-server", 40000, 25565);
    expect(yml).toContain("bind: 127.0.0.1:40000");
    expect(yml).toContain("server: 127.0.0.1:25565");
    expect(yml).toContain("name: my-server");
  });
});

describe("pinggy", () => {
  test("free and pro users", () => {
    expect(pinggyArgs("", 25565, "/k", "/id").at(-1)).toBe("tcp@a.pinggy.io");
    expect(pinggyArgs("tok", 25565, "/k", "/id").at(-1)).toBe("tok+tcp@a.pinggy.io");
    expect(pinggyArgs("", 25565, "/k", "/id")).toContain("-R0:127.0.0.1:25565");
    expect(pinggyArgs("", 25565, "/k", "/id")).toContain("/id");
  });
});

describe("frp", () => {
  const frp = { serverAddr: "vps.example.com", serverPort: 7000, token: 'a"b', remotePort: 25565, remoteUdpPort: 19132 };
  test("tcp and udp proxies with an escaped token", () => {
    const toml = frpcConfig("12345678-aaaa", frp, 25565, 19132);
    expect(toml).toContain('auth.token = "a\\"b"');
    expect(toml).toContain('name = "kubek-12345678-java"');
    expect(toml).toContain('type = "udp"');
  });
  test("no udp proxy without a bedrock port", () => {
    expect(frpcConfig("12345678", frp, 25565)).not.toContain('type = "udp"');
  });
});

describe("mergeConfig", () => {
  test("an empty secret keeps the saved one", () => {
    const saved = { ...defaultConfig(), pinggy: { token: "old" } };
    expect(mergeConfig(saved, { pinggy: { token: "" } }).pinggy.token).toBe("old");
    expect(mergeConfig(saved, { pinggy: { token: "new" } }).pinggy.token).toBe("new");
    expect(mergeConfig(saved, { pinggy: { clearToken: true } }).pinggy.token).toBe("");
  });
  test("ignores unknown providers", () => {
    expect(mergeConfig(defaultConfig(), { provider: "evil" }).provider).toBe("minekube");
  });
});
