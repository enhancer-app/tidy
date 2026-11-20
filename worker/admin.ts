import { b64url, sha256, utf8 } from "../shared/encoding";
import { deriveKeys, mac, macMatches, signValue, verifyValue } from "./crypto";
import { type Env, type Instance, stateOf } from "./env";
import { github, GitHubError, installationToken } from "./github";
import { cookie, escape, isSameOrigin, page, readCookie } from "./html";
import { loadInstance, resolveRepo, saveInstance } from "./instance";

const SESSION = "__Host-tidy-session";
const OAUTH = "__Host-tidy-oauth";
const KEY_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;

// Variable names come from models.dev, which OpenCode reads; Google also accepts GOOGLE_API_KEY and GEMINI_API_KEY.
export const PROVIDERS: Record<string, { label: string; env: string }> = {
  opencode: { label: "OpenCode Zen / Go", env: "OPENCODE_API_KEY" },
  anthropic: { label: "Anthropic", env: "ANTHROPIC_API_KEY" },
  openai: { label: "OpenAI", env: "OPENAI_API_KEY" },
  openrouter: { label: "OpenRouter", env: "OPENROUTER_API_KEY" },
  google: { label: "Google", env: "GOOGLE_GENERATIVE_AI_API_KEY" },
  deepseek: { label: "DeepSeek", env: "DEEPSEEK_API_KEY" },
  groq: { label: "Groq", env: "GROQ_API_KEY" },
  xai: { label: "xAI", env: "XAI_API_KEY" },
  mistral: { label: "Mistral", env: "MISTRAL_API_KEY" },
};

/** The variable a key is stored under: the provider's, or a custom name when the provider is "other" or absent. */
export function keyName(provider: string | null, name: string | null): string | null {
  if (provider && provider !== "other") return Object.hasOwn(PROVIDERS, provider) ? PROVIDERS[provider]!.env : null;
  return name && KEY_NAME.test(name) && !RESERVED.test(name) ? name : null;
}

// Keys become environment variables in the agent container; these would change how it runs instead.
const RESERVED = /^(PATH|HOME|SHELL|USER|MODEL|NODE_OPTIONS|NODE_PATH|LD_|DYLD_|BUN_|NPM_|NPM$|OPENCODE_(?!API_KEY$)|BASH_|ENV$|TZ$)/;

interface Session {
  uid: number;
  login: string;
  sid: string;
}

const notConfigured = () => page("Not set up", "<p>Run the setup link printed by <code>bun run deploy</code> first.</p>", { status: 503 });

// __Host- cookies must use Path=/; SameSite=Lax lets the state cookie survive GitHub's redirect.
const hostCookie = (name: string, value: string, maxAge: number, sameSite: "Strict" | "Lax") =>
  cookie(name, value, maxAge, sameSite, "/");

async function session(request: Request, env: Env): Promise<Session | null> {
  return verifyValue<Session>(await deriveKeys(env.TIDY_MASTER_KEY), "session", readCookie(request, SESSION));
}

export async function handleAdmin(request: Request, env: Env, origin: string): Promise<Response> {
  const instance = await loadInstance(env);
  if (!instance) return notConfigured();
  const path = new URL(request.url).pathname;
  if (path === "/admin/login") return login(request, env, instance, origin);
  if (path === "/admin/callback") return callback(request, env, instance, origin);
  const current = await session(request, env);
  if (request.method === "POST") {
    if (!isSameOrigin(request, origin)) return page("Forbidden", "<p>Cross-site request.</p>", { status: 403 });
    if (!current) return Response.redirect(`${origin}/admin`, 303);
    const form = await request.formData();
    const keys = await deriveKeys(env.TIDY_MASTER_KEY);
    if (!(await macMatches(keys, "csrf", current.sid, String(form.get("csrf") ?? "")))) {
      return page("Forbidden", "<p>The form expired. Reload the page.</p>", { status: 403 });
    }
    if (path === "/admin/logout") {
      return new Response(null, { status: 303, headers: { location: `${origin}/admin`, "set-cookie": hostCookie(SESSION, "", 0, "Strict") } });
    }
    if (path === "/admin/keys") return updateKey(form, env, instance, current, origin);
    return page("Not found", "", { status: 404 });
  }
  if (!current) {
    return page(
      "tidy admin",
      `<p>Sign in with a GitHub account that has admin access to <code>${escape(instance.repo.fullName)}</code>.</p>
<p><a class="button primary" href="/admin/login">Sign in with GitHub</a></p>`,
      { app: instance.app.slug },
    );
  }
  return dashboard(env, instance, current);
}

