// Runs the repository's checks and review extras on pull request code. This job holds no credentials at all.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "./lib/actions";
import { LIMITS, parseSteps, type Step, stepCommand } from "./lib/bridge";
import type { Extra } from "./lib/config";
import { extraSlug, outcome, SETUP_CAPS, stepsOutcome, type Verdict } from "./lib/extras";
import { openSession, tail, withOut } from "./lib/sandbox";
import type { Meta } from "./gate";

const MAX_OUTPUT = 15_000;
// Below the job's 30-minute timeout, so the output is always uploaded for the review.
const BUDGET = 25 * 60_000;
const temp = env("RUNNER_TEMP");
const meta = JSON.parse(readFileSync(join(temp, "context", "meta.json"), "utf8")) as Meta;
const out = join(temp, "checks");
const started = Date.now();
const left = () => BUDGET - (Date.now() - started);
const user = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
const sandbox = ["--security-opt", "no-new-privileges", "--pids-limit", "2048", "--memory", "8g", "-e", "CI=true"];
const sections: string[] = [`Checks for ${meta.repo}#${meta.number} at ${meta.base}, run without secrets.\n`];

function copy(from: string, name: string): string {
  const dir = join(temp, name);
  cpSync(join(temp, "context", from), dir, { recursive: true, verbatimSymlinks: true });
  return dir;
}

