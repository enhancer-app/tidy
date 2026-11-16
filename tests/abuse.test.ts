import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dropEscapingLinks } from "../scripts/lib/links";
import { secretWorkflows } from "../scripts/lib/workflows";
import { keyName } from "../worker/admin";

let root: string;
afterEach(() => root && rmSync(root, { recursive: true, force: true }));

describe("symlinks in pull request code", () => {
  test.skipIf(process.platform === "win32")("links out of the repository are removed, links inside it stay", () => {
    root = mkdtempSync(join(tmpdir(), "tidy-links-"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "a.ts"), "x");
    symlinkSync("/proc/self/environ", join(root, "env"));
    symlinkSync("../../etc/passwd", join(root, "src", "up"));
    symlinkSync("a.ts", join(root, "src", "alias"));
    expect(dropEscapingLinks(root).sort()).toEqual(["env", join("src", "up")].sort());
    expect(existsSync(join(root, "src", "alias"))).toBe(true);
  });
});

describe("workflows that give GITHUB_TOKEN write access", () => {
  test("count like a secret, so outside fixes wait for approval", () => {
    const text = "on: [pull_request]\npermissions:\n  contents: write\njobs:\n  t:\n    steps:\n      - run: bun test\n";
    expect(secretWorkflows([{ path: "w.yml", text }])).toEqual(["w.yml"]);
    expect(secretWorkflows([{ path: "w.yml", text: text.replace("write", "read") }])).toEqual([]);
  });
});

describe("model key names in /admin", () => {
  test("names that would change how the agent runs are refused", () => {
    for (const name of ["PATH", "NODE_OPTIONS", "LD_PRELOAD", "OPENCODE_CONFIG_CONTENT", "NPM_CONFIG_REGISTRY", "BUN_INSTALL"]) {
      expect(keyName("other", name)).toBeNull();
    }
    expect(keyName("other", "OPENCODE_API_KEY")).toBe("OPENCODE_API_KEY");
    expect(keyName("other", "DEEPSEEK_API_KEY")).toBe("DEEPSEEK_API_KEY");
  });
});
