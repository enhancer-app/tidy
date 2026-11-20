// A long-lived container for an interactive extra: root with the network for `setup`, then steps run
// as an unprivileged user with no capabilities and, unless the repository asks, no network.
import { spawn } from "node:child_process";
import type { Extra } from "./config";
import { SETUP_CAPS } from "./extras";

export interface Run {
  /** Null when tidy stopped the command at its time limit. */
  code: number | null;
  output: string;
}

const KEEP = 64_000;

export const tail = (text: string, max: number) => (text.length > max ? `… (output truncated)\n${text.slice(-max)}` : text);
export const withOut = (args: string[]) => args.map((arg) => arg.replaceAll("{out}", "/out"));

/** Runs docker without a shell and keeps the end of its output; `echo` also prints it as it comes. */
export function docker(args: string[], timeoutMs: number, echo = false): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let stopped = false;
    let done = false;
    const keep = (chunk: Buffer) => {
      if (echo) process.stdout.write(chunk);
      output = (output + chunk.toString("utf8")).slice(-KEEP);
    };
    const finish = (code: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ code: stopped ? null : code, output });
    };
    // SIGTERM first, which `docker run` passes on to the container.
    const timer = setTimeout(() => {
      stopped = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    }, timeoutMs);
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("error", (error) => {
      output += error.message;
      finish(null);
    });
    child.on("close", finish);
  });
}

export interface SessionOptions {
  name: string;
  image: string;
  work: string;
  out: string;
  /** The base checkout, mounted at /base for extras whose Before uses the pull request's tools. */
  base?: string;
  side: "after" | "before";
  /** uid:gid the steps run as. */
  user: string;
  network: boolean;
  start: string[];
  /** Docker's --memory, lower when several sessions share the runner. */
  memory: string;
}

// A bridge network without inter-container traffic, so pull request code cannot reach the agent container.
export const EXTRAS_NETWORK = "tidy-extras";

async function ensureNetwork(): Promise<void> {
  if ((await docker(["network", "inspect", EXTRAS_NETWORK], 30_000)).code === 0) return;
  const run = await docker(["network", "create", "-o", "com.docker.network.bridge.enable_icc=false", EXTRAS_NETWORK], 30_000);
  if (run.code !== 0) throw new Error(`Could not create the ${EXTRAS_NETWORK} network: ${run.output}`);
}

export class Session {
  constructor(readonly options: SessionOptions) {}

  async start(timeoutMs: number): Promise<Run> {
    const o = this.options;
    await ensureNetwork();
    return docker(
      [
        "run", "-d", "--init", "--name", o.name, "--network", EXTRAS_NETWORK,
        "--cap-drop", "ALL", ...SETUP_CAPS.flatMap((cap) => ["--cap-add", cap]),
        "--security-opt", "no-new-privileges", "--pids-limit", "1024", "--memory", o.memory,
        "-e", "CI=true", "-e", `TIDY_SIDE=${o.side}`,
        ...(o.base ? ["-e", "TIDY_BASE=/base", "-v", `${o.base}:/base`] : []),
        "-v", `${o.work}:/work`, "-v", `${o.out}:/out`, "-w", "/work",
        "--entrypoint", "sleep", o.image, "infinity",
      ],
      timeoutMs,
    );
  }

  setup(script: string, timeoutMs: number): Promise<Run> {
    return docker(["exec", this.options.name, "bash", "-c", `set -e\n${script}`], timeoutMs);
  }

  /** Gives the mounted folders to the step user, since setup may have written them as root. */
  async handOver(): Promise<void> {
    const dirs = ["/work", "/out", ...(this.options.base ? ["/base"] : [])];
    const run = await docker(["exec", this.options.name, "chown", "-R", this.options.user, ...dirs], 5 * 60_000);
    if (run.code !== 0) throw new Error(`Could not hand the folders to the step user: ${run.output}`);
  }

  /** Disconnects every network and fails closed if one is left, so steps reach nothing but loopback. */
  async isolate(): Promise<void> {
    if (this.options.network) return;
    const networks = async () => {
      const run = await docker(["inspect", "-f", "{{json .NetworkSettings.Networks}}", this.options.name], 30_000);
      return Object.keys((JSON.parse(run.output.trim()) as Record<string, unknown> | null) ?? {});
    };
    for (const network of await networks()) await docker(["network", "disconnect", "--force", network, this.options.name], 30_000);
    const left = await networks();
    if (left.length) throw new Error(`Could not disconnect ${this.options.name} from ${left.join(", ")}`);
  }

  async launch(): Promise<void> {
    if (!this.options.start.length) return;
    const run = await docker(["exec", "-d", ...this.asUser(), this.options.name, ...withOut(this.options.start)], 30_000);
    if (run.code !== 0) throw new Error(`Could not start ${this.options.start.join(" ")}: ${run.output}`);
  }

  /** `timeout` runs inside the container, so the step stops even though killing `docker exec` would not stop it. */
  exec(command: string[], seconds: number): Promise<Run> {
    return docker(["exec", ...this.asUser(), this.options.name, "timeout", "-k", "5", String(seconds), ...command], (seconds + 15) * 1000);
  }

  async restart(): Promise<Run> {
    const run = await docker(["restart", "-t", "1", this.options.name], 60_000);
    try {
      await this.isolate();
      if (run.code === 0) await this.launch();
    } catch (error) {
      await this.stop();
      throw error;
    }
    return run;
  }

  stop(): Promise<Run> {
    return docker(["rm", "-f", this.options.name], 60_000);
  }

  private asUser(): string[] {
    return ["--user", this.options.user, "-e", "HOME=/tmp"];
  }
}

/** Starts a session and runs setup by `deadline`; on failure the container is removed and the reason returned. */
export async function openSession(extra: Extra, options: SessionOptions, deadline: number): Promise<{ session: Session; error?: string; log: string }> {
  const session = new Session(options);
  const left = () => Math.max(deadline - Date.now(), 1_000);
  const started = await session.start(left()).catch((error: Error) => ({ code: 1, output: error.message }));
  if (started.code !== 0) {
    await session.stop();
    return { session, error: "the container did not start", log: started.output };
  }
  const setup = await session.setup(extra.setup, left());
  if (setup.code !== 0) {
    await session.stop();
    return { session, error: setup.code === null ? "setup timed out" : `setup exited with ${setup.code}`, log: setup.output };
  }
  // Setup ran pull request code as root; a restart ends anything it left running in the background.
  const reset = await docker(["restart", "-t", "1", options.name], 60_000);
  if (reset.code !== 0) {
    await session.stop();
    return { session, error: "the container did not restart after setup", log: `${setup.output}\n${reset.output}` };
  }
  try {
    await session.handOver();
    await session.isolate();
    await session.launch();
  } catch (error) {
    await session.stop();
    return { session, error: (error as Error).message, log: setup.output };
  }
  return { session, log: setup.output };
}
