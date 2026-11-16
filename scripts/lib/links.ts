import { lstatSync, readdirSync, readlinkSync, unlinkSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

/**
 * Removes symlinks that point outside `root`. A pull request can add one to /proc/self/environ, and the
 * agent's read policy checks the link's path, not its target, so the model key could be read through it.
 * Absolute targets are removed too: inside the container they would resolve somewhere else.
 */
export function dropEscapingLinks(root: string): string[] {
  const removed: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = readlinkSync(path);
        const inside = !isAbsolute(target) && !relative(root, resolve(dir, target)).startsWith("..");
        if (!inside) {
          unlinkSync(path);
          removed.push(relative(root, path));
        }
      } else if (entry.isDirectory() && !lstatSync(path).isSymbolicLink()) {
        walk(path);
      }
    }
  };
  walk(root);
  return removed;
}
