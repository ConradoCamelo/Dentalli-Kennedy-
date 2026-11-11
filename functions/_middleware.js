// Registro de visitas por IP (prevenção de cliques fraudulentos em anúncios).
// Cloudflare Pages Function. Precisa, no projeto do Pages:
//   - binding D1 com o nome  DB   (banco compartilhado entre os sites Dentalli)
//   - segredo                ADMIN_PASS (senha do painel /__ipc)
// Sem o binding DB o site funciona normalmente e nada é registrado.

const ADMIN_PATH = "/__ipc";
const EVENT_PATH = "/__evt";
const KEEP_DAYS = 90;
const DAY = 86400000;
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|bingpreview|lighthouse|headless|pagespeed|preview|monitor|uptime|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch/i;

const TRACK_SNIPPET = `<script>(function(){function s(k,c){try{var d=JSON.stringify({k:k,p:location.pathname,c:c||""});if(navigator.sendBeacon){navigator.sendBeacon("${EVENT_PATH}",new Blob([d],{type:"application/json"}))}else{fetch("${EVENT_PATH}",{method:"POST",body:d,keepalive:true})}}catch(e){}}document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a,button");if(!a)return;var h=a.getAttribute("href")||"";var c=a.getAttribute("data-wa-context")||"";if(a.hasAttribute("data-tel-link")||h.indexOf("tel:")===0){s("phone",c)}else if(a.hasAttribute("data-whatsapp")||c||/wa\\.me|whatsapp\\.com/.test(h)){s("whatsapp",c)}},true)})();</script>`;

let schemaReady = null;

function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db
      .batch([
        db.prepare(
          "CREATE TABLE IF NOT EXISTS hits (id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, site TEXT, path TEXT, kind TEXT NOT NULL, ip TEXT NOT NULL, country TEXT, region TEXT, city TEXT, asn INTEGER, org TEXT, ua TEXT, ref TEXT, gclid TEXT, ctx TEXT)"
        ),
        db.prepare("CREATE INDEX IF NOT EXISTS hits_ts ON hits(ts)"),
        db.prepare("CREATE INDEX IF NOT EXISTS hits_ip ON hits(ip, ts)"),
      ])
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

// Endereços *.pages.dev são prévias do Cloudflare, não visitas reais
function isPreviewHost(url) {
  return url.hostname.endsWith(".pages.dev") || url.hostname === "localhost";
}

function siteOf(url) {
  return url.hostname.replace(/^www\./, "");
}

