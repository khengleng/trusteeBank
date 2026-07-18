import { MARK_SVG, FAVICON_LINK } from './logo';
/* Public landing/status page served at `/`. Self-contained, theme-aware. */
export const LANDING_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cambobia Trustee Banking Platform</title>
${FAVICON_LINK}
<style>
:root{--bg:#0b1020;--card:#141a2e;--fg:#e8ecf5;--mut:#93a0bd;--acc:#5b8cff;--ok:#35c98b;--line:#243050}
@media(prefers-color-scheme:light){:root{--bg:#f4f6fb;--card:#fff;--fg:#111827;--mut:#5b6579;--acc:#2f5fe0;--ok:#0a8f5b;--line:#e3e8f2}}
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
.wrap{max-width:920px;margin:0 auto;padding:48px 20px}
.brand{display:flex;align-items:center;gap:14px}.logo{width:40px;height:40px;display:grid;place-items:center;flex-shrink:0}
h1{font-size:26px;margin:22px 0 4px}.sub{color:var(--mut);margin:0 0 26px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:22px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
.card h3{margin:0 0 6px;font-size:15px}.card p{margin:0;color:var(--mut);font-size:14px}
.pill{display:inline-flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:7px 14px;font-size:14px}
.dot{width:9px;height:9px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 4px color-mix(in srgb,var(--ok) 25%,transparent)}
a.btn{display:inline-block;margin-top:8px;background:var(--acc);color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600}
code{background:color-mix(in srgb,var(--fg) 8%,transparent);padding:2px 7px;border-radius:6px;font-size:13px}
.foot{color:var(--mut);font-size:13px;margin-top:32px;border-top:1px solid var(--line);padding-top:18px}
</style></head><body><div class="wrap">
<div class="brand"><div class="logo">${MARK_SVG}</div><div><div style="font-weight:700">Cambobia Trustee Banking Platform</div><div class="sub" style="margin:0">Safeguarding, reserve control &amp; financial assurance</div></div></div>
<h1>Trustee banking &amp; reserve control</h1>
<p class="sub">The authoritative institutional layer that verifies whether real bank money exists, is cleared and safeguarded before PayChain issues digital value or PayKH confirms a payment.</p>
<span class="pill"><span class="dot"></span> Platform operational</span>
<div class="grid">
<div class="card"><h3>PayChain reserve control</h3><p>Funding, cleared-reserve verification, maker-checker signed mint authorization, proof of reserve.</p></div>
<div class="card"><h3>PayKH payment assurance</h3><p>KHQR payment confirmation, duplicate-safe matching, program-fund safeguarding, settlement.</p></div>
<div class="card"><h3>Governance</h3><p>RBAC/ABAC approval matrices, segregation of duties, append-only audit, emergency controls.</p></div>
</div>
<p>Integration APIs: <code>/api/v1/paychain</code> · <code>/api/v1/paykh</code> · <code>/api/v1/bank</code> · signing keys at <code>/.well-known/trustee-signing-keys</code></p>
<p><a class="btn" href="/admin">Trustee Admin Console →</a></p>
<div class="foot">Regulated institutional platform. Real-money production is disabled pending trustee-bank and regulatory approval. © Cambobia.</div>
</div></body></html>`;