function run(args: string[]): { status: string; code: number | null; tail: string } {
  if (left() <= 0) return { status: "skipped: the 25 minute budget ran out", code: null, tail: "" };
  const result = spawnSync("docker", ["run", "--rm", "--init", ...sandbox, ...args], { encoding: "utf8", timeout: left(), maxBuffer: 64 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const tail = output.length > MAX_OUTPUT ? `… (output truncated)\n${output.slice(-MAX_OUTPUT)}` : output;
  if (result.error) return { status: `stopped: ${result.error.message}`, code: null, tail };
  return { status: `exit code ${result.status}`, code: result.status, tail };
}

const block = (text: string) => `\`\`\`\`text\n${text.replace(/````/g, "'''")}\n\`\`\`\``;

const work = copy("source", "checks-work");
for (const command of meta.config.review.checks) {
  // Without capabilities, root cannot write to the runner-owned checkout; the runner's user can.
  const { status, tail } = run([
    "--user", user, "--cap-drop", "ALL",
    "-e", "HOME=/tmp/home", "-e", "NPM_CONFIG_PREFIX=/tmp/npm", "-e", "PATH=/tmp/npm/bin:/usr/local/bin:/usr/bin:/bin",
    "-v", `${work}:/work`, "-w", "/work",
    meta.config.review.image,
    "bash", "-c", `mkdir -p "$HOME"; command -v bun > /dev/null || npm install --global --loglevel=error bun > /dev/null; ${command}`,
  ]);
  console.log(`${command}: ${status}`);
  sections.push(`## \`${command}\` (${status})\n\n${block(tail)}`);
}

/** Runs a plain extra's command once, as root with the network, so `setup` can install packages. */
function runCommand(extra: Extra, args: string[], side: Side, dir: string, base: string | undefined, target: string) {
  const { status, code, tail } = run([
    // Root may install packages, but without the capabilities a container escape would lean on.
    "--cap-drop", "ALL", ...SETUP_CAPS.flatMap((cap) => ["--cap-add", cap]),
    "-e", `TIDY_SIDE=${side}`, ...(base ? ["-e", "TIDY_BASE=/base", "-v", `${base}:/base`] : []),
    "-v", `${dir}:/work`, "-v", `${target}:/out`, "-w", "/work",
    extra.image,
    // The setup line comes from the default branch; the arguments are passed as a list, never parsed by a shell.
    "bash", "-c", `set -e\n${extra.setup}\nexec "$@"`, "bash", ...withOut(extra.command), ...args,
  ]);
  return { status: `${status}: ${outcome(code)}`, outcome: outcome(code), log: `Arguments: ${block(JSON.stringify(args))}\n\n${block(tail)}` };
}

/** Replays the planned steps in a fresh session: setup with the network, then steps without it. */
async function replay(extra: Extra, steps: Step[], side: Side, dir: string, base: string | undefined, target: string) {
  const { session, error, log } = await openSession(
    extra,
    {
      name: `tidy-replay-${extraSlug(extra.name)}-${side}`, image: extra.image, work: dir, out: target, base, side, user,
      network: extra.interactive!.network, start: extra.interactive!.start, memory: "8g",
    },
    started + BUDGET,
  );
  if (error) return { status: `${error}: error`, outcome: "error" as const, log: block(tail(log, MAX_OUTPUT)) };
  const codes: (number | null)[] = [];
  const lines: string[] = [];
  try {
    for (const step of steps) {
      if (left() <= 0) {
        codes.push(null);
        lines.push("Stopped: the 25 minute budget ran out.");
        break;
      }
      const result = await session.exec(stepCommand(extra, step), LIMITS.stepSeconds);
      codes.push(result.code);
      lines.push(`$ ${step.verb} ${JSON.stringify(step.args)}: ${result.code === null ? "stopped at the time limit" : `exit code ${result.code}`}\n${tail(result.output, 1_500)}`);
    }
  } finally {
    await session.stop();
  }
  const result = stepsOutcome(codes);
  return { status: `${steps.length} steps: ${result}`, outcome: result, log: block(tail(lines.join("\n\n"), MAX_OUTPUT)) };
}

type Side = "after" | "before";

// Extras run in containers that have no secrets and see only their own checkouts and output folder.
const planFile = join(temp, "plan", "plan.json");
const runs: Record<string, unknown> = existsSync(planFile) ? JSON.parse(readFileSync(planFile, "utf8")).runs ?? {} : {};
const planned = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 40 && value.every((a) => typeof a === "string" && a.length <= 500 && !a.includes("\0"));
for (const extra of meta.config.review.extras.filter((e) => runs[e.name])) {
  const slug = extraSlug(extra.name);
  // The plan comes from the job that held a model key, so it is checked again here.
  const steps = extra.interactive ? parseSteps(extra, runs[extra.name]) : null;
  const args = extra.interactive ? null : runs[extra.name];
  if (!steps && !planned(args)) {
    console.error(`Ignoring an invalid plan for ${extra.name}`);
    continue;
  }
  const verdict: Partial<Verdict> = {};
  for (const side of ["after", "before"] as const) {
    // With pr-tools, Before runs the pull request's tools against the base code mounted at /base.
    const tools = side === "after" || extra.before === "pr-tools" ? "source" : "base";
    const dir = copy(tools, `extra-${slug}-${side}`);
    const base = side === "before" && extra.before === "pr-tools" ? copy("base", `extra-${slug}-base`) : undefined;
    const target = join(out, "extras", slug, side);
    mkdirSync(target, { recursive: true });
    const result = steps ? await replay(extra, steps, side, dir, base, target) : runCommand(extra, args as string[], side, dir, base, target);
    verdict[side] = result.outcome;
    spawnSync("sudo", ["chown", "-R", user, target]);
    const files = readdirSync(target).map((f) => `${f} (${Math.round(lstatSync(join(target, f)).size / 1024)} KB)`);
    const where = side === "after" ? "this pull request" : `the base branch (${meta.defaultBranch} at ${meta.extrasBase.slice(0, 7)})`;
    const how = side === "before" && extra.before === "pr-tools" ? ", recorded with the pull request's tools" : "";
    console.log(`${extra.name} on ${side}: ${result.status}`);
    sections.push(`## Extra "${extra.name}" on ${where}${how} (${result.status})\n\nFiles: ${files.join(", ") || "none"}\n\n${result.log}`);
  }
  // Outside the folders the containers write to, so pull request code cannot forge it.
  writeFileSync(join(out, "extras", slug, "verdict.json"), JSON.stringify(verdict));
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "checks.md"), sections.join("\n\n"));
