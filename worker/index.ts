import { handleAdmin } from "./admin";
import { handleRepos } from "./api";
import type { Env } from "./env";
import { page } from "./html";
import { handleSetup, handleSetupCallback } from "./setup";
import { handleToken } from "./token";
import { handleWebhook } from "./webhook";

export { TidyState } from "./state";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;
    // Reading a huge body could use up the free plan's CPU time; GitHub and our own forms send far less.
    if (request.method === "POST") {
      const limit = url.pathname === "/webhook" ? 2_000_000 : 64_000;
      const length = Number(request.headers.get("content-length") ?? NaN);
      if (!Number.isFinite(length) || length > limit) return new Response("body too large or without a length", { status: 413 });
    }
    try {
      if (url.pathname === "/webhook" && request.method === "POST") return await handleWebhook(request, env, origin);
      if (url.pathname === "/token" && request.method === "POST") return await handleToken(request, env);
      if (url.pathname === "/api/repos" && request.method === "GET") return await handleRepos(request, env);
      if (url.pathname === "/setup" && request.method === "GET") return await handleSetup(request, env, origin);
      if (url.pathname === "/setup/callback" && request.method === "GET") return await handleSetupCallback(request, env);
      if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return await handleAdmin(request, env, origin);
      if (url.pathname === "/") return page("tidy", `<p>This Worker runs a tidy instance. Admins: <a href="/admin">/admin</a>.</p>`);
      return new Response("not found", { status: 404 });
    } catch (error) {
      // Details go to Workers logs only; responses never echo internal errors.
      console.error(error);
      return new Response("internal error", { status: 500 });
    }
  },
};
