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
// Marca CrioScience (logo embutida para funcionar em qualquer domínio)
const BRAND_LOGO = "data:image/webp;base64,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";
const BRAND_FAVICON = "data:image/png;base64,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";

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
.top{background:#0a0a0b;color:#fff;border-bottom:3px solid transparent;border-image:linear-gradient(90deg,#0b8f70,#2ee6b6 55%,#262626) 1}.top__in{max-width:1240px;margin:0 auto;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:16px}.brand__logo{width:56px;height:56px;border-radius:50%;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 6px 18px rgba(0,0,0,.5);flex:0 0 auto}
.brand__div{width:1px;align-self:stretch;background:rgba(255,255,255,.14)}
.brand__co{display:flex;align-items:center;gap:8px;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#d4d4d8;margin-bottom:2px}.brand__co em{font-style:normal;font-weight:500;letter-spacing:.02em;text-transform:none;color:#2ee6b6}
.brand h1{font-size:19px;font-weight:700;margin:0;letter-spacing:-.01em}.brand p{margin:2px 0 0;font-size:12.5px;color:#a1a1aa}
.top__meta{display:flex;align-items:center;gap:12px;font-size:12.5px;color:#a1a1aa}
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
.alert[data-autohide]{overflow:hidden;transition:opacity .5s ease,max-height .5s ease .3s,margin .5s ease .3s,padding .5s ease .3s;max-height:200px}.alert.is-hiding{opacity:0;max-height:0;margin-bottom:0;padding-top:0;padding-bottom:0;border-width:0}
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
.foot{margin-top:28px;padding-top:18px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;text-align:center}
.credit{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:14px;color:var(--ink2);font-size:12.5px;font-weight:600}.credit img{width:28px;height:28px;border-radius:50%}.credit em{font-style:normal;font-weight:500;color:var(--muted)}
@media (max-width:1100px){.kpis{grid-template-columns:repeat(3,1fr)}}
@media (max-width:640px){.brand__div,.brand p{display:none}.brand__logo{width:46px;height:46px}.brand{gap:12px}.wrap{padding:16px 12px 40px}.top__in{padding:14px 12px}.kpis{grid-template-columns:1fr 1fr;gap:10px}.kpi{padding:12px}.kpi__ic{display:none}.toolbar{gap:8px}.seg a{padding:7px 10px}.spacer{display:none}}
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

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Monitor de cliques · CrioScience</title><link rel="icon" href="${BRAND_FAVICON}"><style>${CSS}</style></head><body>
<header class="top"><div class="top__in">
  <div class="brand"><img class="brand__logo" src="${BRAND_LOGO}" alt="CrioScience" width="56" height="56"><span class="brand__div"></span><div><span class="brand__co">CrioScience <em>Aplicações web</em></span><h1>Monitor de cliques</h1><p>Proteção contra cliques falsos em anúncios · sites Dentalli</p></div></div>
  <div class="top__meta"><span>Atualizado às ${esc(fmtTime(Date.now()))}</span><a class="btn btn--dark" href="${esc(link())}">${icon("refresh", 16)}Atualizar</a></div>
</div></header>
<main class="wrap">${toolbar}${content}
<p class="foot">Registros guardados por ${KEEP_DAYS} dias · horários de Fortaleza · robôs e servidores (Google, Amazon, Microsoft…) ficam ocultos na lista; se um robô que não é do Google clicar no anúncio, ele aparece no alerta</p>
<div class="credit"><img src="${BRAND_LOGO}" alt="" width="28" height="28">CrioScience <em>· Aplicações web</em></div>
</main>
<script>
document.querySelectorAll("[data-autohide]").forEach(function(a){setTimeout(function(){a.classList.add("is-hiding");setTimeout(function(){a.remove()},900)},Number(a.getAttribute("data-autohide"))||5000)});
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
    : `<section class="alert alert--green" data-autohide="5000"><span class="kpi__ic ic-green">${icon("shield", 20)}</span><div class="alert__body"><h2>Nenhum IP suspeito no período</h2><p>Nenhum robô clicou no anúncio e nenhum visitante clicou repetidamente sem entrar em contato.</p></div></section>`;

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
