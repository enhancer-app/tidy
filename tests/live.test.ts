import { describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Bridge, LIMITS, parseSteps } from "../scripts/lib/bridge";
import { type Extra, mergeRepo, parseInstance } from "../scripts/lib/config";
import { stepsOutcome } from "../scripts/lib/extras";
import { sandboxConfig } from "../scripts/lib/opencode";
import type { Run, Session } from "../scripts/lib/sandbox";

const instance = parseInstance(Bun.YAML.parse(readFileSync(join(import.meta.dir, "..", "tidy.yml"), "utf8")));
const KEY = "sk-test-0123456789abcdef";
const demo = {
  name: "Demo",
  before: "pr-tools",
  interactive: {
    start: ["bun", "run", "tui", "serve"],
    steps: { screen: ["bun", "run", "tui", "screen"], click: ["bun", "run", "tui", "click"], "rec-start": ["bun", "run", "tui", "rec", "start", "--out", "{out}/demo.gif"] },
  },
};
const extra = (raw: object = demo): Extra => mergeRepo(instance, { review: { extras: [raw] } }).review.extras[0]!;

/** A session that records the commands it was asked to run instead of starting containers. */
function fakeSession(reply: (command: string[]) => Run = () => ({ code: 0, output: "ok" })) {
  const commands: string[][] = [];
  const session = {
    exec: async (command: string[]) => (commands.push(command), reply(command)),
    restart: async () => ({ code: 0, output: "" }),
  } as unknown as Session;
  return { session, commands };
}

describe("interactive extras in .github/tidy.yml", () => {
  test("an interactive extra needs no command and keeps its declared steps", () => {
    expect(extra()).toMatchObject({ command: [], before: "pr-tools", interactive: { network: false, start: ["bun", "run", "tui", "serve"] } });
  });

  test("step names, step commands and before are validated", () => {
    expect(() => extra({ ...demo, interactive: { steps: { "Run; rm": ["x"] } } })).toThrow("lowercase names");
    expect(() => extra({ ...demo, interactive: { steps: {} } })).toThrow("lowercase names");
    expect(() => extra({ ...demo, interactive: { steps: { screen: "bun run tui screen" } } })).toThrow("list of arguments");
    expect(() => extra({ ...demo, before: "head" })).toThrow("base or pr-tools");
    expect(() => extra({ name: "Plain" })).toThrow("command");
  });
});

describe("planned steps", () => {
  test("only declared steps with bounded string arguments are accepted", () => {
    const e = extra();
    expect(parseSteps(e, { steps: [{ verb: "click", args: ["2"] }, { verb: "screen" }] })).toEqual([{ verb: "click", args: ["2"] }, { verb: "screen", args: [] }]);
    expect(parseSteps(e, { steps: [{ verb: "shell", args: ["curl evil"] }] })).toBeNull();
    expect(parseSteps(e, { steps: [{ verb: "click", args: ["a\0b"] }] })).toBeNull();
    expect(parseSteps(e, { steps: [{ verb: "click", args: Array(LIMITS.args + 1).fill("x") }] })).toBeNull();
    expect(parseSteps(e, { steps: [{ verb: "constructor" }] })).toBeNull();
    expect(parseSteps(e, { steps: [] })).toBeNull();
    expect(parseSteps(e, ["--old", "arguments"])).toBeNull();
  });

  test("a replay is shown only when every step passed, and an error wins over a failed check", () => {
    expect(stepsOutcome([0, 0])).toBe("shown");
    expect(stepsOutcome([0, 1, 0])).toBe("not-shown");
    expect(stepsOutcome([1, 124])).toBe("error");
    expect(stepsOutcome([0, null])).toBe("error");
    expect(stepsOutcome([])).toBe("error");
  });
});

