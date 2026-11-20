import { parse } from "yaml";
import { type ThreadReplies, threadReplies } from "./replies";

/** Run limits the Worker enforces before it starts a workflow. Set them under `limits:` in tidy.yml. */
export interface RunLimits {
  /** Workflow runs per UTC day across the instance, for everyone. */
  runs_per_day: number;
  /** Workflow runs per UTC day in one repository, for everyone. */
  runs_per_repo_per_day: number;
  /** Events (issues, pull requests, pushes, thread replies) per UTC day from one person without write access. */
  outsider_events_per_day: number;
  /** Follow-up reviews per UTC day on one pull request by someone without write access. */
  outsider_pushes_per_pr_per_day: number;
}

export const DEFAULT_LIMITS: RunLimits = {
  runs_per_day: 300,
  runs_per_repo_per_day: 100,
  outsider_events_per_day: 10,
  outsider_pushes_per_pr_per_day: 6,
};

/** Who and what the Worker serves. */
export interface Access {
  /** Accounts whose repositories tidy works in; empty means only the App's owner. */
  allowed_owners: string[];
  /** Whether tidy works in private repositories when its own repository, and so its logs, are public. */
  private_repos: boolean;
}

export interface WorkerSettings {
  limits: RunLimits;
  access: Access;
  /** The instance default for `review.thread_replies`; a repository's .github/tidy.yml can change it. */
  thread_replies: ThreadReplies;
}

/**
 * Reads the settings the Worker needs from tidy.yml. The Worker runs on workerd, where Bun.YAML does not
 * exist, so this uses the `yaml` package. A value of the wrong type keeps its default.
 */
export function parseWorkerSettings(text: string): WorkerSettings {
  const doc = (parse(text) ?? {}) as { limits?: Record<string, unknown>; allowed_owners?: unknown; private_repos?: unknown; review?: { thread_replies?: unknown } };
  const limits = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(limits) as (keyof RunLimits)[]) {
    const value = doc.limits?.[key];
    if (Number.isInteger(value) && (value as number) >= 0) limits[key] = value as number;
  }
  const owners = Array.isArray(doc.allowed_owners) ? doc.allowed_owners : [];
  return {
    limits,
    access: {
      allowed_owners: owners
        .filter((o): o is string => typeof o === "string")
        .map((o) => o.toLowerCase())
        .filter((o) => /^[a-z0-9-]{1,39}$/.test(o)),
      private_repos: doc.private_repos === true,
    },
    thread_replies: threadReplies(doc.review?.thread_replies) ?? "maintainers",
  };
}

/** `review.thread_replies` from a repository's .github/tidy.yml, if it sets a valid one. */
export function repoThreadReplies(text: string): ThreadReplies | undefined {
  try {
    return threadReplies((parse(text) as { review?: { thread_replies?: unknown } } | null)?.review?.thread_replies);
  } catch {
    return undefined;
  }
}
