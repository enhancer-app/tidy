import type { Instance } from "./env";

/** What a model key is for: everything, everything but interactive extra planning, or only that planning. */
export type KeyUse = "all" | "agent" | "plan";
export const KEY_USES: readonly KeyUse[] = ["all", "agent", "plan"];

export interface KeyEntry {
  id: string;
  /** The environment variable OpenCode reads, such as OPENCODE_API_KEY. */
  name: string;
  value: string;
  use: KeyUse;
  updated: string;
  by: string;
}

/** The stored keys as entries; the older maps become "all" (model keys) and "plan" (planning keys). */
export function keyEntries(instance: Pick<Instance, "keys" | "planKeys" | "modelKeys">): KeyEntry[] {
  if (instance.modelKeys) return instance.modelKeys;
  const legacy = (keys: Instance["keys"] | undefined, use: KeyUse) =>
    Object.entries(keys ?? {}).map(([name, key]) => ({ id: `${use}-${name}`, name, use, ...key }));
  return [...legacy(instance.keys, "all"), ...legacy(instance.planKeys, "plan")];
}

/** One value per variable for a role; a key made for that role wins over an "all" key with the same name. */
export function keysFor(entries: KeyEntry[], role: "agent" | "plan"): Record<string, string> {
  const keys: Record<string, string> = {};
  const newest = (a: KeyEntry, b: KeyEntry) => b.updated.localeCompare(a.updated);
  for (const use of [role, "all"] as const) {
    for (const entry of entries.filter((e) => e.use === use).sort(newest)) if (!Object.hasOwn(keys, entry.name)) keys[entry.name] = entry.value;
  }
  return keys;
}

/** The entries a role would get, for the effective keys shown in /admin. */
export function entriesFor(entries: KeyEntry[], role: "agent" | "plan"): KeyEntry[] {
  const chosen = keysFor(entries, role);
  const shown = new Set<string>();
  return entries.filter((e) => chosen[e.name] === e.value && (e.use === role || e.use === "all") && !shown.has(e.name) && shown.add(e.name));
}