function clip(value, max) {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

async function record(env, request, data) {
  const cf = request.cf || {};
  const ip = request.headers.get("CF-Connecting-IP") || "desconhecido";
  await ensureSchema(env.DB);
  await env.DB.prepare(
    "INSERT INTO hits (ts, site, path, kind, ip, country, region, city, asn, org, ua, ref, gclid, ctx) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
  )
    .bind(
      Date.now(),
      clip(data.site, 80),
      clip(data.path, 300),
      data.kind,
      clip(ip, 64),
      clip(cf.country, 8),
      clip(cf.region, 80),
      clip(cf.city, 80),
      Number.isFinite(cf.asn) ? cf.asn : null,
      clip(cf.asOrganization, 120),
      clip(request.headers.get("User-Agent"), 300),
      clip(data.ref, 300),
      clip(data.gclid, 200),
      clip(data.ctx, 120)
    )
    .run();
}

function isBot(request) {
  return BOT_UA.test(request.headers.get("User-Agent") || "");
}

function injectSnippet(response) {
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  if (typeof HTMLRewriter !== "undefined") {
    return new HTMLRewriter()
      .on("body", {
        element(el) {
          el.append(TRACK_SNIPPET, { html: true });
        },
      })
      .transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
  }
  // Fora do Cloudflare (testes locais)
  return response.text().then((html) => {
    const out = html.includes("</body>") ? html.replace("</body>", TRACK_SNIPPET + "</body>") : html + TRACK_SNIPPET;
    return new Response(out, { status: response.status, statusText: response.statusText, headers });
  });
}

async function handleEvent(context) {
  const { request, env } = context;
  if (request.method !== "POST") return new Response(null, { status: 405 });
  let body = {};
  try {
    const raw = await request.text();
    if (raw.length > 2000) return new Response(null, { status: 413 });
    body = JSON.parse(raw || "{}");
  } catch {
    return new Response(null, { status: 400 });
  }
  const kind = body.k === "whatsapp" || body.k === "phone" ? body.k : null;
  const url = new URL(request.url);
  if (!kind || isBot(request) || isPreviewHost(url)) return new Response(null, { status: 204 });
  context.waitUntil(
    record(env, request, { site: siteOf(url), path: body.p, kind, ctx: body.c, ref: null, gclid: null }).catch(() => {})
  );
  return new Response(null, { status: 204 });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith("/functions/")) return new Response("Not found", { status: 404 });
  if (path === ADMIN_PATH || path.startsWith(ADMIN_PATH + "/")) return admin(context);
  if (path === EVENT_PATH) {
    if (!env.DB) return new Response(null, { status: 204 });
    return handleEvent(context);
  }

  const response = await next();
  if (!env.DB || request.method !== "GET") return response;

  const accept = request.headers.get("Accept") || "";
  const type = response.headers.get("Content-Type") || "";
  const isPage =
    (response.status === 200 && type.includes("text/html")) ||
    (response.status === 304 && accept.includes("text/html"));
  if (!isPage) return response;

  if (!isBot(request) && !isPreviewHost(url)) {
    const gclid = url.searchParams.get("gclid") || url.searchParams.get("gbraid") || url.searchParams.get("wbraid");
    context.waitUntil(
      record(env, request, {
        site: siteOf(url),
        path: path + (url.search ? url.search : ""),
        kind: "view",
        ref: request.headers.get("Referer"),
        gclid,
        ctx: url.searchParams.get("utm_campaign"),
      }).catch(() => {})
    );
  }

  return response.status === 200 ? injectSnippet(response) : response;
}

/* ------------------------------------------------------------------ */
/* Painel /__ipc                                                       */
/* ------------------------------------------------------------------ */

// Operadoras de servidores/data centers: acessos daqui são robôs (inclusive a
// verificação automática de anúncios do Google), não pacientes.
const HOSTING = ["Google", "Amazon", "Microsoft", "DigitalOcean", "OVH", "Hetzner", "Linode", "Oracle", "Alibaba", "Tencent", "Contabo", "Vultr", "Choopa", "Leaseweb", "M247", "Facebook", "Meta Platforms", "Hostinger", "Scaleway"];
const HOSTING_RE = new RegExp(HOSTING.join("|"), "i");
const HOSTING_SQL = "(" + HOSTING.map(() => "org LIKE ?").join(" OR ") + ")";
const HOSTING_ARGS = HOSTING.map((name) => "%" + name + "%");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function sameText(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request, pass) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return false;
  try {
    const decoded = atob(header.slice(6));
    return sameText(decoded.slice(decoded.indexOf(":") + 1), pass);
  } catch {
    return false;
  }
}

const PANEL_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'",
};

function plain(status, text, extra = {}) {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", ...extra } });
}

const fmtDate = (ts) => new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " ·");
const fmtTime = (ts) => new Date(ts).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" });

