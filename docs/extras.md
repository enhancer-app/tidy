# Review extras

A repository can ask for more than text in its reviews, such as a demo GIF of the changed UI. tidy knows
nothing about the tool. It only runs a command the repository names in `.github/tidy.yml`:

```yaml
review:
  extras:
    - name: Demo
      when: ["src/**"]            # only for pull requests that change these files
      instructions: >-
        Record the changed behaviour. The steps are described in AGENTS.md.
      image: node:22-bookworm
      setup: apt-get install -y ffmpeg && bun install
      command: ["bun", "run", "record", "--", "--out", "{out}/demo.gif"]
```

## What happens

1. A planning step lets the review model read the instructions, the diff and the repository's docs, and
   pick the command's arguments. It must include a check that passes on the pull request and fails on
   the base branch. If no such check is possible, it skips the extra.
2. tidy runs `setup` and `command` with those arguments in a container without secrets, once on the pull
   request and once on the commit it branched off the default branch. The container runs as root with
   network access, so `setup` can install packages, but with only the capabilities package managers
   need. The arguments are passed as a list, never through a shell.
3. The files the command writes to `{out}` appear in the review as **Before** and **After**, but only when
   the command exits with `0` on the pull request and `1` on the base. The model sees the command output
   too, so it can say what changed.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | the behaviour is there: every expectation passed |
| `1` | the behaviour is missing: an expectation failed, but the tool worked |
| anything else | the tool itself failed, for example a crash or a timeout |

Any other combination, such as `0` on both sides, means the demo does not show the change. The review
says so and attaches no files, so two identical GIFs are never presented as a before and after.

Extras run on pull requests from maintainers. For pull requests from people without write access they
run only when a maintainer comments `@tidy review`, because they run the pull request's code as root.

Files must be GIF, PNG, JPEG, WebP, MP4 or WebM, with names made of letters, digits, `.`, `_` and `-`;
other files are skipped. Each file can be up to 2 MB, and a review takes at most 8 files and 10 MB in
total. Images are shown inline; videos are linked.

![A tidy review with Before and After GIFs](images/review-demo-light.png)

## Interactive extras

With plain arguments the model plans blind: it cannot see whether its demo shows anything. An
interactive extra gives it a live container instead, with the pull request's code already set up, where
it can run the steps your tool offers, read their output and try again before anything is recorded:

```yaml
review:
  extras:
    - name: Demo
      when: ["src/**"]
      image: node:22-bookworm
      setup: npm install --global bun && bun install
      instructions: Show the changed tab bar. AGENTS.md describes the tui script.
      before: pr-tools
      interactive:
        start: ["bun", "run", "tui", "serve"]       # optional, runs in the background
        steps:                                      # the only commands the model can run
          screen: ["bun", "run", "tui", "screen"]
          click: ["bun", "run", "tui", "click"]
          expect: ["bun", "run", "tui", "expect"]
          rec-start: ["bun", "run", "tui", "rec", "start", "--out", "{out}/demo.gif"]
          rec-stop: ["bun", "run", "tui", "rec", "stop"]
        network: false                              # the default
```

1. Before the model gets its key, tidy runs `setup` as root with the network in one container, gives
   `/work` and `/out` to an unprivileged user and saves the container as an image. The steps run in a
   new container from that image, which starts as that user, with no capabilities and no network, so
   nothing `setup` left behind runs as root. Then tidy starts `start`. Setup for all interactive
   extras shares 15 minutes.
2. The model calls a step by name and adds arguments. tidy runs the declared command with those
   arguments, as the unprivileged user without capabilities, and returns the exit code and the last
   8,000 characters of output. It has no shell, at most 60 calls and 60 seconds per step.
3. The model hands back the list of steps that shows the change. Files from the live container are
   thrown away.
4. In the job without any credentials, tidy replays those steps in a fresh container, on the pull request
   and on the base, and attaches the files as before. A side is `0` when every step exits with `0`,
   `1` when a step exits with `1`, and an error otherwise.

Your tool needs `bash` and `timeout` in the image. Steps run without a network unless you set
`network: true`, so install everything in `setup`; processes from `setup` do not survive into the
steps, so start long-running ones with `start`. Steps that wait for a condition, such as an `expect`
that blocks until text appears, replay better than fixed pauses.

Interactive extras need a **planning key** in `/admin`, separate from the model keys; `/admin` refuses
a key that is already saved as a model key. The live container runs pull request code on the same
machine as the model, so a container escape could leak the planning key. The model keys never reach
that machine. Give the planning key a low spending limit at the provider, and make it a key for the
provider of `review.model`, which plans the extras. Without one, every extra of a pull request that
matches an interactive extra is skipped, the plain ones too, because they are planned together.
A step that fails because its container stopped, for example after running out of memory, counts as
a broken run, not as a failed check.

### `before`

By default Before runs on the base checkout with the base branch's own tools, so a step or a fixture
the pull request adds does not exist there. With `before: pr-tools`, Before runs the pull request's
checkout (its tools and fixtures) with the base checkout mounted at `/base`, and sets `TIDY_SIDE=before`
and `TIDY_BASE=/base`. Your tool then runs the product from `/base`; `setup` sees the same variables,
so it can install the base's dependencies too. This works for plain extras as well.

With `pr-tools` the pull request's code records both sides, so a dishonest pull request could fake
Before as well as After. The review says which tools recorded Before. Extras show what an honest change
does; they are not proof against a hostile one.

## Where the files live

GitHub's attachment upload does not accept App tokens, so tidy keeps these files on a `tidy-assets`
branch in the reviewed repository. The branch is always a single commit holding the last 30 days, so it
adds no history and old files drop out. Its commits say `[skip ci]`, so your push workflows do not run
on it. It is the only branch tidy ever overwrites. In private
repositories the images may not show, because raw files there need a login.

## Example

[opencode-better-tabs](https://github.com/igorovh/opencode-better-tabs/blob/main/.github/tidy.yml)
records its tab bar in the real OpenCode TUI. Its `record` script supports `expect`, `expect-not` and
`expect-above` steps, so a recording fails when the behaviour is wrong, and still writes the GIF. It must
exit with `1` for a failed expectation and another code for a broken run, or tidy treats every failure
as an error.
