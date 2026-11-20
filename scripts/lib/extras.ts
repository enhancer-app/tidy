/** How one side of a review extra ended. */
export type Outcome = "shown" | "not-shown" | "error";

export interface Verdict {
  after: Outcome;
  before: Outcome;
}

// Enough for apt and package managers running as root; container escapes usually need more.
export const SETUP_CAPS = ["CHOWN", "DAC_OVERRIDE", "FOWNER", "FSETID", "KILL", "SETGID", "SETUID"];

export const extraSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// The contract in docs/extras.md: 0 shows the behaviour, 1 does not, anything else is a broken run.
export function outcome(code: number | null): Outcome {
  return code === 0 ? "shown" : code === 1 ? "not-shown" : "error";
}

/** One side of a replayed interactive extra: any broken step makes it an error, any failed check "not-shown". */
export function stepsOutcome(codes: (number | null)[]): Outcome {
  const outcomes = codes.map(outcome);
  if (!outcomes.length || outcomes.includes("error")) return "error";
  return outcomes.includes("not-shown") ? "not-shown" : "shown";
}

/** Why Before and After should not be attached, or null when they differ the way the pull request claims. */
export function withheldReason(verdict: Verdict): string | null {
  if (verdict.after === "error") return "The demo could not run on this pull request, so no files are attached.";
  if (verdict.after === "not-shown") return "The demo did not show the change on this pull request, so no files are attached.";
  if (verdict.before === "error") return "The demo could not run on the base branch, so there is nothing to compare and no files are attached.";
  if (verdict.before === "shown") return "The demo passed on the base branch too, so it does not show a change and no files are attached.";
  return null;
}

export function parseVerdict(value: unknown): Verdict | null {
  const v = value as Partial<Verdict> | null;
  const valid = (o: unknown): o is Outcome => o === "shown" || o === "not-shown" || o === "error";
  return v && valid(v.after) && valid(v.before) ? { after: v.after, before: v.before } : null;
}
