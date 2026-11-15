export const escape = (value: unknown) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const DARK = `--bg:#0d1117;--card:#151b23;--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;--subtle:#212830;--accent:#4493f8;
--primary:#1f6feb;--primary-hover:#388bfd;--danger:#f85149;--frame:#e6edf3;--check:#4493f8;--shadow:none;color-scheme:dark`;

const STYLE = `:root{--bg:#f6f8fa;--card:#fff;--fg:#1f2328;--muted:#59636e;--line:#d1d9e0;--subtle:#f6f8fa;--accent:#0969da;
--primary:#1f6fdb;--primary-hover:#1a5fc0;--danger:#cf222e;--frame:#0b2a4a;--check:#1f6fdb;--shadow:0 1px 3px #1f232814;color-scheme:light}
:root[data-theme=dark]{${DARK}}
@media (prefers-color-scheme:dark){:root:not([data-theme]){${DARK}}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);
font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
.wrap{width:100%;max-width:46rem;margin:0 auto;padding-inline:1rem}
header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-block:2rem 1.25rem}
.brand{display:flex;align-items:center;gap:.5rem;color:var(--fg);text-decoration:none;font-weight:700;font-size:1.3rem;letter-spacing:-.01em}
.logo{width:30px;height:30px;flex:none}.logo path{fill:none;stroke-linecap:round;stroke-linejoin:round}
.logo .f{stroke:var(--frame);stroke-width:3.5}.logo .c{stroke:var(--check);stroke-width:5}
main{flex:1}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1.75rem;box-shadow:var(--shadow)}
.card>:last-child,.box>:last-child{margin-bottom:0}
h1{font-size:1.5rem;line-height:1.25;margin:0 0 1rem;letter-spacing:-.01em}h2{font-size:1.1rem;margin:0 0 .25rem}
p,ul,ol{margin:0 0 1rem}ul,ol{padding-left:1.4rem}li+li{margin-top:.4rem}
a{color:var(--accent);text-underline-offset:2px}
code{font:.85em ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--subtle);border:1px solid var(--line);
padding:.05rem .3rem;border-radius:5px;overflow-wrap:break-word}
.muted{color:var(--muted)}
.box{border:1px solid var(--line);border-radius:10px;padding:1.25rem;margin:1.25rem 0}
.bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem 1rem}.bar p{margin:0}
form{margin:0}.stack{display:grid;gap:1rem;margin-top:1.25rem}
label{display:block;font-weight:600;font-size:.9rem}
input,select{display:block;width:100%;margin-top:.35rem;font:inherit;font-weight:400;padding:.5rem .7rem;color:var(--fg);
background:var(--card);border:1px solid var(--line);border-radius:8px}
input:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 30%,transparent)}
button,.button{display:inline-block;font:inherit;font-weight:600;font-size:.9rem;line-height:1.4;padding:.5rem 1rem;cursor:pointer;
color:var(--fg);background:var(--subtle);border:1px solid var(--line);border-radius:8px;text-decoration:none}
button:hover,.button:hover{border-color:var(--muted)}
.primary{color:#fff;background:var(--primary);border-color:transparent}.primary:hover{background:var(--primary-hover);border-color:transparent}
.small{font-size:.8rem;padding:.25rem .65rem}.danger:hover{color:var(--danger);border-color:var(--danger)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.table{overflow-x:auto;margin:1rem 0 0}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{text-align:left;padding:.55rem .5rem;border-bottom:1px solid var(--line);vertical-align:middle}
th{font-size:.75rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600}
td:last-child{text-align:right}td.muted{text-align:left}tr:last-child td{border-bottom:0}
.theme{display:inline-flex;gap:2px;padding:2px;background:var(--card);border:1px solid var(--line);border-radius:8px}
.theme button{font-size:.8rem;font-weight:500;padding:.2rem .6rem;color:var(--muted);background:none;border:0;border-radius:6px}
.theme button[aria-pressed=true]{color:var(--fg);background:var(--subtle);box-shadow:inset 0 0 0 1px var(--line)}
:root:not([data-theme]) .theme{display:none}
footer{padding-block:1.5rem 2rem;text-align:center;font-size:.85rem;color:var(--muted)}footer a{color:inherit}
@media (max-width:560px){.card{padding:1.25rem}.box{padding:1rem}h1{font-size:1.3rem}
tr:has(th){display:none}tr{display:grid;grid-template-columns:1fr auto;column-gap:.75rem;border-bottom:1px solid var(--line)}
td,td:last-child{border:0;padding:.15rem 0;text-align:left}tr{padding:.6rem 0}tr:last-child{border-bottom:0}
td:nth-child(4){grid-column:2;grid-row:1/span 3;align-self:center}}`;

