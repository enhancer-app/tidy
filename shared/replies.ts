// Kept apart from limits.ts, which needs the yaml package that the Actions scripts do not install.

/** Who may get an answer from tidy by replying to one of its inline review comments. */
export const THREAD_REPLIES = ["maintainers", "everyone", "off"] as const;
export type ThreadReplies = (typeof THREAD_REPLIES)[number];

// `false` reads as "off", since that is what people write for a switch.
export const threadReplies = (value: unknown): ThreadReplies | undefined =>
  value === false ? "off" : THREAD_REPLIES.includes(value as ThreadReplies) ? (value as ThreadReplies) : undefined;
