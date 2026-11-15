export const escape = (value: unknown) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const DARK = `--bg:#0a0a0a;--fg:#ededed;--muted:#a1a1a1;--line:#2e2e2e;--subtle:#1a1a1a;--hover:#1f1f1f;--link:#52a8ff;
--primary:#ededed;--primary-fg:#0a0a0a;--primary-hover:#cccccc;--danger:#ff6166;color-scheme:dark`;

const STYLE = `:root{--bg:#fff;--fg:#171717;--muted:#666;--line:#eaeaea;--subtle:#fafafa;--hover:#f2f2f2;--link:#0070f3;
--primary:#171717;--primary-fg:#fff;--primary-hover:#383838;--danger:#e5484d;color-scheme:light}
:root[data-theme=dark]{${DARK}}
@media (prefers-color-scheme:dark){:root:not([data-theme]){${DARK}}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);
font:14px/1.6 "Geist","Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
.wrap{width:100%;max-width:44rem;margin:0 auto;padding-inline:1.5rem}
header{border-bottom:1px solid var(--line)}
header .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;height:64px}
.brand{display:flex;align-items:center;gap:.6rem;color:var(--fg);text-decoration:none;font-weight:600;font-size:1rem;letter-spacing:-.02em}
.logo{width:22px;height:22px;flex:none}.logo path{fill:none;stroke:var(--fg);stroke-linecap:round;stroke-linejoin:round}
.logo .f{stroke-width:4}.logo .c{stroke:var(--link);stroke-width:5.5}
main{flex:1;padding-block:4rem 3rem}
h1{font-size:2rem;font-weight:600;line-height:1.2;letter-spacing:-.04em;margin:0 0 1rem}
h2{font-size:1rem;font-weight:600;letter-spacing:-.01em;margin:0 0 .25rem}
p,ul,ol{margin:0 0 1rem}ul,ol{padding-left:1.25rem}li+li{margin-top:.5rem}li::marker{color:var(--muted)}
main>:last-child,.box>:last-child{margin-bottom:0}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline;text-underline-offset:3px}
code{font:.9em "Geist Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--subtle);
border:1px solid var(--line);padding:.1rem .35rem;border-radius:4px;overflow-wrap:break-word}
b{font-weight:600}.muted{color:var(--muted)}
.box{border:1px solid var(--line);border-radius:8px;padding:1.5rem;margin:2rem 0}
.bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem 1rem;color:var(--muted)}.bar p{margin:0}
form{margin:0}.stack{display:grid;gap:1.25rem;margin-top:1.5rem}
label{display:block;font-size:.8125rem;font-weight:500;color:var(--muted)}
input,select{display:block;width:100%;height:40px;margin-top:.4rem;font:inherit;font-size:.875rem;font-weight:400;padding:0 .75rem;color:var(--fg);
background:var(--bg);border:1px solid var(--line);border-radius:6px;transition:border-color .15s,box-shadow .15s}
input:hover,select:hover{border-color:var(--muted)}
input:focus,select:focus{outline:none;border-color:var(--fg);box-shadow:0 0 0 3px color-mix(in srgb,var(--link) 35%,transparent)}
button,.button{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 1rem;font:inherit;font-size:.875rem;
font-weight:500;cursor:pointer;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:6px;text-decoration:none;
transition:background .15s,border-color .15s,color .15s}
button:hover,.button:hover{background:var(--hover);text-decoration:none}
.primary{color:var(--primary-fg);background:var(--primary);border-color:var(--primary)}
.primary:hover{background:var(--primary-hover);border-color:var(--primary-hover)}
.small{height:32px;padding:0 .75rem;font-size:.8125rem}.danger:hover{color:var(--danger);border-color:var(--danger);background:var(--bg)}
:focus-visible{outline:2px solid var(--link);outline-offset:2px}
.table{overflow-x:auto;margin:1.25rem 0 0;border:1px solid var(--line);border-radius:6px}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:.6rem .9rem;border-bottom:1px solid var(--line);vertical-align:middle}
th{font-size:.75rem;font-weight:500;color:var(--muted);background:var(--subtle)}
td:last-child{text-align:right}td.muted{text-align:left}tr:last-child td{border-bottom:0}
.theme{display:inline-flex;padding:2px;gap:2px;border:1px solid var(--line);border-radius:999px}
.theme button{width:28px;height:28px;padding:0;color:var(--muted);background:none;border:0;border-radius:999px}
.theme button:hover{color:var(--fg);background:none}.theme button[aria-pressed=true]{color:var(--fg);background:var(--hover)}
.theme svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
:root:not([data-theme]) .theme{display:none}
footer{padding-block:2rem;font-size:.8125rem;color:var(--muted)}footer a{color:inherit}footer a:hover{color:var(--fg);text-decoration:none}
@media (max-width:560px){.wrap,header .wrap{padding-inline:1rem}main{padding-block:2.5rem 2rem}h1{font-size:1.6rem}.box{padding:1.25rem 1rem}
tr:has(th){display:none}tr{display:grid;grid-template-columns:1fr auto;column-gap:.75rem;padding:.75rem .9rem;border-bottom:1px solid var(--line)}
td,td:last-child{border:0;padding:.1rem 0;text-align:left}tr:last-child{border-bottom:0}
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
path{fill:none;stroke-linecap:round;stroke-linejoin:round}.f{stroke:#171717;stroke-width:4}.c{stroke:#0070f3;stroke-width:5.5}
@media(prefers-color-scheme:dark){.f{stroke:#ededed}.c{stroke:#52a8ff}}</style><path class="f" d="${FRAME}"/><path class="c" d="${CHECK}"/></svg>`)}`;

const ICONS = {
  Auto: '<rect x="2" y="3" width="12" height="8.5" rx="1.5"/><path d="M5.5 14h5M8 11.5V14"/>',
  Light: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
  Dark: '<path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z"/>',
};
const THEMES = Object.entries(ICONS)
  .map(([label, icon]) => `<button type="button" data-mode="${label.toLowerCase()}" aria-pressed="false" aria-label="${label} theme" title="${label}">
<svg viewBox="0 0 16 16" aria-hidden="true">${icon}</svg></button>`)
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
<header><div class="wrap"><a class="brand" href="/">${LOGO}tidy</a><div class="theme" role="group" aria-label="Theme">${THEMES}</div></div></header>
<main class="wrap"><h1>${escape(title)}</h1>${body}</main>
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