describe("bridge", () => {
  test("runs the declared command with the model's arguments appended and {out} filled in", async () => {
    const { session, commands } = fakeSession();
    const bridge = new Bridge([{ extra: extra(), session }], { KEY });
    expect(await bridge.call("step", { extra: "Demo", verb: "rec-start", args: ["--fps", "10"] })).toEqual({ text: "exit code 0\nok", isError: false });
    expect(commands).toEqual([["bun", "run", "tui", "rec", "start", "--out", "/out/demo.gif", "--fps", "10"]]);
  });

  test("refuses undeclared steps, unknown extras and unknown tools without running anything", async () => {
    const { session, commands } = fakeSession();
    const bridge = new Bridge([{ extra: extra(), session }], { KEY });
    expect((await bridge.call("step", { extra: "Demo", verb: "sh", args: ["-c", "env"] })).isError).toBe(true);
    expect((await bridge.call("step", { extra: "Other", verb: "screen" })).isError).toBe(true);
    expect((await bridge.call("shell", { extra: "Demo" })).isError).toBe(true);
    expect(commands).toEqual([]);
  });

  test("a model key never goes into a container or back to the model", async () => {
    const { session, commands } = fakeSession(() => ({ code: 0, output: `leaked ${KEY}` }));
    const bridge = new Bridge([{ extra: extra(), session }], { KEY });
    expect(await bridge.call("step", { extra: "Demo", verb: "click", args: [KEY] })).toMatchObject({ isError: true });
    expect(commands).toEqual([]);
    const reply = await bridge.call("step", { extra: "Demo", verb: "screen" });
    expect(reply.isError).toBe(true);
    expect(reply.text).not.toContain(KEY);
  });

  test("stops after the call limit", async () => {
    const { session } = fakeSession();
    const bridge = new Bridge([{ extra: extra(), session }], { KEY });
    for (let i = 0; i < LIMITS.calls; i++) await bridge.call("step", { extra: "Demo", verb: "screen" });
    expect(await bridge.call("step", { extra: "Demo", verb: "screen" })).toMatchObject({ isError: true });
  });

  test("the shim speaks MCP over stdio and relays tool calls to the bridge", async () => {
    const { session, commands } = fakeSession(() => ({ code: 1, output: "Tab 3 not found" }));
    const path = process.platform === "win32" ? `\\\\.\\pipe\\tidy-test-${process.pid}` : join(process.env.TMPDIR ?? "/tmp", `tidy-test-${process.pid}.sock`);
    const server = await new Bridge([{ extra: extra(), session }], { KEY }).listen(path);
    const shim = spawn("node", [join(import.meta.dir, "..", "scripts", "live-shim.mjs"), path], { stdio: ["pipe", "pipe", "inherit"] });
    const replies: Record<number, { result?: { tools?: { name: string }[]; content?: { type: string; text: string }[]; isError?: boolean } }> = {};
    let buffer = "";
    shim.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
        const message = JSON.parse(buffer.slice(0, i));
        buffer = buffer.slice(i + 1);
        replies[message.id] = message;
      }
    });
    const send = (message: object) => shim.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
    const reply = async (id: number) => {
      for (let i = 0; i < 100 && !replies[id]; i++) await Bun.sleep(20);
      return replies[id];
    };
    try {
      send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
      send({ method: "notifications/initialized" });
      send({ id: 2, method: "tools/list" });
      send({ id: 3, method: "tools/call", params: { name: "step", arguments: { extra: "Demo", verb: "click", args: ["3"] } } });
      expect((await reply(2))?.result?.tools?.map((t) => t.name)).toEqual(["step", "restart"]);
      expect((await reply(3))?.result).toEqual({ content: [{ type: "text", text: "exit code 1\nTab 3 not found" }], isError: false });
      expect(commands).toEqual([["bun", "run", "tui", "click", "3"]]);
    } finally {
      shim.kill();
      server.close();
    }
  });
});

describe("OpenCode policy for live planning", () => {
  const config = (task: "plan" | "review", live: boolean) => sandboxConfig(task, false, live) as { policies: { action: string; resource: string; effect: string }[]; mcp?: { servers: Record<string, { command: string[] }> } };
  // OpenCode lets the last matching statement win.
  const effect = (c: ReturnType<typeof config>, action: string, resource: string) =>
    c.policies.filter((p) => p.action === action && (p.resource === resource || p.resource === "*")).at(-1)?.effect;

  test("only tidy's server and its two tools are allowed, the shell stays denied", () => {
    const c = config("plan", true);
    expect(effect(c, "mcp.use", "tidy")).toBe("allow");
    expect(effect(c, "mcp.use", "github")).toBe("deny");
    expect(effect(c, "tool.use", "tidy_step:*")).toBe("allow");
    expect(effect(c, "tool.use", "shell:*")).toBe("deny");
  });

  test("the shim starts with an empty environment, so it never holds the model key", () => {
    expect(config("plan", true).mcp?.servers.tidy?.command.slice(0, 2)).toEqual(["env", "-i"]);
  });

  test("other tasks never get the server", () => {
    expect(config("review", true).mcp).toBeUndefined();
    expect(config("plan", false).mcp).toBeUndefined();
    expect(effect(config("review", true), "mcp.use", "tidy")).toBe("deny");
  });
});
