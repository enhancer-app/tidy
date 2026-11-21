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

/**
 * Setup runs as root in its own container, which is then committed to an image. Steps run in a new
 * container from that image that starts as the unprivileged user, so nothing setup left behind runs as root.
 */
export class Session {
  private readonly setupName: string;
  private readonly snapshot: string;

  constructor(readonly options: SessionOptions) {
    this.setupName = `${options.name}-setup`;
    this.snapshot = `tidy-session/${options.name}`;
  }

  private mounts(): string[] {
    const o = this.options;
    return [
      "-e", "CI=true", "-e", `TIDY_SIDE=${o.side}`,
      ...(o.base ? ["-e", "TIDY_BASE=/base", "-v", `${o.base}:/base`] : []),
      "-v", `${o.work}:/work`, "-v", `${o.out}:/out`, "-w", "/work",
      "--security-opt", "no-new-privileges", "--pids-limit", "1024", "--memory", o.memory,
    ];
  }

  /** Runs setup by `deadline` and starts the step container; returns why it failed, if it did. */
  async prepare(script: string, deadline: number): Promise<{ error?: string; log: string }> {
    const left = () => Math.max(deadline - Date.now(), 1_000);
    const o = this.options;
    try {
      await ensureNetwork();
    } catch (error) {
      return { error: (error as Error).message, log: "" };
    }
    const created = await docker(
      ["run", "-d", "--init", "--name", this.setupName, "--network", EXTRAS_NETWORK,
        "--cap-drop", "ALL", ...SETUP_CAPS.flatMap((cap) => ["--cap-add", cap]), ...this.mounts(),
        "--entrypoint", "sleep", o.image, "infinity"],
      left(),
    );
    if (created.code !== 0) return { error: "the container did not start", log: created.output };
    const setup = await docker(["exec", this.setupName, "bash", "-c", `set -e\n${script}`], left());
    if (setup.code !== 0) return { error: setup.code === null ? "setup timed out" : `setup exited with ${setup.code}`, log: setup.output };
    // Setup may have written the mounted folders as root.
    const dirs = ["/work", "/out", ...(o.base ? ["/base"] : [])];
    const owned = await docker(["exec", this.setupName, "chown", "-R", o.user, ...dirs], 5 * 60_000);
    if (owned.code !== 0) return { error: "could not hand the folders to the step user", log: `${setup.output}\n${owned.output}` };
    const committed = await docker(["commit", this.setupName, this.snapshot], 5 * 60_000);
    await docker(["rm", "-f", this.setupName], 60_000);
    if (committed.code !== 0) return { error: "could not save the container after setup", log: `${setup.output}\n${committed.output}` };
    const started = await docker(
      ["run", "-d", "--init", "--name", o.name, "--user", o.user, "--cap-drop", "ALL",
        "--network", o.network ? EXTRAS_NETWORK : "none", "-e", "HOME=/tmp", ...this.mounts(),
        "--entrypoint", "sleep", this.snapshot, "infinity"],
      60_000,
    );
    if (started.code !== 0) return { error: "the step container did not start", log: `${setup.output}\n${started.output}` };
    try {
      await this.checkIsolated();
      await this.launch();
    } catch (error) {
      return { error: (error as Error).message, log: setup.output };
    }
    return { log: setup.output };
  }

  /** Fails closed unless a container without network is attached to nothing but "none". */
  private async checkIsolated(): Promise<void> {
    if (this.options.network) return;
    const run = await docker(["inspect", "-f", "{{json .NetworkSettings.Networks}}", this.options.name], 30_000);
    const networks = Object.keys((JSON.parse(run.output.trim()) as Record<string, unknown> | null) ?? {});
    if (networks.some((n) => n !== "none")) throw new Error(`The step container is attached to ${networks.join(", ")}`);
  }

  private async launch(): Promise<void> {
    if (!this.options.start.length) return;
    const run = await docker(["exec", "-d", ...this.asUser(), this.options.name, ...withOut(this.options.start)], 30_000);
    if (run.code !== 0) throw new Error(`Could not start ${this.options.start.join(" ")}: ${run.output}`);
  }

  /**
   * `timeout` runs inside the container, so the step stops even though killing `docker exec` would not stop it.
   * A failure from a container that is no longer running is the tool breaking, not a failed check.
   */
  async exec(command: string[], seconds: number): Promise<Run> {
    const run = await docker(["exec", ...this.asUser(), this.options.name, "timeout", "-k", "5", String(seconds), ...command], (seconds + 15) * 1000);
    if (run.code === 0) return run;
    const state = await docker(["inspect", "-f", "{{.State.Running}}", this.options.name], 30_000);
    return state.output.trim() === "true" ? run : { code: null, output: `${run.output}\nThe container is no longer running.` };
  }

  async restart(): Promise<Run> {
    const run = await docker(["restart", "-t", "1", this.options.name], 60_000);
    try {
      await this.checkIsolated();
      if (run.code === 0) await this.launch();
    } catch (error) {
      await this.stop();
      throw error;
    }
    return run;
  }

  async stop(): Promise<void> {
    await docker(["rm", "-f", this.options.name, this.setupName], 60_000);
    await docker(["rmi", "-f", this.snapshot], 60_000);
  }

  private asUser(): string[] {
    return ["--user", this.options.user, "-e", "HOME=/tmp"];
  }
}

/** Prepares a session; on failure its containers are removed and the reason returned. */
export async function openSession(extra: Extra, options: SessionOptions, deadline: number): Promise<{ session: Session; error?: string; log: string }> {
  const session = new Session(options);
  const { error, log } = await session.prepare(extra.setup, deadline);
  if (error) await session.stop();
  return { session, error, log };
}
