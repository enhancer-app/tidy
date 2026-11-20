# Security model

tidy assumes the model can be talked into anything, and limits what it can do instead.

- **Write access lives in one place.** Only `publish.yml` gets a token that can write, and it runs tidy's
  code on artifacts, never repository or agent code. The App has no `workflows` permission, so it cannot
  change CI, and the [recommended ruleset](setup.md#protect-your-default-branches) keeps it from merging
  or pushing to the default branch. Reviews are always posted as comments, so tidy cannot satisfy a
  required approval.
- **The agent runs in a container** that sees the workspace, a snapshot of the thread and its result
  file. It has no GitHub token, and the runner's OIDC and artifact tokens are not passed in.
  System-level OpenCode policies deny everything the task does not need and block project
  `opencode.json` files, which could redirect the model key.
- **Shell access is earned.** The agent gets a shell only when every author in the thread can already
  push to the repository. Otherwise it can read and edit files only.
- **Triage cannot act.** The first model to read an issue has no tools and can only answer with a kind
  and a size from a fixed list.
- **Patches are checked twice.** After the agent and again in `publish.yml`, using a git directory the
  agent never saw: no protected paths (`.github/`, `opencode.json`, `.npmrc` and more), no symlinks or
  submodules, at most 100 files and 5 MB. Patches are staged with `git apply --cached` and never run.
- **Output is cleaned.** Mentions, images, HTML tags and links outside GitHub (including `//host` and
  `www.` links) are removed from everything tidy posts; code is left as written. Closing keywords cannot
  close other issues. Suggestions are fenced so their code cannot escape the block.
- **Outside input never reaches secrets unseen.** Fixes from threads with outside text wait for
  `@tidy publish` when the repository's workflows use secrets on pull requests or on pushes to tidy's
  branches (see [How it works](how-it-works.md#fixes-from-outside-issues)).
- **Checks and extras have no credentials.** They run pull request code in a container without secrets
  or tokens. Their commands come from the default branch; the model only picks extra arguments, passed
  as a list. Extras run as root with network access (with only the capabilities package managers
  need), so for outsiders' pull requests they run only when a maintainer asks with `@tidy review`.
  tidy attaches their files only when the pull request shows the behaviour and the base does not.
- **Interactive planning gets its own key.** For [interactive extras](extras.md#interactive-extras) the
  model drives a live container with pull request code, so `plan.yml` gets only the planning key from
  `/admin`, never the model keys, and `/admin` refuses the same key in both groups. Setup finishes
  before that key reaches the runner, in a separate root container that tidy saves as an image. Steps
  run in a new container from it that starts as an unprivileged user, with no capabilities and no
  network (or, with `network: true`, on a network that cannot reach other containers), so nothing
  setup left behind runs as root. The model has no shell and can only call the steps
  the default branch declares. What keeps the key safe is that the model never sees it; the bridge's
  check for the exact key in calls and output is a second lock, not a barrier. The bridge's shim starts
  with an empty environment. Replays for the review run in the job without credentials.
- **Artifacts are read by ID.** Jobs read the gate's snapshot and the agent's result by the IDs their
  uploads returned, so a job that runs pull request code cannot swap them by uploading under the same
  name.
- **Model keys stay out of posts.** The agent cannot read `/proc`, `/sys` or `/dev`. Symlinks in the
  checked-out code that point outside the repository are removed first, so a pull request cannot reach
  those files through a link. tidy discards any result or patch that contains a configured key, and
  `/admin` refuses key names such as `PATH` or `NODE_OPTIONS` that would change how the agent runs.
- **Replies are arguments, not orders.** Review threads reach the model marked as untrusted, with each
  author's access. Only a maintainer's reply or a resolved thread stops tidy from repeating a finding,
  and `publish.yml` enforces that itself. A thread reply can only post one answer in that thread and
  resolve it; tidy answers at most twice per thread, and by default only maintainers' replies.
- **Abuse limits.** People without write access get a few events a day, a few follow-up reviews per
  pull request, at most two issues or pull requests handled a day, and their commands are ignored. The
  Worker checks real write access through the API, because GitHub marks every organization member as
  `MEMBER`, even with read access only. The `tidy:review` label never buys a second review of the same
  commit. The Worker also caps runs per day in total and per repository. See
  [Limits](configuration.md#limits).
- **Only your accounts.** Runs start only for `allowed_owners`, and installations by anyone else are
  suspended. See [Accounts](configuration.md#accounts-and-private-repositories).
- **The Worker** verifies webhook signatures and stores keys encrypted with a master key kept as a Worker
  secret. `/admin` uses GitHub sign-in (PKCE, admins of the tidy repository only, one-hour sessions,
  CSRF tokens). Keys can be replaced but not read back; the page shows only their last 4 characters.
  Every change opens an issue in your tidy repository.

## Known limits

- A trusted fix has a shell and the model key in the same container, so a prompt injection in a
  maintainer-written thread could leak the model key. It cannot push anything.
- Interactive planning runs pull request code on the same runner as the planning key. A container
  escape there, for example through a kernel bug, could leak that key. An escape in planning or in the
  checks job could also replace the plan or the checks output, including the verdict that decides
  whether extra files are attached. That only changes what the review reads and which files publish
  attaches, after publish's own checks. Keep a low spending limit on the planning key.
- With `before: pr-tools` the pull request's code records Before as well as After, so a hostile pull
  request can fake both.
- Run logs in your tidy repository show the target repositories' content. Keep tidy private if it serves
  private repositories; private repositories use Actions minutes.
- The `tidy-assets` branch is public in public repositories, like the reviews that link to it.
- Protect your GitHub and Cloudflare accounts with 2FA. Whoever controls them controls the bot.

Found a problem? Please report it privately through the repository's Security tab.