function ago(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

function place(row) {
  const parts = [row.city, row.region].filter(Boolean);
  if (row.country && row.country !== "BR") parts.push(row.country);
  return parts.join(", ") || "—";
}

const shortSite = (site) => String(site || "").replace(/\.(com\.br|com|net|org|br)$/, "");
const isServer = (org) => HOSTING_RE.test(org || "");

const ICON = {
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  ad: '<path d="M3 11l18-5v12L3 14v-3Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5Z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  server: '<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01M6 17h.01"/>',
};
const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const CSS = `
:root{--bg:#f4f6fa;--card:#fff;--ink:#0f172a;--ink2:#334155;--muted:#64748b;--line:#e2e8f0;--line2:#eef2f7;--blue:#1e6fd9;--blueSoft:#e8f1fd;--red:#dc2626;--redSoft:#fef2f2;--redLine:#fecaca;--green:#16a34a;--greenSoft:#ecfdf3;--amber:#b45309;--amberSoft:#fffbeb;--slate:#475569;--slateSoft:#f1f5f9;--navy:#0b1b33}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font:14px/1.5 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit}
.top{background:var(--navy);color:#fff}.top__in{max-width:1240px;margin:0 auto;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:12px}.brand__mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#2f80ed,#1e6fd9);display:grid;place-items:center}
.brand h1{font-size:17px;font-weight:650;margin:0;letter-spacing:-.01em}.brand p{margin:0;font-size:12.5px;color:#9fb0c8}
.top__meta{display:flex;align-items:center;gap:12px;font-size:12.5px;color:#9fb0c8}
.btn{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:var(--card);color:var(--ink2);font:600 13px/1 inherit;text-decoration:none;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
.btn:hover{border-color:#cbd5e1;background:#f8fafc}.btn--dark{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#fff}.btn--dark:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.24)}
.btn--primary{background:var(--red);border-color:var(--red);color:#fff}.btn--primary:hover{background:#b91c1c;border-color:#b91c1c}
.wrap{max-width:1240px;margin:0 auto;padding:24px 24px 56px}
.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:20px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.seg{display:inline-flex;background:var(--slateSoft);border-radius:10px;padding:3px}.seg a{padding:7px 14px;border-radius:8px;font-weight:600;font-size:13px;color:var(--slate);text-decoration:none;white-space:nowrap}
.seg a.on{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(15,23,42,.12)}.seg a:not(.on):hover{color:var(--ink)}
.select{position:relative}.select select{appearance:none;height:38px;padding:0 36px 0 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);font:600 13px inherit;color:var(--ink2);cursor:pointer}
.select:after{content:"";position:absolute;right:14px;top:15px;width:7px;height:7px;border-right:2px solid var(--muted);border-bottom:2px solid var(--muted);transform:rotate(45deg);pointer-events:none}
.toggle{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:13px;color:var(--ink2);text-decoration:none;padding:6px 4px}
.toggle i{width:34px;height:20px;border-radius:999px;background:#cbd5e1;position:relative;transition:background .15s;flex:0 0 auto}.toggle i:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}
.toggle.on i{background:var(--blue)}.toggle.on i:after{left:16px}.spacer{flex:1}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin-bottom:20px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;display:flex;gap:14px;align-items:flex-start;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.kpi__ic{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;flex:0 0 auto}.kpi b{display:block;font-size:24px;line-height:1.1;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.kpi span{font-size:12.5px;color:var(--muted)}
.ic-blue{background:var(--blueSoft);color:var(--blue)}.ic-slate{background:var(--slateSoft);color:var(--slate)}.ic-amber{background:var(--amberSoft);color:var(--amber)}.ic-green{background:var(--greenSoft);color:var(--green)}.ic-red{background:var(--redSoft);color:var(--red)}
.alert{border-radius:14px;padding:16px 18px;margin-bottom:20px;display:flex;gap:14px;align-items:flex-start}
.alert--red{background:var(--redSoft);border:1px solid var(--redLine)}.alert--green{background:var(--greenSoft);border:1px solid #bbf7d0;align-items:center}
.alert__body{flex:1;min-width:0}.alert h2{font-size:14.5px;margin:0 0 2px}.alert p{margin:0;color:var(--ink2);font-size:13px}
.ipchips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 0}.ipchip{display:inline-flex;align-items:center;gap:5px;text-decoration:none;color:#7f1d1d}.ipchips .ipchip--bot code{background:#7f1d1d;color:#fff;border-color:#7f1d1d}.ipchip:hover code{border-color:var(--red)}
.ipchips code{background:#fff;border:1px solid var(--redLine);border-radius:7px;padding:3px 8px;font:12.5px ui-monospace,SFMono-Regular,Consolas,monospace;color:#7f1d1d;word-break:break-all}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:0 1px 2px rgba(15,23,42,.04);overflow:hidden}
.card__head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line)}.card__head h2{font-size:14.5px;margin:0}.card__head span{color:var(--muted);font-size:12.5px}
.tablewrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:900px}
th{font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:650;text-align:left;padding:10px 14px;background:#f8fafc;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:12px 14px;border-bottom:1px solid var(--line2);vertical-align:middle}tbody tr:last-child td{border-bottom:0}
tbody tr.row{cursor:pointer;transition:background .12s}tbody tr.row:hover{background:#f8fbff}tr.row.sus{background:#fffafa}tr.row.sus:hover{background:var(--redSoft)}tr.row.srv{opacity:.62}
th.n,td.n{text-align:right;font-variant-numeric:tabular-nums}
.ip{font:600 13px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--blue);text-decoration:none;word-break:break-all}.ip:hover{text-decoration:underline}
.badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}.badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;line-height:1.5}
.b-red{background:var(--red);color:#fff}.b-slate{background:var(--slateSoft);color:var(--slate)}.b-green{background:var(--greenSoft);color:var(--green)}.b-blue{background:var(--blueSoft);color:var(--blue)}
.loc{font-weight:600;color:var(--ink2)}.org{color:var(--muted);font-size:12.5px;max-width:220px}
.num0{color:#cbd5e1}.contact{display:inline-flex;align-items:center;gap:4px;font-weight:700;color:var(--green)}
.when b{display:block;font-weight:600;color:var(--ink2);font-size:13px}.when span{font-size:12px;color:var(--muted)}
.pills{display:flex;flex-wrap:wrap;gap:4px}.pill{font-size:11.5px;font-weight:600;color:var(--slate);background:var(--slateSoft);border-radius:6px;padding:2px 7px;white-space:nowrap}
.empty{padding:48px 18px;text-align:center;color:var(--muted)}
.back{display:inline-flex;align-items:center;gap:4px;color:var(--blue);font-weight:600;text-decoration:none;margin-bottom:14px}
.profile{display:flex;flex-wrap:wrap;align-items:center;gap:16px;justify-content:space-between;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:20px}
.profile h2{margin:0;font:700 18px ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all}.profile p{margin:4px 0 0;color:var(--muted)}
.mini{display:flex;gap:22px}.mini div{text-align:center}.mini b{display:block;font-size:20px;font-variant-numeric:tabular-nums}.mini span{font-size:12px;color:var(--muted)}
.ev{display:inline-flex;align-items:center;gap:6px;font-weight:600}.ev--view{color:var(--ink2)}.ev--whatsapp{color:var(--green)}.ev--phone{color:var(--blue)}
.path{font:12.5px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--ink2);word-break:break-all}.ua{font-size:12px;color:var(--muted);max-width:340px;word-break:break-word}
.foot{margin-top:18px;color:var(--muted);font-size:12px;text-align:center}
@media (max-width:1100px){.kpis{grid-template-columns:repeat(3,1fr)}}
@media (max-width:640px){.wrap{padding:16px 12px 40px}.top__in{padding:14px 12px}.kpis{grid-template-columns:1fr 1fr;gap:10px}.kpi{padding:12px}.kpi__ic{display:none}.toolbar{gap:8px}.seg a{padding:7px 10px}.spacer{display:none}}
`;

async function admin(context) {
  const { request, env } = context;
  if (!env.ADMIN_PASS) return plain(503, "Painel desativado: configure o segredo ADMIN_PASS no projeto do Cloudflare Pages.");
  if (!authorized(request, env.ADMIN_PASS)) {
    return plain(401, "Acesso restrito", { "WWW-Authenticate": 'Basic realm="Dentalli IPs", charset="UTF-8"' });
  }
  if (!env.DB) return plain(503, "Banco não conectado: adicione o binding D1 com o nome DB no projeto do Cloudflare Pages.");

  await ensureSchema(env.DB);
  context.waitUntil(env.DB.prepare("DELETE FROM hits WHERE ts < ?").bind(Date.now() - KEEP_DAYS * DAY).run().catch(() => {}));

  const url = new URL(request.url);
  const q = url.searchParams;
  const state = {
    days: [1, 7, 30, 90].includes(Number(q.get("d"))) ? Number(q.get("d")) : 7,
    site: (q.get("s") || "").slice(0, 80),
    ads: q.get("ads") === "1",
    servers: q.get("srv") === "1",
    ip: (q.get("ip") || "").slice(0, 64),
  };
  state.since = Date.now() - state.days * DAY;

  const link = (changes = {}) => {
    const next = { ...state, ...changes };
    const params = new URLSearchParams({ d: String(next.days) });
    if (next.site) params.set("s", next.site);
    if (next.ads) params.set("ads", "1");
    if (next.servers) params.set("srv", "1");
    if (next.ip) params.set("ip", next.ip);
    return ADMIN_PATH + "?" + params.toString();
  };

  const siteRows = (await env.DB.prepare("SELECT DISTINCT site FROM hits WHERE site NOT LIKE '%.pages.dev' ORDER BY site").all()).results || [];
  const sites = siteRows.map((r) => r.site).filter(Boolean);

  const content = state.ip ? await detailView(env, state, link) : await summaryView(env, state, link);

  const periods = [
    [1, "24 horas"],
    [7, "7 dias"],
    [30, "30 dias"],
    [90, "90 dias"],
  ];
  const toolbar = `
  <form class="toolbar" method="get" action="${ADMIN_PATH}">
    <nav class="seg" aria-label="Período">${periods.map(([d, label]) => `<a href="${esc(link({ days: d }))}"${d === state.days ? ' class="on"' : ""}>${label}</a>`).join("")}</nav>
    <input type="hidden" name="d" value="${state.days}">${state.ads ? '<input type="hidden" name="ads" value="1">' : ""}${state.servers ? '<input type="hidden" name="srv" value="1">' : ""}${state.ip ? `<input type="hidden" name="ip" value="${esc(state.ip)}">` : ""}
    <label class="select"><select name="s" aria-label="Site" data-autosubmit><option value="">Todos os sites</option>${sites.map((s) => `<option value="${esc(s)}"${s === state.site ? " selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
    ${state.ip ? "" : `<a class="toggle${state.ads ? " on" : ""}" href="${esc(link({ ads: !state.ads }))}"><i></i>Só quem veio de anúncio</a>`}
    <a class="toggle${state.servers ? " on" : ""}" href="${esc(link({ servers: !state.servers }))}"><i></i>Mostrar robôs e servidores</a>
    <span class="spacer"></span>
    <noscript><button class="btn" type="submit">Aplicar</button></noscript>
  </form>`;

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Monitor de cliques · Dentalli</title><style>${CSS}</style></head><body>
<header class="top"><div class="top__in">
  <div class="brand"><span class="brand__mark">${icon("shield", 20)}</span><div><h1>Monitor de cliques</h1><p>Visitas por IP nos sites Dentalli · proteção contra cliques falsos em anúncios</p></div></div>
  <div class="top__meta"><span>Atualizado às ${esc(fmtTime(Date.now()))}</span><a class="btn btn--dark" href="${esc(link())}">${icon("refresh", 16)}Atualizar</a></div>
</div></header>
<main class="wrap">${toolbar}${content}
<p class="foot">Registros guardados por ${KEEP_DAYS} dias · horários de Fortaleza · robôs e servidores (Google, Amazon, Microsoft…) ficam ocultos na lista; se um robô que não é do Google clicar no anúncio, ele aparece no alerta</p>
</main>
<script>
document.querySelectorAll("[data-autosubmit]").forEach(function(s){s.addEventListener("change",function(){s.form.submit()})});
document.querySelectorAll("tr[data-href]").forEach(function(r){r.addEventListener("click",function(e){if(e.target.closest("a"))return;location.href=r.getAttribute("data-href")})});
document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;var t=b.getAttribute("data-copy");var done=function(){var l=b.querySelector("span");var o=l.textContent;l.textContent="Copiado!";setTimeout(function(){l.textContent=o},1800)};if(navigator.clipboard){navigator.clipboard.writeText(t).then(done,function(){})}else{var a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();document.execCommand("copy");a.remove();done()}});
</script></body></html>`;
  return new Response(html, { headers: PANEL_HEADERS });
}

function filters(state, alias = "") {
  const col = (name) => (alias ? alias + "." : "") + name;
  let sql = `${col("ts")} >= ? AND ${col("site")} NOT LIKE '%.pages.dev'`;
  const args = [state.since];
  if (state.site) {
    sql += ` AND ${col("site")} = ?`;
    args.push(state.site);
  }
  if (!state.servers) {
    sql += ` AND (${col("org")} IS NULL OR NOT ${HOSTING_SQL.replaceAll("org", col("org"))})`;
    args.push(...HOSTING_ARGS);
  }
  return { sql, args };
}

// Google LLC com clique de anúncio = o próprio Google revisando a página (não cobra, não bloquear)
const isGoogle = (org) => /google/i.test(org || "");
// Servidor que não é do Google clicando no anúncio = robô gastando verba
const botClicker = (r) => isServer(r.org) && !isGoogle(r.org) && r.ads >= 1;
const suspiciousPerson = (r) => !isServer(r.org) && (r.ads >= 3 || (r.ads >= 2 && !r.wa && !r.tel));
const suspicious = (r) => botClicker(r) || suspiciousPerson(r);

function kpi(iconName, tone, value, label) {
  return `<div class="kpi"><span class="kpi__ic ic-${tone}">${icon(iconName, 20)}</span><div><b>${value}</b><span>${label}</span></div></div>`;
}

async function summaryView(env, state, link) {
  const f = filters(state);
  const totals =
    (await env.DB.prepare(`SELECT SUM(kind='view') views, COUNT(DISTINCT ip) ips, COUNT(DISTINCT gclid) ads, SUM(kind='whatsapp') wa, SUM(kind='phone') tel FROM hits WHERE ${f.sql}`)
      .bind(...f.args)
      .first()) || {};

  const rows =
    (
      await env.DB.prepare(
        `SELECT ip, SUM(kind='view') views, COUNT(DISTINCT gclid) ads, SUM(kind='whatsapp') wa, SUM(kind='phone') tel,
                MIN(ts) first, MAX(ts) last, MAX(city) city, MAX(region) region, MAX(country) country, MAX(org) org,
                GROUP_CONCAT(DISTINCT site) sites
         FROM hits WHERE ${f.sql} GROUP BY ip ${state.ads ? "HAVING ads > 0" : ""}
         ORDER BY ads DESC, last DESC LIMIT 300`
      )
        .bind(...f.args)
        .all()
    ).results || [];

  // Robôs que clicaram no anúncio entram no alerta mesmo com servidores ocultos
  const bf = filters({ ...state, servers: true });
  const botRows =
    (
      await env.DB.prepare(
        `SELECT ip, COUNT(DISTINCT gclid) ads, SUM(kind='whatsapp') wa, SUM(kind='phone') tel, MAX(org) org
         FROM hits WHERE ${bf.sql} AND ${HOSTING_SQL} AND (org NOT LIKE '%Google%') GROUP BY ip HAVING ads > 0 ORDER BY ads DESC LIMIT 100`
      )
        .bind(...bf.args, ...HOSTING_ARGS)
        .all()
    ).results || [];
  const people = rows.filter(suspiciousPerson);
  const bots = botRows.filter(botClicker);
  const sus = [...bots, ...people];
  const contacts = (totals.wa || 0) + (totals.tel || 0);

  const kpis = `<section class="kpis">
    ${kpi("eye", "blue", totals.views || 0, "páginas vistas")}
    ${kpi("users", "slate", totals.ips || 0, "visitantes (IPs)")}
    ${kpi("ad", "amber", totals.ads || 0, "cliques em anúncio")}
    ${kpi("chat", "green", contacts, `contatos · WhatsApp ${totals.wa || 0} · ligar ${totals.tel || 0}`)}
    ${kpi("alert", sus.length ? "red" : "green", sus.length, "IPs suspeitos")}
  </section>`;

  const alert = sus.length
    ? `<section class="alert alert--red"><span class="kpi__ic ic-red">${icon("alert", 20)}</span><div class="alert__body">
        <h2>${sus.length} ${sus.length === 1 ? "IP suspeito" : "IPs suspeitos"} no período</h2>
        <p>${[bots.length ? `<b>${bots.length} ${bots.length === 1 ? "robô clicou" : "robôs clicaram"} no anúncio</b> (servidor que não é do Google).` : "", people.length ? `${people.length} ${people.length === 1 ? "pessoa clicou" : "pessoas clicaram"} 3 ou mais vezes no anúncio, ou 2 ou mais sem chamar no WhatsApp nem ligar.` : ""].filter(Boolean).join(" ")} Copie e cole em Google Ads → Campanha → Configurações → Exclusões de IP.</p>
        <div class="ipchips">${sus.map((r) => `<a class="ipchip${botClicker(r) ? " ipchip--bot" : ""}" href="${esc(link({ ip: r.ip }))}" title="${esc(r.org || "")}">${botClicker(r) ? icon("server", 12) : ""}<code>${esc(r.ip)}</code></a>`).join("")}</div></div>
        <button class="btn btn--primary" type="button" data-copy="${esc(sus.map((r) => r.ip).join("\n"))}">${icon("copy", 16)}<span>Copiar IPs</span></button></section>`
    : `<section class="alert alert--green"><span class="kpi__ic ic-green">${icon("shield", 20)}</span><div class="alert__body"><h2>Nenhum IP suspeito no período</h2><p>Nenhum robô clicou no anúncio e nenhum visitante clicou repetidamente sem entrar em contato.</p></div></section>`;

  const body = rows.length
    ? `<div class="tablewrap"><table><thead><tr><th>Visitante</th><th>Local</th><th>Operadora</th><th class="n">Páginas</th><th class="n">Anúncio</th><th class="n">Contatos</th><th>Última visita</th><th>Sites</th></tr></thead><tbody>
      ${rows
        .map((r) => {
          const isSus = suspicious(r);
          const srv = isServer(r.org);
          const badges = [
            botClicker(r) ? `<span class="badge b-red">${icon("server", 12)}Robô clicando no anúncio</span>` : isSus ? `<span class="badge b-red">${icon("alert", 12)}Suspeito</span>` : "",
            srv && !botClicker(r) ? `<span class="badge b-slate">${icon("server", 12)}${isGoogle(r.org) ? "Google (revisão de anúncio)" : "Servidor / robô"}</span>` : "",
            r.wa || r.tel ? `<span class="badge b-green">Entrou em contato</span>` : "",
          ].join("");
          const contactsCell =
            r.wa || r.tel
              ? [r.wa ? `<span class="contact" title="WhatsApp">${icon("chat", 14)}${r.wa}</span>` : "", r.tel ? `<span class="contact" title="Ligar">${icon("phone", 14)}${r.tel}</span>` : ""].join(" ")
              : '<span class="num0">0</span>';
          const sitesList = String(r.sites || "").split(",").filter(Boolean);
          return `<tr class="row${isSus ? " sus" : ""}${srv ? " srv" : ""}" data-href="${esc(link({ ip: r.ip }))}">
            <td><a class="ip" href="${esc(link({ ip: r.ip }))}">${esc(r.ip)}</a>${badges ? `<div class="badges">${badges}</div>` : ""}</td>
            <td class="loc">${esc(place(r))}</td>
            <td class="org">${esc(r.org || "—")}</td>
            <td class="n">${r.views || '<span class="num0">0</span>'}</td>
            <td class="n">${r.ads ? `<b>${r.ads}</b>` : '<span class="num0">0</span>'}</td>
            <td class="n">${contactsCell}</td>
            <td class="when"><b>${esc(ago(r.last))}</b><span>${esc(fmtDate(r.last))}</span></td>
            <td><div class="pills">${sitesList.map((s) => `<span class="pill" title="${esc(s)}">${esc(shortSite(s))}</span>`).join("")}</div></td></tr>`;
        })
        .join("")}
      </tbody></table></div>`
    : `<div class="empty">Nenhuma visita registrada com esses filtros.</div>`;

  return `${kpis}${alert}<section class="card"><div class="card__head"><h2>Visitantes</h2><span>${rows.length} ${rows.length === 1 ? "IP" : "IPs"} · ordenado por cliques em anúncio</span></div>${body}</section>`;
}

async function detailView(env, state, link) {
  let sql = "ip = ? AND ts >= ? AND site NOT LIKE '%.pages.dev'";
  const args = [state.ip, state.since];
  if (state.site) {
    sql += " AND site = ?";
    args.push(state.site);
  }
  const rows = (await env.DB.prepare(`SELECT * FROM hits WHERE ${sql} ORDER BY ts DESC LIMIT 500`).bind(...args).all()).results || [];
  const views = rows.filter((r) => r.kind === "view").length;
  const ads = new Set(rows.filter((r) => r.gclid).map((r) => r.gclid)).size;
  const wa = rows.filter((r) => r.kind === "whatsapp").length;
  const tel = rows.filter((r) => r.kind === "phone").length;
  const ref = rows[rows.length - 1] || {};
  const srv = isServer(ref.org);
  const isBot = srv && !isGoogle(ref.org) && ads >= 1;
  const isSus = isBot || (!srv && (ads >= 3 || (ads >= 2 && !wa && !tel)));
  const label = { view: ["eye", "Visitou a página"], whatsapp: ["chat", "Clicou no WhatsApp"], phone: ["phone", "Clicou em Ligar"] };

  const profile = `<a class="back" href="${esc(link({ ip: "" }))}">${icon("back", 16)}Voltar para todos os visitantes</a>
  <section class="profile"><div>
    <h2>${esc(state.ip)}</h2>
    <p>${esc([place(ref), ref.org].filter((x) => x && x !== "—").join(" · "))}</p>
    <div class="badges">${isBot ? `<span class="badge b-red">${icon("server", 12)}Robô clicando no anúncio</span>` : isSus ? `<span class="badge b-red">${icon("alert", 12)}Suspeito</span>` : ""}${srv && !isBot ? `<span class="badge b-slate">${icon("server", 12)}${isGoogle(ref.org) ? "Google (revisão de anúncio)" : "Servidor / robô"}</span>` : ""}${wa || tel ? '<span class="badge b-green">Entrou em contato</span>' : ""}</div>
  </div>
  <div class="mini"><div><b>${views}</b><span>páginas</span></div><div><b>${ads}</b><span>anúncio</span></div><div><b>${wa}</b><span>WhatsApp</span></div><div><b>${tel}</b><span>ligar</span></div></div>
  <button class="btn" type="button" data-copy="${esc(state.ip)}">${icon("copy", 16)}<span>Copiar IP</span></button></section>`;

  const table = rows.length
    ? `<div class="tablewrap"><table><thead><tr><th>Quando</th><th>O que fez</th><th>Site</th><th>Página</th><th>Origem</th><th>Navegador</th></tr></thead><tbody>
      ${rows
        .map((r) => {
          const [ic, text] = label[r.kind] || ["eye", r.kind];
          return `<tr><td class="when"><b>${esc(fmtDate(r.ts))}</b><span>${esc(ago(r.ts))}</span></td>
          <td><span class="ev ev--${esc(r.kind)}">${icon(ic, 15)}${esc(text)}</span>${r.ctx ? `<div class="ua">${esc(r.ctx)}</div>` : ""}</td>
          <td><span class="pill">${esc(shortSite(r.site))}</span></td>
          <td class="path">${esc(r.path)}</td>
          <td>${r.gclid ? '<span class="badge b-blue">Google Ads</span>' : r.ref ? `<span class="ua">${esc(r.ref)}</span>` : '<span class="ua">Acesso direto</span>'}</td>
          <td class="ua">${esc(r.ua)}</td></tr>`;
        })
        .join("")}
      </tbody></table></div>`
    : `<div class="empty">Nenhum registro desse IP no período.</div>`;

  return `${profile}<section class="card"><div class="card__head"><h2>Histórico</h2><span>${rows.length} ${rows.length === 1 ? "registro" : "registros"}</span></div>${table}</section>`;
}
