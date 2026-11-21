import { describe, expect, test } from "bun:test";
import { entriesFor, type KeyEntry, keyEntries, keysFor } from "../worker/keys";
import { modelKeys } from "../worker/token";

const entry = (id: string, name: string, value: string, use: KeyEntry["use"], updated = "2026-11-01"): KeyEntry => ({ id, name, value, use, updated, by: "igor" });

describe("model keys by use", () => {
  test("by default one key serves everything, interactive planning included", () => {
    const entries = [entry("a", "OPENCODE_API_KEY", "main", "all")];
    expect(keysFor(entries, "agent")).toEqual({ OPENCODE_API_KEY: "main" });
    expect(keysFor(entries, "plan")).toEqual({ OPENCODE_API_KEY: "main" });
  });

  test("a key made for a role wins over an all key with the same name", () => {
    const entries = [entry("a", "OPENCODE_API_KEY", "main", "all"), entry("b", "OPENCODE_API_KEY", "cheap", "plan")];
    expect(keysFor(entries, "plan")).toEqual({ OPENCODE_API_KEY: "cheap" });
    expect(keysFor(entries, "agent")).toEqual({ OPENCODE_API_KEY: "main" });
  });

  test("a main-only key never reaches interactive planning, and a planning-only key never reaches the agent", () => {
    const entries = [entry("a", "OPENCODE_API_KEY", "main", "agent"), entry("b", "OPENROUTER_API_KEY", "cheap", "plan")];
    expect(keysFor(entries, "plan")).toEqual({ OPENROUTER_API_KEY: "cheap" });
    expect(keysFor(entries, "agent")).toEqual({ OPENCODE_API_KEY: "main" });
    expect(keysFor([entry("a", "OPENCODE_API_KEY", "main", "agent")], "plan")).toEqual({});
  });

  test("one value per variable, the newest when two share a use", () => {
    const entries = [entry("a", "OPENCODE_API_KEY", "old", "all", "2026-10-01"), entry("b", "OPENCODE_API_KEY", "new", "all", "2026-11-01")];
    expect(keysFor(entries, "agent")).toEqual({ OPENCODE_API_KEY: "new" });
  });

  test("the older maps become all and plan entries until the next save", () => {
    const key = (value: string) => ({ value, updated: "2026-11-01", by: "igor" });
    const instance = { keys: { OPENCODE_API_KEY: key("main") }, planKeys: { OPENROUTER_API_KEY: key("cheap") } };
    expect(keyEntries(instance).map((e) => [e.name, e.use])).toEqual([["OPENCODE_API_KEY", "all"], ["OPENROUTER_API_KEY", "plan"]]);
    expect(modelKeys(instance, "plan")).toEqual({ OPENCODE_API_KEY: "main", OPENROUTER_API_KEY: "cheap" });
    // Once saved, only the entries count.
    expect(modelKeys({ ...instance, modelKeys: [] }, "agent")).toEqual({});
  });

  test("/admin shows which entries each role gets", () => {
    const entries = [entry("a", "OPENCODE_API_KEY", "main", "all"), entry("b", "OPENCODE_API_KEY", "cheap", "plan")];
    expect(entriesFor(entries, "plan").map((e) => e.id)).toEqual(["b"]);
    expect(entriesFor(entries, "agent").map((e) => e.id)).toEqual(["a"]);
  });
});