// Runs before the body renders, so the chosen theme never flashes; "auto" tracks the system theme live.
const THEME = `(()=>{const r=document.documentElement,k="tidy-theme",m=matchMedia("(prefers-color-scheme: dark)");
const get=()=>{try{const v=localStorage.getItem(k);return v==="light"||v==="dark"?v:"auto"}catch{return "auto"}};
const apply=()=>{const v=get();r.dataset.theme=v==="auto"?(m.matches?"dark":"light"):v;
for(const b of document.querySelectorAll(".theme button"))b.setAttribute("aria-pressed",String(b.dataset.mode===v))};
apply();m.addEventListener("change",apply);addEventListener("storage",e=>{if(e.key===k)apply()});
addEventListener("DOMContentLoaded",()=>{apply();for(const b of document.querySelectorAll(".theme button"))b.addEventListener("click",()=>{
try{localStorage.setItem(k,b.dataset.mode)}catch{}apply()})})})()`;

const FRAME = "M10 20 C22 18 36 19 47 18 M46 17 C48 30 47 42 46 55 M47 54 C34 56 22 53 9 55 M10 56 C9 42 11 30 9 19";
const CHECK = "M18 35 C21 40 24 44 28 48 C37 34 47 20 59 8";
const LOGO = `<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><path class="f" d="${FRAME}"/><path class="c" d="${CHECK}"/></svg>`;
const FAVICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><style>
path{fill:none;stroke-linecap:round;stroke-linejoin:round}.f{stroke:#0B2A4A;stroke-width:3.5}.c{stroke:#1F6FDB;stroke-width:5}
@media(prefers-color-scheme:dark){.f{stroke:#E6EDF3}.c{stroke:#4493F8}}</style><path class="f" d="${FRAME}"/><path class="c" d="${CHECK}"/></svg>`)}`;

const THEMES = ["Auto", "Light", "Dark"]
  .map((label) => `<button type="button" data-mode="${label.toLowerCase()}" aria-pressed="false">${label}</button>`)
  .join("");

interface PageInit extends ResponseInit {
  headers?: Record<string, string>;
  /** GitHub App slug, linked in the footer of admin pages. */
  app?: string;
}

export function page(title: string, body: string, { app, ...init }: PageInit = {}): Response {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const csp = [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src data:",
    `script-src 'nonce-${nonce}'`,
    "form-action 'self' https://github.com",
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join("; ");
  const appLink = app ? ` · <a href="https://github.com/apps/${escape(app)}">GitHub App</a>` : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="same-origin"><title>${escape(title)} · tidy</title><link rel="icon" href="${FAVICON}">
<style>${STYLE}</style><script nonce="${nonce}">${THEME}</script></head><body>
<header class="wrap"><a class="brand" href="/">${LOGO}tidy</a><div class="theme" role="group" aria-label="Theme">${THEMES}</div></header>
<main class="wrap"><div class="card"><h1>${escape(title)}</h1>${body}</div></main>
<footer class="wrap"><a href="https://github.com/igorovh/tidy">tidy</a> · <a href="https://github.com/igorovh/tidy/tree/main/docs">Docs</a>${appLink}</footer>
</body></html>`;
  return new Response(html, {
    ...init,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": csp,
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

// Browsers send `Origin: null` on POSTs from no-referrer pages; Sec-Fetch-Site still tells us the truth.
export function isSameOrigin(request: Request, origin: string): boolean {
  const header = request.headers.get("origin");
  if (header && header !== "null") return header === origin;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

export function cookie(name: string, value: string, maxAge: number, sameSite: "Strict" | "Lax", path = "/admin"): string {
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=${sameSite}`;
}

export function readCookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}
