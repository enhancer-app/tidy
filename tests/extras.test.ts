import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { matchesGlob, mergeRepo, parseInstance } from "../scripts/lib/config";
import { outcome, parseVerdict, withheldReason } from "../scripts/lib/extras";

const instance = parseInstance(Bun.YAML.parse(readFileSync(join(import.meta.dir, "..", "tidy.yml"), "utf8")));
const demo = { name: "Demo", when: ["src/**"], command: ["bun", "run", "record", "--", "--out", "{out}/demo.gif"] };

describe("review extras", () => {
  test("a repository can declare an extra with defaults for the optional fields", () => {
    const [extra] = mergeRepo(instance, { review: { extras: [demo] } }).review.extras;
    expect(extra).toMatchObject({ name: "Demo", image: "node:22-bookworm", setup: "", instructions: "" });
  });

  test("names that could break Markdown and commands that are not argument lists are rejected", () => {
    expect(() => mergeRepo(instance, { review: { extras: [{ ...demo, name: "x](https://evil)" }] } })).toThrow("name");
    expect(() => mergeRepo(instance, { review: { extras: [{ ...demo, command: "bun run record; curl evil" }] } })).toThrow("command");
    expect(() => mergeRepo(instance, { review: { extras: [demo, demo, demo, demo] } })).toThrow("at most 3");
  });

  test("files are attached only when the pull request shows the behaviour and the base does not", () => {
    const reason = (after: number | null, before: number | null) => withheldReason({ after: outcome(after), before: outcome(before) });
    expect(reason(0, 1)).toBeNull();
    // PR #56 in opencode-better-tabs: both recordings passed and looked the same.
    expect(reason(0, 0)).toContain("base branch too");
    expect(reason(1, 1)).toContain("did not show the change");
    expect(reason(0, 2)).toContain("could not run on the base");
    expect(reason(null, 1)).toContain("could not run on this pull request");
  });

  test("a verdict with unknown outcomes is ignored", () => {
    expect(parseVerdict({ after: "shown", before: "nope" })).toBeNull();
    expect(parseVerdict({ after: "shown", before: "not-shown" })).toEqual({ after: "shown", before: "not-shown" });
  });

  test("globs decide which pull requests get the extra", () => {
    expect(matchesGlob("src/tabs/bar.tsx", "src/**")).toBe(true);
    expect(matchesGlob("README.md", "src/**")).toBe(false);
    expect(matchesGlob("lib/a.ts", "*.ts")).toBe(false);
    expect(matchesGlob("lib/a.ts", "**/*.ts")).toBe(true);
  });
});