async function login(request: Request, env: Env, instance: Instance, origin: string): Promise<Response> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const hour = new Date().toISOString().slice(0, 13);
  if (!(await stateOf(env).take(`login:${ip}:${hour}`, 20, 7_200_000))) {
    return page("Too many attempts", "<p>Try again in an hour.</p>", { status: 429 });
  }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const signed = await signValue(await deriveKeys(env.TIDY_MASTER_KEY), "oauth", { state, verifier }, 600);
  const challenge = b64url(await sha256(utf8(verifier)));
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.search = new URLSearchParams({
    client_id: instance.app.clientId,
    redirect_uri: `${origin}/admin/callback`,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    allow_signup: "false",
  }).toString();
  return new Response(null, { status: 302, headers: { location: authorize.toString(), "set-cookie": hostCookie(OAUTH, signed, 600, "Lax") } });
}

async function callback(request: Request, env: Env, instance: Instance, origin: string): Promise<Response> {
  const url = new URL(request.url);
  const keys = await deriveKeys(env.TIDY_MASTER_KEY);
  const pending = await verifyValue<{ state: string; verifier: string }>(keys, "oauth", readCookie(request, OAUTH));
  if (!pending || pending.state !== url.searchParams.get("state")) return page("Sign-in expired", "<p>Try again.</p>", { status: 400 });

  const exchange = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": "tidy-bot" },
    body: JSON.stringify({
      client_id: instance.app.clientId,
      client_secret: instance.app.clientSecret,
      code: url.searchParams.get("code"),
      redirect_uri: `${origin}/admin/callback`,
      code_verifier: pending.verifier,
    }),
  });
  const { access_token: token } = (await exchange.json()) as { access_token?: string };
  if (!token) return page("Sign-in failed", "<p>GitHub did not return a token.</p>", { status: 400 });
  const user = await github<{ id: number; login: string }>("/user", { token });
  // The user token only proves identity; revoke it right away.
  await fetch(`https://api.github.com/applications/${instance.app.clientId}/token`, {
    method: "DELETE",
    headers: {
      authorization: `Basic ${btoa(`${instance.app.clientId}:${instance.app.clientSecret}`)}`,
      "content-type": "application/json",
      "user-agent": "tidy-bot",
    },
    body: JSON.stringify({ access_token: token }),
  });

  if (!(await isAdmin(env, instance, user.login))) {
    return page("Not allowed", `<p>@${escape(user.login)} is not an admin of ${escape(instance.repo.fullName)}.</p>`, { status: 403 });
  }
  const sid = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const signed = await signValue(keys, "session", { uid: user.id, login: user.login, sid }, 3600);
  // A Strict cookie set during a cross-site redirect is not sent on the next hop, so continue from our own page.
  const response = page("Signed in", `<meta http-equiv="refresh" content="0;url=/admin"><p><a class="button primary" href="/admin">Continue</a></p>`, {
    headers: { "set-cookie": hostCookie(SESSION, signed, 3600, "Strict") },
  });
  response.headers.append("set-cookie", hostCookie(OAUTH, "", 0, "Lax"));
  return response;
}

export async function isAdmin(env: Env, instance: Instance, login: string): Promise<boolean> {
  const repo = await resolveRepo(env, instance);
  const token = await installationToken(instance.app, repo.installationId, { metadata: "read" }, [repo.id]);
  try {
    const result = await github<{ permission: string }>(
      `/repos/${repo.fullName}/collaborators/${encodeURIComponent(login)}/permission`,
      { token: token.token },
    );
    return result.permission === "admin";
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return false;
    throw error;
  }
}

type KeyGroup = "agent" | "plan";

