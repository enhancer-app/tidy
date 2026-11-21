// The only way the planning model reaches the live containers: a declared step or a restart, over a
// unix socket that only the agent container sees. It holds no credentials beyond the key filter.
import { createServer, type Server } from "node:net";
import type { Extra } from "./config";
import { leaksKey } from "./provider";
import { type Session, tail, withOut } from "./sandbox";

export interface Step {
  verb: string;
  args: string[];
}

export const LIMITS = { calls: 60, stepSeconds: 60, output: 8_000, args: 20, argLength: 500, steps: 80, request: 256_000 };

export function parseStep(extra: Extra, raw: unknown): Step | null {
  const { verb, args = [] } = (raw ?? {}) as { verb?: unknown; args?: unknown };
  if (!extra.interactive || typeof verb !== "string" || !Object.hasOwn(extra.interactive.steps, verb)) return null;
  if (!Array.isArray(args) || args.length > LIMITS.args) return null;
  if (!args.every((a) => typeof a === "string" && a.length <= LIMITS.argLength && !a.includes("\0"))) return null;
  return { verb, args };
}

/** The steps a plan gives an interactive extra, or null when any of them is not allowed. */
export function parseSteps(extra: Extra, value: unknown): Step[] | null {
  const steps = (value as { steps?: unknown } | null)?.steps;
  if (!Array.isArray(steps) || !steps.length || steps.length > LIMITS.steps) return null;
  const parsed = steps.map((step) => parseStep(extra, step));
  return parsed.every((step) => step !== null) ? (parsed as Step[]) : null;
}

export const stepCommand = (extra: Extra, step: Step) => [...withOut(extra.interactive!.steps[step.verb]!), ...step.args];

export interface Live {
  extra: Extra;
  session: Session;
}

export class Bridge {
  private calls = 0;

  constructor(
    private readonly live: Live[],
    private readonly keys: Record<string, string>,
  ) {}

  tools(): object[] {
    const names = this.live.map((l) => l.extra.name);
    const verbs = this.live
      .map((l) => `${l.extra.name}: ${Object.entries(l.extra.interactive!.steps).map(([verb, command]) => `${verb} (${command.join(" ")})`).join(", ")}`)
      .join("\n");
    return [
      {
        name: "step",
        description: `Runs one step in the live container of an extra and returns its exit code and output. Available steps:\n${verbs}`,
        inputSchema: {
          type: "object",
          properties: {
            extra: { type: "string", enum: names },
            verb: { type: "string" },
            args: { type: "array", items: { type: "string" }, maxItems: LIMITS.args },
          },
          required: ["extra", "verb"],
        },
      },
      {
        name: "restart",
        description: "Restarts the live container of an extra: processes start again, files and installed packages stay.",
        inputSchema: { type: "object", properties: { extra: { type: "string", enum: names } }, required: ["extra"] },
      },
    ];
  }

  async call(name: unknown, input: unknown): Promise<{ text: string; isError: boolean }> {
    const reply = await this.run(name, input);
    return leaksKey(reply.text, this.keys) ? { text: "The output was withheld because it contained a model key.", isError: true } : reply;
  }

  private async run(name: unknown, input: unknown): Promise<{ text: string; isError: boolean }> {
    const fail = (text: string) => ({ text, isError: true });
    if (++this.calls > LIMITS.calls) return fail(`The limit of ${LIMITS.calls} calls is used up. Write your result now.`);
    if (leaksKey(JSON.stringify(input ?? null), this.keys)) return fail("Refused: the call contained a model key.");
    const request = (input ?? {}) as { extra?: unknown; verb?: unknown; args?: unknown };
    const live = this.live.find((l) => l.extra.name === request.extra);
    if (!live) return fail(`Unknown extra. Use one of: ${this.live.map((l) => l.extra.name).join(", ")}.`);
    let text: string;
    if (name === "restart") {
      try {
        const run = await live.session.restart();
        if (run.code !== 0) return fail(`The restart failed:\n${tail(run.output, LIMITS.output)}`);
        text = "Restarted.";
      } catch (error) {
        this.live.splice(this.live.indexOf(live), 1);
        return fail(`The container was stopped and is no longer available: ${(error as Error).message}`);
      }
    } else if (name === "step") {
      const step = parseStep(live.extra, { verb: request.verb, args: request.args });
      if (!step) {
        const verbs = Object.keys(live.extra.interactive!.steps).join(", ");
        return fail(`Invalid step. Use one of: ${verbs}, with at most ${LIMITS.args} arguments of ${LIMITS.argLength} characters.`);
      }
      const run = await live.session.exec(stepCommand(live.extra, step), LIMITS.stepSeconds);
      text = `${run.code === null ? "stopped at the time limit" : `exit code ${run.code}`}\n${tail(run.output, LIMITS.output)}`;
    } else {
      return fail("Unknown tool.");
    }
    return { text, isError: false };
  }

  /** One JSON request per line; requests run one at a time, in order. */
  listen(path: string): Promise<Server> {
    const server = createServer((socket) => {
      let buffer = "";
      let queue = Promise.resolve();
      socket.on("error", () => {});
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        if (buffer.length > LIMITS.request) return socket.destroy();
        for (let index = buffer.indexOf("\n"); index >= 0; index = buffer.indexOf("\n")) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 1);
          queue = queue.then(async () => {
            if (!socket.destroyed) socket.write(`${JSON.stringify(await this.answer(line))}\n`);
          });
        }
      });
    });
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(path, () => resolve(server));
    });
  }

  private async answer(line: string): Promise<object> {
    let request: { id?: unknown; op?: unknown; name?: unknown; arguments?: unknown };
    try {
      request = JSON.parse(line);
    } catch {
      return { id: null, error: "invalid JSON" };
    }
    const id = typeof request?.id === "number" ? request.id : null;
    if (request?.op === "list") return { id, tools: this.tools() };
    if (request?.op === "call") return { id, ...(await this.call(request.name, request.arguments)) };
    return { id, error: "unknown op" };
  }
}