function keyTable(keys: Instance["keys"], group: KeyGroup, csrf: string): string {
  const labels = new Map(Object.values(PROVIDERS).map((p) => [p.env, p.label]));
  const rows = Object.entries(keys)
    .map(
      ([name, key]) => `<tr><td><div>${escape(labels.get(name) ?? "Other")}</div><code class="var">${escape(name)}</code></td>
<td>…${escape(key.value.slice(-4))}</td>
<td class="muted">${escape(key.updated.slice(0, 16).replace("T", " "))} by @${escape(key.by)}</td>
<td><form method="post" action="/admin/keys"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="group" value="${group}">
<input type="hidden" name="name" value="${escape(name)}"><button class="small danger" name="op" value="delete">Remove</button></form></td></tr>`,
    )
    .join("");
  const options = Object.entries(PROVIDERS)
    .map(([id, p]) => `<option value="${id}">${escape(p.label)}${p.env in keys ? " · saved" : ""}</option>`)
    .join("");
  return `<div class="table"><table><tr><th>Provider</th><th>Key</th><th>Changed</th><th></th></tr>${rows || '<tr><td colspan="4" class="muted">No keys yet.</td></tr>'}</table></div>
<form class="stack" method="post" action="/admin/keys"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="group" value="${group}">
<label>Provider<select name="provider">${options}<option value="other">Other (custom variable)</option></select></label>
<label class="custom">Environment variable OpenCode reads<input type="text" name="name" placeholder="MY_PROVIDER_API_KEY" pattern="[A-Z][A-Z0-9_]{1,63}"></label>
<label>Key<input type="password" name="value" autocomplete="off" required maxlength="4096"></label>
<div><button class="primary" name="op" value="set">Save key</button></div></form>`;
}

async function dashboard(env: Env, instance: Instance, current: Session): Promise<Response> {
  const csrf = await mac(await deriveKeys(env.TIDY_MASTER_KEY), "csrf", current.sid);
  return page(
    "tidy admin",
    `<div class="bar"><p>Signed in as @${escape(current.login)}. App: <a href="https://github.com/apps/${escape(instance.app.slug)}">${escape(instance.app.slug)}</a>
· <a href="https://github.com/apps/${escape(instance.app.slug)}/installations/new">Add repositories</a></p>
<form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${escape(csrf)}"><button class="small">Sign out</button></form></div>
<section class="box"><h2>Model keys</h2><p class="muted">Keys can be replaced or removed, never shown. Every change opens an issue in
<code>${escape(instance.repo.fullName)}</code>. Models are chosen in <code>tidy.yml</code>, not here.</p>
${keyTable(instance.keys, "agent", csrf)}</section>
<section class="box"><h2>Planning key</h2><p class="muted">Only for interactive review extras, which run pull request code on the
same machine as the model. Use a separate key with a low spending limit at the provider, so a leak costs little.
Without one, interactive extras are skipped.</p>
${keyTable(instance.planKeys ?? {}, "plan", csrf)}</section>`,
    { app: instance.app.slug },
  );
}

async function updateKey(form: FormData, env: Env, instance: Instance, current: Session, origin: string): Promise<Response> {
  const op = form.get("op");
  const name = keyName(op === "set" ? (form.get("provider") as string | null) : null, form.get("name") as string | null);
  if (!name) return page("Invalid name", "<p>Use an environment variable name such as OPENCODE_API_KEY.</p>", { status: 400 });
  const plan = form.get("group") === "plan";
  const keys = plan ? (instance.planKeys ??= {}) : instance.keys;
  if (op === "set") {
    const value = String(form.get("value") ?? "").trim();
    if (!value || value.length > 4096 || /\s/.test(value)) return page("Invalid key", "<p>The key is empty or malformed.</p>", { status: 400 });
    keys[name] = { value, updated: new Date().toISOString(), by: current.login };
  } else if (op === "delete") {
    delete keys[name];
  } else {
    return page("Invalid request", "", { status: 400 });
  }
  await saveInstance(env, instance);
  await audit(env, instance, `${op === "set" ? "Set" : "Removed"} ${plan ? "planning" : "model"} key ${name}`, current.login);
  return Response.redirect(`${origin}/admin`, 303);
}

async function audit(env: Env, instance: Instance, title: string, login: string): Promise<void> {
  const repo = await resolveRepo(env, instance);
  const token = await installationToken(instance.app, repo.installationId, { issues: "write" }, [repo.id]);
  await github(`/repos/${repo.fullName}/issues`, {
    token: token.token,
    method: "POST",
    body: {
      title: `tidy: ${title}`,
      body: `@${login} changed tidy's settings in /admin at ${new Date().toISOString()}.\n\nIf this was not you, sign in to /admin, replace the key at its provider, and review who has admin access to this repository.`,
    },
  });
}
